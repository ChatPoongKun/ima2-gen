export type AgentLayoutMode =
  | "desktop-three-pane"
  | "desktop-rail"
  | "tablet-stacked"
  | "mobile-chat-image-sheet";

export type AgentRuntimeStatus = "ready" | "generating" | "reconnecting";
export type AgentToolName = "ima2.get_image_context" | "ima2.web_search" | "ima2.generate_image";

export type AgentSessionSummary = {
  id: string;
  title: string;
  codexThreadId?: string | null;
  lastTurnId?: string | null;
  lastImageId?: string | null;
  imageCount: number;
  compacted: boolean;
  webSearchEnabled: boolean;
  updatedAt: number;
};

export type AgentTurn = {
  id: string;
  role: "user" | "assistant" | "tool";
  text: string;
  imageIds?: string[];
  webFindingIds?: string[];
  status?: "streaming" | "complete" | "error";
  createdAt?: number;
};

export type AgentImageHandle = {
  id: string;
  filename: string;
  url: string;
  thumbUrl?: string;
  prompt?: string | null;
  revisedPrompt?: string | null;
  createdAt: number;
  width?: number | null;
  height?: number | null;
};

export type AgentContextTab = "image" | "refs" | "web" | "memory";

export type AgentWorkspaceSeed = {
  sessions: AgentSessionSummary[];
  turnsBySession: Record<string, AgentTurn[]>;
  imagesById: Record<string, AgentImageHandle>;
  imageIdsBySession: Record<string, string[]>;
  selectedSessionId: string;
  currentImageId: string | null;
  allowedTools?: AgentToolName[];
  manifest?: string | null;
};

export type AgentWorkspacePayload = Omit<AgentWorkspaceSeed, "selectedSessionId"> & {
  selectedSessionId: string | null;
  allowedTools: AgentToolName[];
  manifest: string | null;
};
