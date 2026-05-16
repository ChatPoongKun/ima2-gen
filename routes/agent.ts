import type { Express, Request, Response } from "express";
import {
  compactAgentSession,
  createAgentSession,
  deleteAgentSession,
  getAgentSession,
  getAgentWorkspacePayload,
  renameAgentSession,
  setAgentCurrentImage,
  setAgentLocks,
  setAgentWebSearch,
} from "../lib/agentStore.js";
import { agentAllowedToolPayload, runAgentTurn } from "../lib/agentRuntime.js";
import { errInfo } from "../lib/errInfo.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

type AgentSessionBody = {
  title?: unknown;
  currentImage?: unknown;
  webSearchEnabled?: unknown;
  currentImageId?: unknown;
  styleLocks?: unknown;
  subjectLocks?: unknown;
};

type AgentTurnBody = {
  prompt?: unknown;
  provider?: unknown;
  quality?: unknown;
  size?: unknown;
  format?: unknown;
  moderation?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
  requestId?: unknown;
};

export function registerAgentRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);

  app.get("/api/agent/tools", (_req: Request, res: Response) => {
    res.json(agentAllowedToolPayload());
  });

  app.get("/api/agent/sessions", (req: Request, res: Response) => {
    const selectedId = typeof req.query.selectedSessionId === "string" ? req.query.selectedSessionId : null;
    res.json(getAgentWorkspacePayload(selectedId));
  });

  app.post("/api/agent/sessions", (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as AgentSessionBody;
      const session = createAgentSession({
        title: body.title,
        currentImage: normalizeCurrentImage(body.currentImage),
        webSearchEnabled: body.webSearchEnabled !== false,
      });
      res.status(201).json(getAgentWorkspacePayload(session.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/agent/sessions/:sessionId", (req: Request<{ sessionId: string }>, res: Response) => {
    const session = getAgentSession(req.params.sessionId);
    if (!session) return sendError(res, notFound(req.params.sessionId));
    res.json(getAgentWorkspacePayload(req.params.sessionId));
  });

  app.patch("/api/agent/sessions/:sessionId", (req: Request<{ sessionId: string }>, res: Response) => {
    try {
      const body = (req.body ?? {}) as AgentSessionBody;
      if (Object.prototype.hasOwnProperty.call(body, "title")) renameAgentSession(req.params.sessionId, body.title);
      if (typeof body.webSearchEnabled === "boolean") setAgentWebSearch(req.params.sessionId, body.webSearchEnabled);
      if (Object.prototype.hasOwnProperty.call(body, "currentImageId")) {
        const ok = setAgentCurrentImage(req.params.sessionId, body.currentImageId);
        if (!ok) throw imageNotFound(req.params.sessionId);
      }
      if (Array.isArray(body.styleLocks) || Array.isArray(body.subjectLocks)) setAgentLocks(req.params.sessionId, body);
      res.json(getAgentWorkspacePayload(req.params.sessionId));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/agent/sessions/:sessionId", (req: Request<{ sessionId: string }>, res: Response) => {
    const ok = deleteAgentSession(req.params.sessionId);
    if (!ok) return sendError(res, notFound(req.params.sessionId));
    res.json(getAgentWorkspacePayload(null));
  });

  app.post("/api/agent/sessions/:sessionId/compact", (req: Request<{ sessionId: string }>, res: Response) => {
    try {
      if (!getAgentSession(req.params.sessionId)) throw notFound(req.params.sessionId);
      compactAgentSession(req.params.sessionId);
      res.json(getAgentWorkspacePayload(req.params.sessionId));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/agent/sessions/:sessionId/manifest", (req: Request<{ sessionId: string }>, res: Response) => {
    const payload = getAgentWorkspacePayload(req.params.sessionId);
    if (!payload.selectedSessionId) return sendError(res, notFound(req.params.sessionId));
    res.type("application/xml").send(payload.manifest ?? "");
  });

  app.post("/api/agent/sessions/:sessionId/turns", async (req: Request<{ sessionId: string }>, res: Response) => {
    try {
      const body = (req.body ?? {}) as AgentTurnBody;
      const prompt = cleanPrompt(body.prompt);
      await runAgentTurn(ctx, req.params.sessionId, prompt, {
        provider: cleanOption(body.provider),
        quality: cleanOption(body.quality),
        size: cleanOption(body.size),
        format: cleanOption(body.format),
        moderation: cleanOption(body.moderation),
        model: cleanOption(body.model),
        reasoningEffort: cleanOption(body.reasoningEffort),
        requestId: cleanOption(body.requestId),
      });
      res.json(getAgentWorkspacePayload(req.params.sessionId));
    } catch (error) {
      sendError(res, error);
    }
  });
}

function normalizeCurrentImage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return {
    id: cleanOption(item.id),
    filename: cleanOption(item.filename),
    url: cleanOption(item.url) ?? cleanOption(item.image),
    thumbUrl: cleanOption(item.thumbUrl) ?? cleanOption(item.thumb),
    prompt: cleanOption(item.prompt) ?? cleanOption(item.userPrompt),
    revisedPrompt: cleanOption(item.revisedPrompt),
    createdAt: typeof item.createdAt === "number" ? item.createdAt : null,
  };
}

function cleanOption(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanPrompt(value: unknown) {
  const prompt = cleanOption(value);
  if (prompt) return prompt;
  const err = new Error("Prompt is required") as Error & { code?: string; status?: number };
  err.code = "AGENT_PROMPT_REQUIRED";
  err.status = 400;
  throw err;
}

function sendError(res: Response, error: unknown) {
  const err = errInfo(error);
  res.status(err.status || 500).json({
    error: { code: err.code || "AGENT_ERROR", message: err.message },
    code: err.code || "AGENT_ERROR",
  });
}

function notFound(sessionId: string) {
  const err = new Error(`Agent session not found: ${sessionId}`) as Error & { code?: string; status?: number };
  err.code = "AGENT_SESSION_NOT_FOUND";
  err.status = 404;
  return err;
}

function imageNotFound(sessionId: string) {
  const err = new Error(`Agent image not found in session: ${sessionId}`) as Error & { code?: string; status?: number };
  err.code = "AGENT_IMAGE_NOT_FOUND";
  err.status = 404;
  return err;
}
