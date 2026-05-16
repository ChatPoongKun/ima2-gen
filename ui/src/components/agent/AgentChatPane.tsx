import { useI18n } from "../../i18n";
import { AgentComposer } from "./AgentComposer";
import { AgentMessageList } from "./AgentMessageList";
import { AgentStatusBadge } from "./AgentStatusBadge";
import type { AgentImageHandle, AgentRuntimeStatus, AgentSessionSummary, AgentTurn } from "./agentTypes";

type Props = {
  session: AgentSessionSummary | null;
  turns: AgentTurn[];
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  runtimeStatus: AgentRuntimeStatus;
  onWebSearchChange: (enabled: boolean) => void;
  onImageSelect: (imageId: string) => void;
  onSend: (text: string) => void;
};

export function AgentChatPane({ session, turns, imagesById, currentImageId, runtimeStatus, onWebSearchChange, onImageSelect, onSend }: Props) {
  const { t } = useI18n();

  return (
    <section className="agent-chat" aria-label={t("agent.chat")}>
      <header className="agent-pane-header">
        <div>
          <span>{t("agent.chat")}</span>
          <strong>{session?.title ?? t("agent.newSession")}</strong>
        </div>
        <AgentStatusBadge status={runtimeStatus} compacted={session?.compacted} />
      </header>
      <AgentMessageList turns={turns} imagesById={imagesById} currentImageId={currentImageId} onImageSelect={onImageSelect} />
      <AgentComposer webSearchEnabled={session?.webSearchEnabled ?? false} onWebSearchChange={onWebSearchChange} onSend={onSend} />
    </section>
  );
}
