import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("Agent Mode frontend shell contract", () => {
  it("exposes Agent mode by default with an explicit opt-out gate", () => {
    const devMode = readSource("ui/src/lib/devMode.ts");
    const types = readSource("ui/src/types.ts");
    const store = readSource("ui/src/store/useAppStore.ts");
    const switcher = readSource("ui/src/components/UIModeSwitch.tsx");

    assert.match(devMode, /export const ENABLE_AGENT_MODE/);
    assert.match(devMode, /VITE_IMA2_AGENT_MODE !== "0"/);
    assert.match(types, /"classic" \| "node" \| "card-news" \| "agent"/);
    assert.match(store, /raw === "agent"/);
    assert.match(store, /m === "agent" && !ENABLE_AGENT_MODE/);
    assert.match(switcher, /ENABLE_AGENT_MODE/);
    assert.match(switcher, /uiMode\.agent/);
  });

  it("mounts a lazy Agent workspace instead of Classic or Node surfaces", () => {
    const app = readSource("ui/src/App.tsx");
    const workspace = readSource("ui/src/components/agent/AgentWorkspace.tsx");
    const css = readSource("ui/src/styles/agent-workspace.css");

    assert.match(app, /LazyAgentWorkspace/);
    assert.match(app, /uiMode === "agent" \?/);
    assert.match(app, /isAgentMode = uiMode === "agent"/);
    assert.match(app, /showHistoryStrip = !promptStudioClassic && !isAgentMode/);
    assert.match(workspace, /AgentSessionSidebar/);
    assert.match(workspace, /AgentChatPane/);
    assert.match(workspace, /AgentImagePane/);
    assert.match(css, /\.app\[data-ui-mode="agent"\]/);
    assert.match(css, /\.app\[data-ui-mode="agent"\] \.sidebar/);
  });

  it("implements the planned responsive Agent regions and mobile overlays", () => {
    const layoutHook = readSource("ui/src/hooks/useAgentWorkspaceLayout.ts");
    const types = readSource("ui/src/components/agent/agentTypes.ts");
    const drawer = readSource("ui/src/components/agent/AgentSessionDrawer.tsx");
    const sheet = readSource("ui/src/components/agent/AgentImageSheet.tsx");
    const css = readSource("ui/src/styles/agent-workspace.css");
    const panelCss = readSource("ui/src/styles/agent-workspace-panels.css");

    assert.match(types, /"desktop-three-pane"/);
    assert.match(types, /"desktop-rail"/);
    assert.match(types, /"tablet-stacked"/);
    assert.match(types, /"mobile-chat-image-sheet"/);
    assert.match(layoutHook, /width >= 1280/);
    assert.match(layoutHook, /width >= 1024/);
    assert.match(layoutHook, /width >= 768/);
    assert.match(css, /280px minmax\(420px, 0\.95fr\) minmax\(520px, 1\.05fr\)/);
    assert.match(css, /64px minmax\(420px, 1fr\) minmax\(440px, 1fr\)/);
    assert.match(css, /grid-template-areas: "image" "chat"/);
    assert.match(drawer, /role="dialog"/);
    assert.match(sheet, /role="dialog"/);
    assert.match(panelCss, /\.agent-image-sheet/);
  });

  it("wires Agent workspace to server-backed runtime APIs and image handles", () => {
    const api = readSource("ui/src/lib/agentApi.ts");
    const workspace = readSource("ui/src/components/agent/AgentWorkspace.tsx");
    const composer = readSource("ui/src/components/agent/AgentComposer.tsx");
    const message = readSource("ui/src/components/agent/AgentMessage.tsx");
    const ko = readSource("ui/src/i18n/ko.json");
    const en = readSource("ui/src/i18n/en.json");

    assert.match(api, /\/api\/agent\/sessions/);
    assert.match(api, /\/turns/);
    assert.match(api, /imageHandleFromCurrent/);
    assert.doesNotMatch(api, /createAgentWorkspaceSeed/);
    assert.doesNotMatch(api, /base64/i);
    assert.match(workspace, /getAgentWorkspace/);
    assert.match(workspace, /sendAgentTurn/);
    assert.match(workspace, /runtimeStatus/);
    assert.match(composer, /onWebSearchChange/);
    assert.match(composer, /onSend/);
    assert.match(message, /imageIds/);
    assert.match(ko, /"agent"/);
    assert.match(en, /"agent"/);
  });

  it("shows optimistic chat turns and visible pending state while Agent generation is in flight", () => {
    const workspace = readSource("ui/src/components/agent/AgentWorkspace.tsx");
    const message = readSource("ui/src/components/agent/AgentMessage.tsx");
    const panelCss = readSource("ui/src/styles/agent-workspace-panels.css");
    const ko = readSource("ui/src/i18n/ko.json");
    const en = readSource("ui/src/i18n/en.json");

    assert.match(workspace, /LOCAL_TURN_PREFIX/);
    assert.match(workspace, /localUserTurn/);
    assert.match(workspace, /localPendingTurn/);
    assert.match(workspace, /status: "streaming"/);
    assert.match(workspace, /pendingTurnsRef/);
    assert.match(workspace, /mergeWorkspaceWithLocalTurns/);
    assert.match(workspace, /replacePendingWithError/);
    assert.match(workspace, /appendTurns\(current, sessionId, \[userTurn, pendingTurn\]\)/);
    assert.match(workspace, /t\("agent\.pending"\)/);
    assert.match(message, /aria-busy/);
    assert.match(panelCss, /\.agent-message\.is-streaming/);
    assert.match(panelCss, /@keyframes agent-spin/);
    assert.match(panelCss, /agent-status__dot[\s\S]*animation: agent-pulse/);
    assert.match(en, /"pending": "Generating image\.\.\."/);
    assert.match(ko, /"pending": "이미지를 생성하는 중\.\.\."/);
  });
});
