import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import {
  createAgentSession,
  deleteAgentSession,
  getAgentWorkspace,
  sendAgentTurn,
  updateAgentSession,
} from "../../lib/agentApi";
import { useAppStore } from "../../store/useAppStore";
import { useAgentWorkspaceLayout } from "../../hooks/useAgentWorkspaceLayout";
import { AgentChatPane } from "./AgentChatPane";
import { AgentImagePane } from "./AgentImagePane";
import { AgentImageSheet } from "./AgentImageSheet";
import { AgentSessionDrawer } from "./AgentSessionDrawer";
import { AgentSessionRail } from "./AgentSessionRail";
import { AgentSessionSidebar } from "./AgentSessionSidebar";
import { AgentTopBar } from "./AgentTopBar";
import type { AgentContextTab, AgentRuntimeStatus, AgentTurn, AgentWorkspacePayload } from "./agentTypes";

const LOCAL_TURN_PREFIX = "agent-local-";
let localTurnSequence = 0;

function emptyWorkspace(): AgentWorkspacePayload {
  return {
    sessions: [],
    turnsBySession: {},
    imagesById: {},
    selectedSessionId: null,
    currentImageId: null,
    allowedTools: ["ima2.get_image_context", "ima2.web_search", "ima2.generate_image"],
    manifest: null,
  };
}

function nextLocalTurnId(kind: string): string {
  localTurnSequence += 1;
  return `${LOCAL_TURN_PREFIX}${kind}-${Date.now()}-${localTurnSequence}`;
}

function isLocalTurn(turn: AgentTurn): boolean {
  return turn.id.startsWith(LOCAL_TURN_PREFIX);
}

function localUserTurn(text: string, createdAt: number): AgentTurn {
  return {
    id: nextLocalTurnId("user"),
    role: "user",
    text,
    imageIds: [],
    webFindingIds: [],
    status: "complete",
    createdAt,
  };
}

function localPendingTurn(text: string, createdAt: number): AgentTurn {
  return {
    id: nextLocalTurnId("pending"),
    role: "assistant",
    text,
    imageIds: [],
    webFindingIds: [],
    status: "streaming",
    createdAt,
  };
}

function localErrorTurn(text: string): AgentTurn {
  return {
    id: nextLocalTurnId("error"),
    role: "assistant",
    text,
    imageIds: [],
    webFindingIds: [],
    status: "error",
    createdAt: Date.now(),
  };
}

function appendTurns(current: AgentWorkspacePayload, sessionId: string, turns: AgentTurn[]): AgentWorkspacePayload {
  return {
    ...current,
    turnsBySession: {
      ...current.turnsBySession,
      [sessionId]: [...(current.turnsBySession[sessionId] ?? []), ...turns],
    },
  };
}

function replacePendingWithError(
  current: AgentWorkspacePayload,
  sessionId: string,
  pendingTurnId: string,
  message: string,
): AgentWorkspacePayload {
  const turns = current.turnsBySession[sessionId] ?? [];
  return {
    ...current,
    turnsBySession: {
      ...current.turnsBySession,
      [sessionId]: [...turns.filter((turn) => turn.id !== pendingTurnId), localErrorTurn(message)],
    },
  };
}

function mergeWorkspaceWithLocalTurns(
  current: AgentWorkspacePayload,
  incoming: AgentWorkspacePayload,
  settledLocalIds: Set<string>,
): AgentWorkspacePayload {
  const turnsBySession = { ...incoming.turnsBySession };
  for (const [sessionId, currentTurns] of Object.entries(current.turnsBySession)) {
    const incomingTurns = turnsBySession[sessionId] ?? [];
    const incomingIds = new Set(incomingTurns.map((turn) => turn.id));
    const newestIncomingCreatedAt = Math.max(0, ...incomingTurns.map((turn) => turn.createdAt ?? 0));
    const carryTurns = currentTurns.filter((turn) => {
      if (settledLocalIds.has(turn.id) || incomingIds.has(turn.id)) return false;
      if (isLocalTurn(turn) || turn.status === "streaming") return true;
      return (turn.createdAt ?? 0) >= newestIncomingCreatedAt;
    });
    if (carryTurns.length > 0) turnsBySession[sessionId] = [...incomingTurns, ...carryTurns];
  }
  return { ...incoming, turnsBySession };
}

export function AgentWorkspace() {
  const { t } = useI18n();
  const layoutMode = useAgentWorkspaceLayout();
  const currentGeneratedImage = useAppStore((s) => s.currentImage);
  const bootstrapped = useRef(false);
  const pendingTurnsRef = useRef(0);
  const [workspace, setWorkspace] = useState<AgentWorkspacePayload>(() => emptyWorkspace());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AgentContextTab>("image");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [imageSheetOpen, setImageSheetOpen] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<AgentRuntimeStatus>("reconnecting");

  const applyWorkspace = useCallback((payload: AgentWorkspacePayload) => {
    setWorkspace(payload);
    setSelectedSessionId(payload.selectedSessionId);
  }, []);

  const applyWorkspaceWithLocalTurns = useCallback((payload: AgentWorkspacePayload, settledLocalIds: Set<string>) => {
    setWorkspace((current) => mergeWorkspaceWithLocalTurns(current, payload, settledLocalIds));
    setSelectedSessionId(payload.selectedSessionId);
  }, []);

  const beginGeneration = () => {
    pendingTurnsRef.current += 1;
    setRuntimeStatus("generating");
  };

  const finishGeneration = () => {
    pendingTurnsRef.current = Math.max(0, pendingTurnsRef.current - 1);
    if (pendingTurnsRef.current === 0) setRuntimeStatus("ready");
  };

  const loadWorkspace = useCallback(async (preferredId?: string | null) => {
    setRuntimeStatus("reconnecting");
    const loaded = await getAgentWorkspace(preferredId);
    if (loaded.sessions.length > 0) {
      applyWorkspace(loaded);
      setRuntimeStatus("ready");
      return;
    }
    const created = await createAgentSession({
      title: t("agent.newSession"),
      currentImage: currentGeneratedImage,
    });
    applyWorkspace(created);
    setRuntimeStatus("ready");
  }, [applyWorkspace, currentGeneratedImage, t]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void loadWorkspace().catch((error) => {
      console.error(error);
      setRuntimeStatus("ready");
    });
  }, [loadWorkspace]);

  const selectedSession = workspace.sessions.find((session) => session.id === selectedSessionId) ?? null;
  const currentImage = workspace.currentImageId ? workspace.imagesById[workspace.currentImageId] ?? null : null;
  const images = Object.values(workspace.imagesById);
  const turns = selectedSession ? workspace.turnsBySession[selectedSession.id] ?? [] : [];
  const showRail = layoutMode === "desktop-rail";
  const showSidebar = layoutMode === "desktop-three-pane";
  const showInlineImage = layoutMode !== "mobile-chat-image-sheet";

  const selectSession = (id: string) => {
    setDrawerOpen(false);
    void loadWorkspace(id).catch(console.error);
  };
  const createSession = () => {
    void createAgentSession({ title: t("agent.newSession"), currentImage: null })
      .then(applyWorkspace)
      .catch(console.error);
  };
  const renameSession = (id: string) => {
    const session = workspace.sessions.find((item) => item.id === id);
    const title = window.prompt(t("agent.renameSession"), session?.title ?? "");
    if (!title?.trim()) return;
    void updateAgentSession(id, { title: title.trim() }).then(applyWorkspace).catch(console.error);
  };
  const deleteSession = (id: string) => {
    const session = workspace.sessions.find((item) => item.id === id);
    if (!session || !window.confirm(t("agent.deleteConfirm", { title: session.title }))) return;
    void deleteAgentSession(id).then(applyWorkspace).catch(console.error);
  };
  const setSessionWebSearch = (enabled: boolean) => {
    if (!selectedSessionId) return;
    void updateAgentSession(selectedSessionId, { webSearchEnabled: enabled }).then(applyWorkspace).catch(console.error);
  };
  const sendMessage = (text: string) => {
    if (!selectedSessionId) return;
    const sessionId = selectedSessionId;
    const createdAt = Date.now();
    const userTurn = localUserTurn(text, createdAt);
    const pendingTurn = localPendingTurn(t("agent.pending"), createdAt + 1);
    const settledLocalIds = new Set([userTurn.id, pendingTurn.id]);

    beginGeneration();
    setWorkspace((current) => appendTurns(current, sessionId, [userTurn, pendingTurn]));
    void sendAgentTurn(sessionId, text)
      .then((payload) => applyWorkspaceWithLocalTurns(payload, settledLocalIds))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setWorkspace((current) => replacePendingWithError(current, sessionId, pendingTurn.id, message));
      })
      .finally(finishGeneration);
  };

  return (
    <main className={`agent-workspace agent-workspace--${layoutMode}`} data-layout={layoutMode} aria-label={t("agent.workspace")}>
      {!showSidebar ? <AgentTopBar layoutMode={layoutMode} session={selectedSession} currentImage={currentImage} onOpenSessions={() => setDrawerOpen(true)} onOpenImage={() => setImageSheetOpen(true)} /> : null}
      <div className="agent-workspace__body">
        {showSidebar ? <AgentSessionSidebar sessions={workspace.sessions} selectedId={selectedSessionId ?? ""} imagesById={workspace.imagesById} onCreate={createSession} onSelect={selectSession} onRename={renameSession} onDelete={deleteSession} /> : null}
        {showRail ? <AgentSessionRail sessions={workspace.sessions} selectedId={selectedSessionId ?? ""} imagesById={workspace.imagesById} onCreate={createSession} onSelect={selectSession} onOpenDrawer={() => setDrawerOpen(true)} /> : null}
        <AgentChatPane session={selectedSession} turns={turns} imagesById={workspace.imagesById} runtimeStatus={runtimeStatus} onWebSearchChange={setSessionWebSearch} onSend={sendMessage} />
        {showInlineImage ? <AgentImagePane currentImage={currentImage} images={images} activeTab={activeTab} onTabChange={setActiveTab} /> : null}
      </div>
      <AgentSessionDrawer open={drawerOpen} sessions={workspace.sessions} selectedId={selectedSessionId ?? ""} imagesById={workspace.imagesById} onClose={() => setDrawerOpen(false)} onCreate={createSession} onSelect={selectSession} onRename={renameSession} onDelete={deleteSession} />
      <AgentImageSheet open={imageSheetOpen} currentImage={currentImage} images={images} activeTab={activeTab} onTabChange={setActiveTab} onClose={() => setImageSheetOpen(false)} />
    </main>
  );
}
