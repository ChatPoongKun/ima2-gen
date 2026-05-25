import { logEvent } from "./logger.js";
import type { ParsedResponsesResult } from "./responsesParse.js";
import type { RouteRuntimeContext } from "./runtimeContext.js";
import { imageToolChoice, tools } from "./responsesTools.js";
import { emptyResponseError } from "./responsesErrors.js";
import { buildUserTextPrompt } from "./oauthProxy.js";

type PostResponses = (args: {
  ctx: RouteRuntimeContext;
  provider: string | undefined;
  scope: string;
  payload: unknown;
  requestId?: string | null;
  maxImages?: number;
  signal?: AbortSignal | null;
}) => Promise<ParsedResponsesResult>;

export async function retryPromptOnlyJsonImage({
  postResponses,
  ctx,
  provider,
  prompt,
  mode,
  model,
  quality,
  size,
  moderation,
  requestId,
  signal,
  initial,
  referencesDroppedOnRetry,
  webSearchDroppedOnRetry,
  reasoningEffort,
}: {
  postResponses: PostResponses;
  ctx: RouteRuntimeContext;
  provider: string | undefined;
  prompt: string | undefined;
  mode: string;
  model: string;
  quality?: string;
  size?: string;
  moderation?: string;
  requestId: string | null;
  signal?: AbortSignal | null;
  initial: ParsedResponsesResult;
  referencesDroppedOnRetry: boolean;
  webSearchDroppedOnRetry: boolean;
  reasoningEffort?: string;
}) {
  if (provider === "api") return null;
  const retryKind = "prompt_only_json_image_tool";
  const retryMeta = {
    retryKind,
    initialEventCount: initial.eventCount,
    initialEventTypes: initial.eventTypes,
    referencesDroppedOnRetry,
    developerPromptDroppedOnRetry: true,
    webSearchDroppedOnRetry,
  };
  logEvent("oauth", "retry_json", { requestId, ...retryMeta });
  let retry: ParsedResponsesResult;
  try {
    retry = await postResponses({
      ctx,
      provider,
      scope: "oauth-fallback",
      requestId,
      maxImages: 1,
      signal,
      payload: {
        model,
        input: [{ role: "user", content: buildUserTextPrompt(prompt, mode, { webSearchEnabled: false }) }],
        tools: tools(false, { quality, size, moderation }),
        tool_choice: imageToolChoice(true),
        reasoning: { effort: reasoningEffort || "low" },
        stream: false,
      },
    });
  } catch (e) {
    if (e && typeof e === "object") Object.assign(e, retryMeta);
    throw e;
  }
  const image = retry.images[0];
  if (image?.b64) {
    logEvent("oauth", "retry_image", { requestId, retryKind, imageChars: image.b64.length });
    return { b64: image.b64, usage: retry.usage, webSearchCalls: initial.webSearchCalls, revisedPrompt: image.revisedPrompt, text: retry.text, ...retryMeta };
  }
  logEvent("oauth", "retry_no_image", {
    requestId,
    retryKind,
    fallbackEventCount: retry.eventCount,
    fallbackImageCallSeen: retry.diagnostics.imageCallSeen,
    fallbackImageResultCount: retry.diagnostics.imageResultCount,
  });
  throw emptyResponseError("No image data received from Responses API fallback", retry, {
    provider,
    model,
    quality,
    size,
    moderation,
    webSearchEnabled: false,
    refsCount: 0,
    inputImageCount: 0,
    promptChars: typeof prompt === "string" ? prompt.length : 0,
    toolTypes: ["image_generation"],
    toolChoiceKind: "image_generation",
    ...retryMeta,
    fallbackEventCount: retry.eventCount,
    fallbackEventTypes: retry.eventTypes,
    fallbackImageCallSeen: retry.diagnostics.imageCallSeen,
    fallbackImageResultCount: retry.diagnostics.imageResultCount,
  });
}
