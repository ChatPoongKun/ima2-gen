import { ulid } from "ulid";
import { getDb } from "./db.js";
import {
  AGENT_ALLOWED_TOOLS,
  type AgentImageHandle,
  type AgentImageInput,
  type AgentSessionSummary,
  type AgentTurn,
  type AgentTurnRole,
  type AgentTurnStatus,
  type AgentWorkspacePayload,
} from "./agentTypes.js";

type AgentSessionRow = {
  id: string;
  title: string;
  codexThreadId: string | null;
  lastTurnId: string | null;
  currentImageId: string | null;
  compacted: number;
  webSearchEnabled: number;
  updatedAt: number;
  imageCount: number;
};

type AgentTurnRow = {
  id: string;
  role: AgentTurnRole;
  text: string;
  status: AgentTurnStatus;
  imageIds: string;
  webFindingIds: string;
  createdAt: number;
};

type AgentImageRow = {
  id: string;
  filename: string;
  url: string;
  thumbUrl: string | null;
  prompt: string | null;
  revisedPrompt: string | null;
  width: number | null;
  height: number | null;
  createdAt: number;
};

type FindingRow = {
  id: string;
  query: string;
  url: string | null;
  title: string | null;
  snippet: string | null;
};
type LockRow = { styleLocks: string; subjectLocks: string };
type ReferenceRow = {
  id: string;
  role: string;
  imageId: string | null;
  filename: string | null;
  url: string | null;
  prompt: string | null;
};

function now() {
  return Date.now();
}

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 10_000) || fallback;
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function jsonStringArray(values: readonly string[] | undefined) {
  return JSON.stringify(Array.isArray(values) ? values.filter(Boolean) : []);
}

function cleanStringArray(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
}

function sessionFromRow(row: AgentSessionRow): AgentSessionSummary {
  return {
    id: row.id,
    title: row.title,
    codexThreadId: row.codexThreadId,
    lastTurnId: row.lastTurnId,
    lastImageId: row.currentImageId,
    imageCount: row.imageCount,
    compacted: row.compacted === 1,
    webSearchEnabled: row.webSearchEnabled === 1,
    updatedAt: row.updatedAt,
  };
}

function turnFromRow(row: AgentTurnRow): AgentTurn {
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    status: row.status,
    imageIds: parseStringArray(row.imageIds),
    webFindingIds: parseStringArray(row.webFindingIds),
    createdAt: row.createdAt,
  };
}

function imageFromRow(row: AgentImageRow): AgentImageHandle {
  return {
    id: row.id,
    filename: row.filename,
    url: row.url,
    thumbUrl: row.thumbUrl,
    prompt: row.prompt,
    revisedPrompt: row.revisedPrompt,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt,
  };
}

export function listAgentSessions() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      s.id,
      s.title,
      s.codex_thread_id AS codexThreadId,
      s.last_turn_id AS lastTurnId,
      s.current_image_id AS currentImageId,
      s.compacted,
      s.web_search_enabled AS webSearchEnabled,
      s.updated_at AS updatedAt,
      COUNT(i.id) AS imageCount
    FROM agent_sessions s
    LEFT JOIN agent_images i ON i.session_id = s.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
  `).all() as AgentSessionRow[];
  return rows.map(sessionFromRow);
}

export function getAgentSession(id: string) {
  return listAgentSessions().find((session) => session.id === id) ?? null;
}

export function createAgentSession(input: {
  title?: unknown;
  currentImage?: AgentImageInput | null;
  webSearchEnabled?: boolean;
} = {}) {
  const db = getDb();
  const id = `as_${ulid()}`;
  const t = now();
  db.prepare(`
    INSERT INTO agent_sessions
      (id, title, codex_thread_id, web_search_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, cleanString(input.title, "New Agent"), `codex_${ulid()}`, input.webSearchEnabled === false ? 0 : 1, t, t);
  if (input.currentImage) importAgentImage(id, input.currentImage);
  return getAgentSession(id)!;
}

export function renameAgentSession(id: string, title: unknown) {
  const cleanTitle = cleanString(title, "New Agent");
  const res = getDb()
    .prepare("UPDATE agent_sessions SET title = ?, updated_at = ? WHERE id = ?")
    .run(cleanTitle, now(), id);
  return res.changes > 0;
}

export function setAgentWebSearch(id: string, enabled: boolean) {
  const res = getDb()
    .prepare("UPDATE agent_sessions SET web_search_enabled = ?, updated_at = ? WHERE id = ?")
    .run(enabled ? 1 : 0, now(), id);
  return res.changes > 0;
}

export function setAgentLocks(id: string, locks: { styleLocks?: unknown; subjectLocks?: unknown }) {
  const res = getDb().prepare(`
    UPDATE agent_sessions
    SET style_locks = COALESCE(?, style_locks),
        subject_locks = COALESCE(?, subject_locks),
        updated_at = ?
    WHERE id = ?
  `).run(
    Array.isArray(locks.styleLocks) ? JSON.stringify(cleanStringArray(locks.styleLocks)) : null,
    Array.isArray(locks.subjectLocks) ? JSON.stringify(cleanStringArray(locks.subjectLocks)) : null,
    now(),
    id,
  );
  return res.changes > 0;
}

export function setAgentCurrentImage(sessionId: string, imageIdValue: unknown) {
  const imageId = cleanString(imageIdValue);
  if (!imageId) return false;
  const image = getDb()
    .prepare("SELECT id FROM agent_images WHERE session_id = ? AND id = ?")
    .get(sessionId, imageId) as { id: string } | undefined;
  if (!image) return false;
  const res = getDb()
    .prepare("UPDATE agent_sessions SET current_image_id = ?, updated_at = ? WHERE id = ?")
    .run(imageId, now(), sessionId);
  return res.changes > 0;
}

export function deleteAgentSession(id: string) {
  const res = getDb().prepare("DELETE FROM agent_sessions WHERE id = ?").run(id);
  return res.changes > 0;
}

export function appendAgentTurn(input: {
  sessionId: string;
  role: AgentTurnRole;
  text?: string;
  status?: AgentTurnStatus;
  imageIds?: string[];
  webFindingIds?: string[];
  raw?: unknown;
}) {
  const id = `at_${ulid()}`;
  const t = now();
  getDb().prepare(`
    INSERT INTO agent_turns
      (id, session_id, role, text, status, image_ids, web_finding_ids, raw, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.sessionId,
    input.role,
    cleanString(input.text, ""),
    input.status ?? "complete",
    jsonStringArray(input.imageIds),
    jsonStringArray(input.webFindingIds),
    JSON.stringify(input.raw ?? {}),
    t,
  );
  touchAgentSession(input.sessionId, { lastTurnId: id });
  return getAgentTurns(input.sessionId).find((turn) => turn.id === id)!;
}

export function getAgentTurns(sessionId: string) {
  const rows = getDb().prepare(`
    SELECT
      id,
      role,
      text,
      status,
      image_ids AS imageIds,
      web_finding_ids AS webFindingIds,
      created_at AS createdAt
    FROM agent_turns
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as AgentTurnRow[];
  return rows.map(turnFromRow);
}

export function importAgentImage(sessionId: string, input: AgentImageInput) {
  const id = cleanString(input.id, `ai_${ulid()}`);
  const filename = cleanString(input.filename, `${id}.png`);
  const url = cleanString(input.url, `/generated/${filename}`);
  const t = typeof input.createdAt === "number" ? input.createdAt : now();
  getDb().prepare(`
    INSERT OR REPLACE INTO agent_images
      (id, session_id, filename, url, thumb_url, prompt, revised_prompt, width, height, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sessionId,
    filename,
    url,
    input.thumbUrl ?? null,
    input.prompt ?? null,
    input.revisedPrompt ?? null,
    input.width ?? null,
    input.height ?? null,
    t,
  );
  touchAgentSession(sessionId, { currentImageId: id });
  return getAgentImages(sessionId).find((image) => image.id === id)!;
}

export function getAgentImages(sessionId: string) {
  const rows = getDb().prepare(`
    SELECT
      id,
      filename,
      url,
      thumb_url AS thumbUrl,
      prompt,
      revised_prompt AS revisedPrompt,
      width,
      height,
      created_at AS createdAt
    FROM agent_images
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as AgentImageRow[];
  return rows.map(imageFromRow);
}

export function recordAgentWebFinding(input: {
  sessionId: string;
  query: string;
  url?: string | null;
  title?: string | null;
  snippet?: string | null;
}) {
  const id = `aw_${ulid()}`;
  getDb().prepare(`
    INSERT INTO agent_web_findings
      (id, session_id, query, url, title, snippet, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.sessionId, input.query, input.url ?? null, input.title ?? null, input.snippet ?? null, now());
  return id;
}

export function getAgentWorkspacePayload(selectedSessionId?: string | null): AgentWorkspacePayload {
  const sessions = listAgentSessions();
  const selected = selectedSessionId && sessions.some((item) => item.id === selectedSessionId)
    ? selectedSessionId
    : sessions[0]?.id ?? null;
  const turnsBySession: Record<string, AgentTurn[]> = {};
  const imagesById: Record<string, AgentImageHandle> = {};
  const imageIdsBySession: Record<string, string[]> = {};
  for (const session of sessions) {
    turnsBySession[session.id] = getAgentTurns(session.id);
    const images = getAgentImages(session.id);
    imageIdsBySession[session.id] = images.map((image) => image.id);
    for (const image of images) imagesById[image.id] = image;
  }
  const currentImageId = selected ? getCurrentImageId(selected) : null;
  return {
    sessions,
    turnsBySession,
    imagesById,
    imageIdsBySession,
    selectedSessionId: selected,
    currentImageId,
    allowedTools: AGENT_ALLOWED_TOOLS,
    manifest: selected ? buildImageContextManifest(selected) : null,
  };
}

export function buildImageContextManifest(sessionId: string) {
  const session = getAgentSession(sessionId);
  if (!session) return "";
  const image = session.lastImageId
    ? getAgentImages(sessionId).find((item) => item.id === session.lastImageId)
    : null;
  const findings = getAgentWebFindings(sessionId);
  const references = getAgentReferences(sessionId);
  const locks = getAgentLocks(sessionId);
  return [
    "<ima2-image-context>",
    `sessionId: ${session.id}`,
    `codexThreadId: ${session.codexThreadId ?? ""}`,
    `compactStatus: ${session.compacted ? "compacted" : "live"}`,
    "currentImage:",
    `  id: ${image?.id ?? ""}`,
    `  path: ${image?.filename ?? ""}`,
    `  prompt: ${image?.prompt ?? ""}`,
    `  revisedPrompt: ${image?.revisedPrompt ?? ""}`,
    "styleLocks:",
    ...locks.styleLocks.map((lock) => `  - ${lock}`),
    "subjectLocks:",
    ...locks.subjectLocks.map((lock) => `  - ${lock}`),
    "references:",
    ...references.map((ref) => `  - id: ${ref.id}\n    role: ${ref.role}\n    imageId: ${ref.imageId ?? ""}\n    url: ${ref.url ?? ""}`),
    "webFindings:",
    ...findings.map((finding) => `  - query: ${finding.query}\n    url: ${finding.url ?? ""}\n    snippet: ${finding.snippet ?? ""}`),
    "constraints:",
    "  - final user-visible output must be an image",
    `  - allowed tools: ${AGENT_ALLOWED_TOOLS.join(", ")}`,
    "</ima2-image-context>",
  ].join("\n");
}

export function compactAgentSession(sessionId: string) {
  getDb()
    .prepare("UPDATE agent_sessions SET compacted = 1, updated_at = ? WHERE id = ?")
    .run(now(), sessionId);
  appendAgentTurn({
    sessionId,
    role: "assistant",
    text: "Image context compacted and manifest retained for resume.",
    status: "complete",
  });
}

export function restartAgentRuntimeSession(sessionId: string, reason: string) {
  const nextThreadId = `codex_${ulid()}`;
  getDb().prepare(`
    UPDATE agent_sessions
    SET codex_thread_id = ?,
        compacted = 0,
        updated_at = ?
    WHERE id = ?
  `).run(nextThreadId, now(), sessionId);
  appendAgentTurn({
    sessionId,
    role: "tool",
    text: `Codex runtime restarted: ${reason}`,
    status: "error",
  });
  return nextThreadId;
}

export function touchAgentSession(sessionId: string, fields: { lastTurnId?: string; currentImageId?: string } = {}) {
  getDb().prepare(`
    UPDATE agent_sessions
    SET last_turn_id = COALESCE(?, last_turn_id),
        current_image_id = COALESCE(?, current_image_id),
        updated_at = ?
    WHERE id = ?
  `).run(fields.lastTurnId ?? null, fields.currentImageId ?? null, now(), sessionId);
}

function getCurrentImageId(sessionId: string) {
  const row = getDb()
    .prepare("SELECT current_image_id AS currentImageId FROM agent_sessions WHERE id = ?")
    .get(sessionId) as { currentImageId?: string | null } | undefined;
  return row?.currentImageId ?? null;
}

function getAgentWebFindings(sessionId: string) {
  return getDb().prepare(`
    SELECT id, query, url, title, snippet
    FROM agent_web_findings
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as FindingRow[];
}

function getAgentReferences(sessionId: string) {
  return getDb().prepare(`
    SELECT
      id,
      role,
      image_id AS imageId,
      filename,
      url,
      prompt
    FROM agent_references
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as ReferenceRow[];
}

function getAgentLocks(sessionId: string) {
  const row = getDb()
    .prepare("SELECT style_locks AS styleLocks, subject_locks AS subjectLocks FROM agent_sessions WHERE id = ?")
    .get(sessionId) as LockRow | undefined;
  return {
    styleLocks: parseStringArray(row?.styleLocks ?? "[]"),
    subjectLocks: parseStringArray(row?.subjectLocks ?? "[]"),
  };
}
