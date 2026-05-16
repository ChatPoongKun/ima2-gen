import type { GenerateItem } from "../types";
import type {
  AgentImageHandle,
  AgentWorkspacePayload,
} from "../components/agent/agentTypes";

type AgentSessionPatch = {
  title?: string;
  webSearchEnabled?: boolean;
  currentImageId?: string;
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string | { message?: string; code?: string };
    code?: string;
  };
  if (!res.ok) {
    const raw = data.error;
    const message = typeof raw === "string" ? raw : raw?.message ?? `Request failed: ${res.status}`;
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = typeof raw === "object" ? raw?.code : data.code;
    throw err;
  }
  return data;
}

function currentImageUrl(item: GenerateItem) {
  if (item.filename) return `/generated/${item.filename}`;
  if (typeof item.url === "string" && item.url) return item.url;
  if (typeof item.thumb === "string" && item.thumb) return item.thumb;
  return null;
}

export function imageHandleFromCurrent(item: GenerateItem): AgentImageHandle | null {
  const url = currentImageUrl(item);
  if (!url) return null;
  const filename = item.filename ?? item.canvasEditableFilename ?? "current-image.png";
  return {
    id: `current-${filename}`,
    filename,
    url,
    thumbUrl: item.thumb ?? url,
    prompt: item.prompt ?? item.userPrompt ?? null,
    revisedPrompt: item.revisedPrompt ?? null,
    createdAt: item.createdAt ?? Date.now(),
  };
}

export async function getAgentWorkspace(selectedSessionId?: string | null) {
  const query = selectedSessionId ? `?selectedSessionId=${encodeURIComponent(selectedSessionId)}` : "";
  return jsonFetch<AgentWorkspacePayload>(`/api/agent/sessions${query}`);
}

export async function createAgentSession(input: {
  title: string;
  currentImage?: GenerateItem | null;
  webSearchEnabled?: boolean;
}) {
  const currentImage = input.currentImage ? imageHandleFromCurrent(input.currentImage) : null;
  return jsonFetch<AgentWorkspacePayload>("/api/agent/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      currentImage,
      webSearchEnabled: input.webSearchEnabled ?? true,
    }),
  });
}

export async function updateAgentSession(sessionId: string, patch: AgentSessionPatch) {
  return jsonFetch<AgentWorkspacePayload>(`/api/agent/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteAgentSession(sessionId: string) {
  return jsonFetch<AgentWorkspacePayload>(`/api/agent/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

export async function sendAgentTurn(sessionId: string, prompt: string) {
  return jsonFetch<AgentWorkspacePayload>(`/api/agent/sessions/${encodeURIComponent(sessionId)}/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

export async function compactAgentSession(sessionId: string) {
  return jsonFetch<AgentWorkspacePayload>(`/api/agent/sessions/${encodeURIComponent(sessionId)}/compact`, {
    method: "POST",
  });
}
