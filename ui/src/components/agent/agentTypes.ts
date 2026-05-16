export type AgentLayoutMode =
  | "desktop-three-pane"
  | "desktop-rail"
  | "tablet-stacked"
  | "mobile-chat-image-sheet";

export type AgentRuntimeStatus = "ready" | "generating" | "reconnecting";

export type AgentSessionSummary = {
  id: string;
  title: string;
  codexThreadId?: string | null;
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
};

export type AgentImageHandle = {
  id: string;
  filename: string;
  url: string;
  thumbUrl?: string;
  prompt?: string | null;
  revisedPrompt?: string | null;
  createdAt: number;
};

export type AgentContextTab = "image" | "refs" | "web" | "memory";

export type AgentWorkspaceSeed = {
  sessions: AgentSessionSummary[];
  turnsBySession: Record<string, AgentTurn[]>;
  imagesById: Record<string, AgentImageHandle>;
  selectedSessionId: string;
  currentImageId: string | null;
};
