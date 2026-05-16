import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n";
import { AgentMessage } from "./AgentMessage";
import type { AgentImageHandle, AgentTurn } from "./agentTypes";

type Props = {
  turns: AgentTurn[];
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  onImageSelect: (imageId: string) => void;
};

export function AgentMessageList({ turns, imagesById, currentImageId, onImageSelect }: Props) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  return (
    <div ref={listRef} className="agent-message-list">
      {turns.length === 0 ? <div className="agent-message-list__empty">{t("agent.emptyChat")}</div> : null}
      {turns.map((turn) => (
        <AgentMessage key={turn.id} turn={turn} imagesById={imagesById} currentImageId={currentImageId} onImageSelect={onImageSelect} />
      ))}
    </div>
  );
}
