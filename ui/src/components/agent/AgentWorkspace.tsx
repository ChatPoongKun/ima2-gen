import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import {
  cancelAgentQueueItem,
  createAgentSession,
  deleteAgentSession,
  enqueueAgentTurn,
  getAgentWorkspace,
  retryAgentQueueItem,
  updateAgentSession,
} from "../../lib/agentApi";
import { withAgentGenerationDefaults } from "../../lib/agentGenerationSettings";
import { useAppStore } from "../../store/useAppStore";
import { useAgentWorkspaceLayout } from "../../hooks/useAgentWorkspaceLayout";
import { AgentChatPane } from "./AgentChatPane";
import { AgentImageSheet } from "./AgentImageSheet";
import { AgentModelSheet } from "./AgentModelSheet";
import { AgentRightSidebar } from "./AgentRightSidebar";
import { AgentSessionDrawer } from "./AgentSessionDrawer";
import { AgentSessionRail } from "./AgentSessionRail";
import { AgentSessionSidebar } from "./AgentSessionSidebar";
import { AgentTopBar } from "./AgentTopBar";
import type {
  AgentContextTab,
  AgentGenerationSettings,
  AgentImageHandle,
  AgentRuntimeStatus,
  AgentSidebarTab,
  AgentTurn,
  AgentWorkspacePayload,
} from "./agentTypes";

const LOCAL_TURN_PREFIX = "agent-local-";
let localTurnSequence = 0;

function emptyWorkspace(): AgentWorkspacePayload {
  return {
    sessions: [],
    turnsBySession: {},
    imagesById: {},
    imageIdsBySession: {},
    selectedSessionId: null,
    currentImageId: null,
    allowedTools: ["ima2.get_image_context", "ima2.web_search", "ima2.generate_image"],
    manifest: null,
    queueBySession: {},
    runSummaryBySession: {},
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
  const [sidebarTab, setSidebarTab] = useState<AgentSidebarTab>("image");
  const [insertedPrompt, setInsertedPrompt] = useState<{ id: number; text: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [imageSheetOpen, setImageSheetOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<AgentRuntimeStatus>("reconnecting");

  const applyWorkspace = useCallback((payload: AgentWorkspacePayload) => {
    setWorkspace({ ...emptyWorkspace(), ...payload });
    setSelectedSessionId(payload.selectedSessionId ?? null);
  }, []);

  const applyWorkspaceWithLocalTurns = useCallback((payload: AgentWorkspacePayload, settledLocalIds: Set<string>) => {
    const normalized = { ...emptyWorkspace(), ...payload };
    setWorkspace((current) => mergeWorkspaceWithLocalTurns(current, normalized, settledLocalIds));
    setSelectedSessionId(payload.selectedSessionId ?? null);
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

  const refreshWorkspace = useCallback(async (preferredId?: string | null) => {
    const loaded = await getAgentWorkspace(preferredId);
    applyWorkspace(loaded);
    setRuntimeStatus("ready");
  }, [applyWorkspace]);

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
  const images = selectedSessionId
    ? (workspace.imageIdsBySession[selectedSessionId] ?? []).map((imageId) => workspace.imagesById[imageId]).filter((image): image is AgentImageHandle => !!image)
    : [];
  const turns = selectedSession ? workspace.turnsBySession[selectedSession.id] ?? [] : [];
  const queueItems = selectedSessionId ? workspace.queueBySession[selectedSessionId] ?? [] : [];
  const selectedRunSummary = selectedSessionId ? workspace.runSummaryBySession[selectedSessionId] : undefined;
  const selectedSettings = withAgentGenerationDefaults(selectedSession?.generationSettings);
  const derivedRuntimeStatus: AgentRuntimeStatus =
    runtimeStatus === "reconnecting"
      ? "reconnecting"
      : pendingTurnsRef.current > 0 || selectedRunSummary?.status === "queued" || selectedRunSummary?.status === "running"
        ? "generating"
        : "ready";
  const showRail = layoutMode === "desktop-rail";
  const showSidebar = layoutMode === "desktop-three-pane";
  const showRightSidebar = layoutMode !== "mobile-chat-image-sheet";

  useEffect(() => {
    if (!selectedSessionId) return;
    if (selectedRunSummary?.status !== "queued" && selectedRunSummary?.status !== "running") return;
    const timer = window.setInterval(() => {
      void refreshWorkspace(selectedSessionId).catch(console.error);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [
    refreshWorkspace,
    selectedSessionId,
    selectedRunSummary?.queuedCount,
    selectedRunSummary?.runningCount,
    selectedRunSummary?.status,
  ]);

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
  const updateGenerationSettings = (patch: Partial<AgentGenerationSettings>) => {
    if (!selectedSessionId) return;
    const nextSettings = withAgentGenerationDefaults({ ...selectedSettings, ...patch });
    setWorkspace((current) => ({
      ...current,
      sessions: current.sessions.map((session) => session.id === selectedSessionId
        ? { ...session, generationSettings: nextSettings, webSearchEnabled: nextSettings.webSearchEnabled }
        : session),
    }));
    void updateAgentSession(selectedSessionId, { generationSettings: patch }).then(applyWorkspace).catch(console.error);
  };
  const setSessionWebSearch = (enabled: boolean) => {
    updateGenerationSettings({ webSearchEnabled: enabled });
  };
  const selectImage = (imageId: string) => {
    if (!selectedSessionId || workspace.currentImageId === imageId) return;
    const sessionId = selectedSessionId;
    setWorkspace((current) => ({ ...current, currentImageId: imageId }));
    void updateAgentSession(sessionId, { currentImageId: imageId }).then(applyWorkspace).catch(console.error);
  };
  const insertPrompt = (text: string) => {
    setInsertedPrompt({ id: Date.now(), text });
  };
  const cancelQueue = (itemId: string) => {
    void cancelAgentQueueItem(itemId).then(applyWorkspace).catch(console.error);
  };
  const retryQueue = (itemId: string) => {
    void retryAgentQueueItem(itemId).then(applyWorkspace).catch(console.error);
  };
  const openModelSettings = () => {
    if (showRightSidebar) {
      setSidebarTab("model");
      return;
    }
    setModelSheetOpen(true);
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
    void enqueueAgentTurn(sessionId, text, selectedSettings)
      .then((payload) => applyWorkspaceWithLocalTurns(payload.workspace, settledLocalIds))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setWorkspace((current) => replacePendingWithError(current, sessionId, pendingTurn.id, message));
      })
      .finally(finishGeneration);
  };

  return (
    <main className={`agent-workspace agent-workspace--${layoutMode}`} data-layout={layoutMode} aria-label={t("agent.workspace")}>
      {!showSidebar ? (
        <AgentTopBar
          layoutMode={layoutMode}
          session={selectedSession}
          currentImage={currentImage}
          onOpenSessions={() => setDrawerOpen(true)}
          onOpenImage={() => setImageSheetOpen(true)}
        />
      ) : null}
      <div className="agent-workspace__body">
        {showSidebar ? (
          <AgentSessionSidebar
            sessions={workspace.sessions}
            selectedId={selectedSessionId ?? ""}
            imagesById={workspace.imagesById}
            runSummaryBySession={workspace.runSummaryBySession}
            onCreate={createSession}
            onSelect={selectSession}
            onRename={renameSession}
            onDelete={deleteSession}
          />
        ) : null}
        {showRail ? (
          <AgentSessionRail
            sessions={workspace.sessions}
            selectedId={selectedSessionId ?? ""}
            imagesById={workspace.imagesById}
            runSummaryBySession={workspace.runSummaryBySession}
            onCreate={createSession}
            onSelect={selectSession}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        ) : null}
        <AgentChatPane
          session={selectedSession}
          turns={turns}
          imagesById={workspace.imagesById}
          currentImageId={workspace.currentImageId}
          runtimeStatus={derivedRuntimeStatus}
          settings={selectedSettings}
          insertedPrompt={insertedPrompt}
          onOpenModelSettings={openModelSettings}
          onWebSearchChange={setSessionWebSearch}
          onImageSelect={selectImage}
          onSend={sendMessage}
        />
        {showRightSidebar ? (
          <AgentRightSidebar
            currentImage={currentImage}
            images={images}
            contextTab={activeTab}
            sidebarTab={sidebarTab}
            queueItems={queueItems}
            runSummary={selectedRunSummary}
            settings={selectedSettings}
            onContextTabChange={setActiveTab}
            onSidebarTabChange={setSidebarTab}
            onImageSelect={selectImage}
            onSettingsChange={updateGenerationSettings}
            onInsertPrompt={insertPrompt}
            onCancelQueue={cancelQueue}
            onRetryQueue={retryQueue}
          />
        ) : null}
      </div>
      <AgentSessionDrawer open={drawerOpen} sessions={workspace.sessions} selectedId={selectedSessionId ?? ""} imagesById={workspace.imagesById} runSummaryBySession={workspace.runSummaryBySession} onClose={() => setDrawerOpen(false)} onCreate={createSession} onSelect={selectSession} onRename={renameSession} onDelete={deleteSession} />
      <AgentImageSheet open={imageSheetOpen} currentImage={currentImage} images={images} activeTab={activeTab} onTabChange={setActiveTab} onImageSelect={selectImage} onClose={() => setImageSheetOpen(false)} />
      <AgentModelSheet open={modelSheetOpen && !showRightSidebar} settings={selectedSettings} onSettingsChange={updateGenerationSettings} onClose={() => setModelSheetOpen(false)} />
    </main>
  );
}
