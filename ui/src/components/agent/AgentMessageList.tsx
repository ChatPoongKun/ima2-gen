import { useEffect, useMemo, useRef } from "react";
import { useI18n } from "../../i18n";
import { AgentMessage } from "./AgentMessage";
import { AgentToolGroup } from "./AgentToolGroup";
import type { AgentImageHandle, AgentTurn } from "./agentTypes";

type Props = {
  turns: AgentTurn[];
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  onImageSelect: (imageId: string) => void;
};

type MessageGroup =
  | { kind: "single"; turn: AgentTurn }
  | { kind: "tools"; turns: AgentTurn[]; key: string };

function groupTurns(turns: AgentTurn[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let toolBatch: AgentTurn[] = [];

  const flushTools = () => {
    if (toolBatch.length === 0) return;
    groups.push({ kind: "tools", turns: toolBatch, key: toolBatch.map((t) => t.id).join("+") });
    toolBatch = [];
  };

  for (const turn of turns) {
    if (turn.role === "tool") {
      toolBatch.push(turn);
    } else {
      flushTools();
      groups.push({ kind: "single", turn });
    }
  }
  flushTools();
  return groups;
}

export function AgentMessageList({ turns, imagesById, currentImageId, onImageSelect }: Props) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupTurns(turns), [turns]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  return (
    <div ref={listRef} className="agent-message-list">
      {turns.length === 0 ? <div className="agent-message-list__empty">{t("agent.emptyChat")}</div> : null}
      {groups.map((group) =>
        group.kind === "tools" ? (
          <AgentToolGroup key={group.key} turns={group.turns} imagesById={imagesById} currentImageId={currentImageId} onImageSelect={onImageSelect} />
        ) : (
          <AgentMessage key={group.turn.id} turn={group.turn} imagesById={imagesById} currentImageId={currentImageId} onImageSelect={onImageSelect} />
        ),
      )}
    </div>
  );
}
