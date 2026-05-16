export const AGENT_ALLOWED_TOOLS = [
  "ima2.get_image_context",
  "ima2.web_search",
  "ima2.generate_image",
] as const;

export type AgentToolName = typeof AGENT_ALLOWED_TOOLS[number];
export type AgentTurnRole = "user" | "assistant" | "tool";
export type AgentTurnStatus = "streaming" | "complete" | "error";

export interface AgentImageInput {
  id?: string | null;
  filename?: string | null;
  url?: string | null;
  thumbUrl?: string | null;
  prompt?: string | null;
  revisedPrompt?: string | null;
  createdAt?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface AgentImageHandle {
  id: string;
  filename: string;
  url: string;
  thumbUrl?: string | null;
  prompt?: string | null;
  revisedPrompt?: string | null;
  createdAt: number;
  width?: number | null;
  height?: number | null;
}

export interface AgentSessionSummary {
  id: string;
  title: string;
  codexThreadId: string | null;
  lastTurnId: string | null;
  lastImageId: string | null;
  imageCount: number;
  compacted: boolean;
  webSearchEnabled: boolean;
  updatedAt: number;
}

export interface AgentTurn {
  id: string;
  role: AgentTurnRole;
  text: string;
  imageIds: string[];
  webFindingIds: string[];
  status: AgentTurnStatus;
  createdAt: number;
}

export interface AgentWorkspacePayload {
  sessions: AgentSessionSummary[];
  turnsBySession: Record<string, AgentTurn[]>;
  imagesById: Record<string, AgentImageHandle>;
  imageIdsBySession: Record<string, string[]>;
  selectedSessionId: string | null;
  currentImageId: string | null;
  allowedTools: readonly AgentToolName[];
  manifest: string | null;
}
