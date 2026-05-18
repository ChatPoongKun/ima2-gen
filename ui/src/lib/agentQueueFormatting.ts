import type { AgentQueueItem } from "../components/agent/agentTypes";

export function formatAgentQueueStatus(item: AgentQueueItem): string {
  if (item.status === "queued") return `#${item.position}`;
  if (item.status === "running") return "running";
  if (item.status === "succeeded") return `${item.resultImageIds.length} img`;
  if (item.status === "failed") return item.errorCode ?? "failed";
  return "canceled";
}

export function formatAgentQueueTime(timestamp?: number | null): string {
  if (!timestamp) return "-";
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}
