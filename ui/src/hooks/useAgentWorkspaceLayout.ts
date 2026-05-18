import { useEffect, useState } from "react";
import type { AgentLayoutMode } from "../components/agent/agentTypes";
import { resolveAgentLayout } from "../lib/agentLayout";

function getWindowWidth(): number {
  return typeof window === "undefined" ? 1440 : window.innerWidth;
}

function getWindowHeight(): number {
  return typeof window === "undefined" ? 900 : window.innerHeight;
}

export function useAgentWorkspaceLayout(): AgentLayoutMode {
  const [layout, setLayout] = useState<AgentLayoutMode>(() =>
    resolveAgentLayout({ width: getWindowWidth(), height: getWindowHeight() }),
  );

  useEffect(() => {
    const update = () => setLayout(resolveAgentLayout({
      width: getWindowWidth(),
      height: getWindowHeight(),
    }));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return layout;
}
