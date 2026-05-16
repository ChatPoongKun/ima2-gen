import { useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import { createAgentWorkspaceSeed } from "../../lib/agentApi";
import { useAppStore } from "../../store/useAppStore";
import { useAgentWorkspaceLayout } from "../../hooks/useAgentWorkspaceLayout";
import { AgentChatPane } from "./AgentChatPane";
import { AgentImagePane } from "./AgentImagePane";
import { AgentImageSheet } from "./AgentImageSheet";
import { AgentSessionDrawer } from "./AgentSessionDrawer";
import { AgentSessionRail } from "./AgentSessionRail";
import { AgentSessionSidebar } from "./AgentSessionSidebar";
import { AgentTopBar } from "./AgentTopBar";
import type { AgentContextTab, AgentRuntimeStatus, AgentSessionSummary, AgentTurn } from "./agentTypes";

function newSession(title: string): AgentSessionSummary {
  return {
    id: `agent-session-${Date.now()}`,
    title,
    codexThreadId: null,
    lastImageId: null,
    imageCount: 0,
    compacted: false,
    webSearchEnabled: true,
    updatedAt: Date.now(),
  };
}

function turnId(role: AgentTurn["role"]): string {
  return `agent-turn-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function AgentWorkspace() {
  const { t } = useI18n();
  const layoutMode = useAgentWorkspaceLayout();
  const currentGeneratedImage = useAppStore((s) => s.currentImage);
  const seed = useMemo(() => createAgentWorkspaceSeed(currentGeneratedImage), [currentGeneratedImage]);
  const [sessions, setSessions] = useState(seed.sessions);
  const [turnsBySession, setTurnsBySession] = useState(seed.turnsBySession);
  const [selectedSessionId, setSelectedSessionId] = useState(seed.selectedSessionId);
  const [currentImageId] = useState(seed.currentImageId);
  const [imagesById] = useState(seed.imagesById);
  const [activeTab, setActiveTab] = useState<AgentContextTab>("image");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [imageSheetOpen, setImageSheetOpen] = useState(false);
  const [runtimeStatus] = useState<AgentRuntimeStatus>("ready");

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const currentImage = currentImageId ? imagesById[currentImageId] ?? null : null;
  const images = Object.values(imagesById);
  const turns = selectedSession ? turnsBySession[selectedSession.id] ?? [] : [];
  const showRail = layoutMode === "desktop-rail";
  const showSidebar = layoutMode === "desktop-three-pane";
  const showInlineImage = layoutMode !== "mobile-chat-image-sheet";

  const selectSession = (id: string) => {
    setSelectedSessionId(id);
    setDrawerOpen(false);
  };
  const createSession = () => {
    const session = newSession(t("agent.newSession"));
    setSessions((items) => [session, ...items]);
    setTurnsBySession((items) => ({ ...items, [session.id]: [] }));
    setSelectedSessionId(session.id);
  };
  const renameSession = (id: string) => {
    const session = sessions.find((item) => item.id === id);
    const title = window.prompt(t("agent.renameSession"), session?.title ?? "");
    if (!title?.trim()) return;
    setSessions((items) => items.map((item) => item.id === id ? { ...item, title: title.trim() } : item));
  };
  const deleteSession = (id: string) => {
    const session = sessions.find((item) => item.id === id);
    if (!session || !window.confirm(t("agent.deleteConfirm", { title: session.title }))) return;
    const nextSessions = sessions.filter((item) => item.id !== id);
    setSessions(nextSessions);
    setSelectedSessionId(nextSessions[0]?.id ?? "");
  };
  const setSessionWebSearch = (enabled: boolean) => {
    setSessions((items) => items.map((item) => item.id === selectedSessionId ? { ...item, webSearchEnabled: enabled } : item));
  };
  const sendMessage = (text: string) => {
    const userTurn: AgentTurn = { id: turnId("user"), role: "user", text, status: "complete" };
    const toolTurn: AgentTurn = { id: turnId("tool"), role: "tool", text: "ima2.generate_image", status: "complete" };
    setTurnsBySession((items) => ({ ...items, [selectedSessionId]: [...(items[selectedSessionId] ?? []), userTurn, toolTurn] }));
    setSessions((items) => items.map((item) => item.id === selectedSessionId ? { ...item, updatedAt: Date.now() } : item));
  };

  return (
    <main className={`agent-workspace agent-workspace--${layoutMode}`} data-layout={layoutMode} aria-label={t("agent.workspace")}>
      {!showSidebar ? <AgentTopBar layoutMode={layoutMode} session={selectedSession} currentImage={currentImage} onOpenSessions={() => setDrawerOpen(true)} onOpenImage={() => setImageSheetOpen(true)} /> : null}
      <div className="agent-workspace__body">
        {showSidebar ? <AgentSessionSidebar sessions={sessions} selectedId={selectedSessionId} imagesById={imagesById} onCreate={createSession} onSelect={selectSession} onRename={renameSession} onDelete={deleteSession} /> : null}
        {showRail ? <AgentSessionRail sessions={sessions} selectedId={selectedSessionId} imagesById={imagesById} onCreate={createSession} onSelect={selectSession} onOpenDrawer={() => setDrawerOpen(true)} /> : null}
        <AgentChatPane session={selectedSession} turns={turns} imagesById={imagesById} runtimeStatus={runtimeStatus} onWebSearchChange={setSessionWebSearch} onSend={sendMessage} />
        {showInlineImage ? <AgentImagePane currentImage={currentImage} images={images} activeTab={activeTab} onTabChange={setActiveTab} /> : null}
      </div>
      <AgentSessionDrawer open={drawerOpen} sessions={sessions} selectedId={selectedSessionId} imagesById={imagesById} onClose={() => setDrawerOpen(false)} onCreate={createSession} onSelect={selectSession} onRename={renameSession} onDelete={deleteSession} />
      <AgentImageSheet open={imageSheetOpen} currentImage={currentImage} images={images} activeTab={activeTab} onTabChange={setActiveTab} onClose={() => setImageSheetOpen(false)} />
    </main>
  );
}
