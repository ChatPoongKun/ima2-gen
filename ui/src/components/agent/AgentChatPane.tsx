import { useI18n } from "../../i18n";
import { AgentComposer } from "./AgentComposer";
import { AgentMessageList } from "./AgentMessageList";
import { AgentStatusBadge } from "./AgentStatusBadge";
import type { AgentGenerationSettings, AgentImageHandle, AgentRuntimeStatus, AgentSessionSummary, AgentTurn } from "./agentTypes";

type Props = {
  session: AgentSessionSummary | null;
  turns: AgentTurn[];
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  runtimeStatus: AgentRuntimeStatus;
  settings?: AgentGenerationSettings;
  insertedPrompt?: { id: number; text: string } | null;
  onOpenModelSettings?: () => void;
  onWebSearchChange: (enabled: boolean) => void;
  onImageSelect: (imageId: string) => void;
  onSend: (text: string) => void;
};

function formatModelSummary(settings: AgentGenerationSettings): string {
  const variantMode = settings.generationStrategy === "auto" ? `auto<=${settings.maxAutoVariants}` : `${settings.variants}x`;
  return `${settings.model} · ${settings.quality} · ${variantMode}/${settings.parallelism}p`;
}

export function AgentChatPane({
  session,
  turns,
  imagesById,
  currentImageId,
  runtimeStatus,
  settings,
  insertedPrompt,
  onOpenModelSettings,
  onWebSearchChange,
  onImageSelect,
  onSend,
}: Props) {
  const { t } = useI18n();
  const modelSummary = settings ? formatModelSummary(settings) : null;

  return (
    <section className="agent-chat" aria-label={t("agent.chat")}>
      <header className="agent-pane-header">
        <div className="agent-pane-header__title">
          <span>{t("agent.chat")}</span>
          <strong>{session?.title ?? t("agent.newSession")}</strong>
        </div>
        <div className="agent-pane-header__actions">
          {modelSummary ? (
            <button
              type="button"
              className="agent-model-chip"
              aria-label={t("agent.openModelSettings")}
              title={t("agent.openModelSettings")}
              onClick={onOpenModelSettings}
            >
              <span>{t("agent.model")}</span>
              <strong>{modelSummary}</strong>
            </button>
          ) : null}
          <AgentStatusBadge status={runtimeStatus} compacted={session?.compacted} />
        </div>
      </header>
      <AgentMessageList turns={turns} imagesById={imagesById} currentImageId={currentImageId} onImageSelect={onImageSelect} />
      <AgentComposer webSearchEnabled={session?.webSearchEnabled ?? false} insertedPrompt={insertedPrompt} onWebSearchChange={onWebSearchChange} onSend={onSend} />
    </section>
  );
}
