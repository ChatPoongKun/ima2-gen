import { useEffect, useState } from "react";
import type { AgentLayoutMode } from "../components/agent/agentTypes";

function resolveAgentLayout(width: number, height: number): AgentLayoutMode {
  if (height < 560 && width < 1280) return "mobile-chat-image-sheet";
  if (width >= 1280) return "desktop-three-pane";
  if (width >= 1024 && height >= 560) return "desktop-rail";
  if (width >= 768 && height >= 700) return "tablet-stacked";
  return "mobile-chat-image-sheet";
}

function getWindowWidth(): number {
  return typeof window === "undefined" ? 1440 : window.innerWidth;
}

function getWindowHeight(): number {
  return typeof window === "undefined" ? 900 : window.innerHeight;
}

export function useAgentWorkspaceLayout(): AgentLayoutMode {
  const [layout, setLayout] = useState<AgentLayoutMode>(() =>
    resolveAgentLayout(getWindowWidth(), getWindowHeight()),
  );

  useEffect(() => {
    const update = () => setLayout(resolveAgentLayout(getWindowWidth(), getWindowHeight()));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return layout;
}
