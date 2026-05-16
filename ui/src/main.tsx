import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/canvas-mode.css";
import "./styles/canvas-background-cleanup.css";
import "./styles/classic-workspace.css";
import "./styles/composer-flow.css";
import "./styles/prompt-builder.css";
import "./styles/prompt-builder-messages.css";
import "./styles/sidebar-history.css";
import "./styles/settings-controls.css";
import "./styles/viewer-workflow.css";
import "./styles/agent-workspace.css";
import "./styles/agent-workspace-panels.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
