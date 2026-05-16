import { useEffect, useState } from "react";
import type { AgentLayoutMode } from "../components/agent/agentTypes";

function resolveAgentLayout(width: number): AgentLayoutMode {
  if (width >= 1280) return "desktop-three-pane";
  if (width >= 1024) return "desktop-rail";
  if (width >= 768) return "tablet-stacked";
  return "mobile-chat-image-sheet";
}

function getWindowWidth(): number {
  return typeof window === "undefined" ? 1440 : window.innerWidth;
}

export function useAgentWorkspaceLayout(): AgentLayoutMode {
  const [layout, setLayout] = useState<AgentLayoutMode>(() =>
    resolveAgentLayout(getWindowWidth()),
  );

  useEffect(() => {
    const update = () => setLayout(resolveAgentLayout(getWindowWidth()));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return layout;
}
