import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ulid } from "ulid";
import { embedImageMetadataBestEffort } from "./imageMetadataStore.js";
import { invalidateHistoryIndex } from "./historyIndex.js";
import { logEvent } from "./logger.js";
import { generateViaResponses } from "./responsesImageAdapter.js";
import {
  appendAgentTurn,
  buildImageContextManifest,
  getAgentSession,
  importAgentImage,
  recordAgentWebFinding,
  restartAgentRuntimeSession,
} from "./agentStore.js";
import { AGENT_ALLOWED_TOOLS, type AgentToolName } from "./agentTypes.js";
import { errInfo } from "./errInfo.js";
import { type RuntimeContext } from "./runtimeContext.js";

type AgentRunOptions = {
  provider?: string;
  quality?: string;
  size?: string;
  format?: string;
  moderation?: string;
  model?: string;
  reasoningEffort?: string;
  requestId?: string;
  signal?: AbortSignal | null;
};

export function assertAgentAllowedTools(tools: readonly string[]) {
  const allowed = new Set<string>(AGENT_ALLOWED_TOOLS);
  const denied = tools.filter((tool) => !allowed.has(tool));
  if (denied.length > 0) {
    const err = new Error(`Agent tool is not allowed: ${denied.join(", ")}`) as Error & {
      code?: string;
      status?: number;
      deniedTools?: string[];
    };
    err.code = "AGENT_TOOL_NOT_ALLOWED";
    err.status = 403;
    err.deniedTools = denied;
    throw err;
  }
}

export function agentAllowedToolPayload() {
  return { tools: [...AGENT_ALLOWED_TOOLS] };
}

export async function runAgentTurn(ctx: RuntimeContext, sessionId: string, prompt: string, options: AgentRunOptions = {}) {
  const session = getAgentSession(sessionId);
  if (!session) throw notFound(sessionId);
  const enabledTools: AgentToolName[] = session.webSearchEnabled
    ? [...AGENT_ALLOWED_TOOLS]
    : ["ima2.get_image_context", "ima2.generate_image"];
  assertAgentAllowedTools(enabledTools);
  appendAgentTurn({ sessionId, role: "user", text: prompt, status: "complete" });
  appendAgentTurn({ sessionId, role: "tool", text: "ima2.get_image_context", status: "complete" });
  const manifest = buildImageContextManifest(sessionId);
  const result = await runGeneratorWithRuntimeRecovery(ctx, sessionId, prompt, manifest, session.webSearchEnabled, options);
  const findingIds = recordSearchFindings(sessionId, prompt, result.webSearchCalls);
  appendAgentTurn({
    sessionId,
    role: "tool",
    text: session.webSearchEnabled ? "ima2.web_search + ima2.generate_image" : "ima2.generate_image",
    imageIds: [result.image.id],
    webFindingIds: findingIds,
    status: "complete",
  });
  return appendAgentTurn({
    sessionId,
    role: "assistant",
    text: "Generated an image artifact.",
    imageIds: [result.image.id],
    webFindingIds: findingIds,
    status: "complete",
  });
}

async function runGeneratorWithRuntimeRecovery(
  ctx: RuntimeContext,
  sessionId: string,
  prompt: string,
  manifest: string,
  webSearchEnabled: boolean,
  options: AgentRunOptions,
) {
  try {
    return await generateAgentImageWithRetry(ctx, sessionId, prompt, manifest, webSearchEnabled, options);
  } catch (error) {
    const err = errInfo(error);
    if (isRuntimeRestartableError(error)) {
      restartAgentRuntimeSession(sessionId, err.code || err.message);
    }
    appendAgentTurn({ sessionId, role: "assistant", text: err.message, status: "error" });
    throw error;
  }
}

export function isRuntimeRestartableError(error: unknown) {
  const err = errInfo(error);
  const code = err.code || "";
  return (
    code.includes("AUTH") ||
    code.includes("TIMEOUT") ||
    code.includes("PROTOCOL") ||
    err.message.toLowerCase().includes("protocol wedge")
  );
}

async function generateAgentImageWithRetry(
  ctx: RuntimeContext,
  sessionId: string,
  prompt: string,
  manifest: string,
  webSearchEnabled: boolean,
  options: AgentRunOptions,
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const forcedPrompt = attempt === 0 ? prompt : forceImagePrompt(prompt);
      const result = await generateAgentImage(ctx, sessionId, forcedPrompt, manifest, webSearchEnabled, options);
      if (result.image) return result;
    } catch (error) {
      lastError = error;
      if (!isTextOnlyResult(error) || attempt === 1) break;
      appendAgentTurn({
        sessionId,
        role: "tool",
        text: "ima2.generate_image retry: text-only result rejected",
        status: "error",
      });
    }
  }
  throw textOnlyError(lastError);
}

async function generateAgentImage(
  ctx: RuntimeContext,
  sessionId: string,
  prompt: string,
  manifest: string,
  webSearchEnabled: boolean,
  options: AgentRunOptions,
) {
  const requestId = options.requestId ?? `agent_${ulid()}`;
  const format = options.format ?? "png";
  const response = await generateViaResponses(
    options.provider ?? "oauth",
    `${manifest}\n\nUser request:\n${prompt}`,
    options.quality ?? "medium",
    options.size ?? "1024x1024",
    options.moderation ?? "low",
    [],
    requestId,
    "auto",
    ctx,
    {
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      webSearchEnabled,
      signal: options.signal,
    },
  );
  const image = await persistAgentImage(ctx, sessionId, prompt, format, requestId, response);
  return { image, webSearchCalls: response.webSearchCalls || 0 };
}

async function persistAgentImage(
  ctx: RuntimeContext,
  sessionId: string,
  prompt: string,
  format: string,
  requestId: string,
  response: { b64: string; revisedPrompt?: string | null; usage?: unknown; webSearchCalls?: number },
) {
  await mkdir(ctx.config.storage.generatedDir, { recursive: true });
  const rand = randomBytes(ctx.config.ids.generatedHexBytes).toString("hex");
  const filename = `${Date.now()}_${rand}_agent.${format}`;
  const meta = {
    kind: "agent",
    requestId,
    sessionId,
    prompt,
    userPrompt: prompt,
    revisedPrompt: response.revisedPrompt ?? null,
    provider: "agent",
    createdAt: Date.now(),
    usage: response.usage ?? null,
    webSearchCalls: response.webSearchCalls ?? 0,
  };
  const embedded = await embedImageMetadataBestEffort(Buffer.from(response.b64, "base64"), format, meta, {
    version: ctx.packageVersion,
  });
  await writeFile(join(ctx.config.storage.generatedDir, filename), embedded.buffer);
  await writeFile(join(ctx.config.storage.generatedDir, `${filename}.json`), JSON.stringify(meta)).catch(() => {});
  invalidateHistoryIndex();
  logEvent("agent", "saved", { requestId, sessionId, filename });
  return importAgentImage(sessionId, {
    id: `ai_${ulid()}`,
    filename,
    url: `/generated/${filename}`,
    prompt,
    revisedPrompt: response.revisedPrompt ?? null,
    createdAt: Date.now(),
  });
}

function recordSearchFindings(sessionId: string, prompt: string, count: number) {
  if (!count) return [];
  return [
    recordAgentWebFinding({
      sessionId,
      query: prompt,
      title: "Responses web_search",
      snippet: `Responses reported ${count} web search call${count === 1 ? "" : "s"}.`,
    }),
  ];
}

function forceImagePrompt(prompt: string) {
  return [
    "The previous turn did not return an image artifact.",
    "Return a final image using ima2.generate_image/image_generation now.",
    `User request: ${prompt}`,
  ].join("\n");
}

function isTextOnlyResult(error: unknown) {
  const err = errInfo(error);
  return err.code === "EMPTY_RESPONSE" || err.message.includes("No image data");
}

function textOnlyError(cause: unknown) {
  const err = new Error("Agent result did not include an image artifact.") as Error & {
    code?: string;
    status?: number;
    cause?: unknown;
  };
  err.code = "AGENT_TEXT_ONLY_RESULT";
  err.status = 422;
  err.cause = cause;
  return err;
}

function notFound(sessionId: string) {
  const err = new Error(`Agent session not found: ${sessionId}`) as Error & { code?: string; status?: number };
  err.code = "AGENT_SESSION_NOT_FOUND";
  err.status = 404;
  return err;
}
