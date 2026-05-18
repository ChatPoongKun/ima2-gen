import { useI18n } from "../../i18n";
import { formatAgentQueueStatus, formatAgentQueueTime } from "../../lib/agentQueueFormatting";
import type { AgentQueueItem } from "./agentTypes";

type Props = {
  item: AgentQueueItem;
  onCancel: (itemId: string) => void;
  onRetry: (itemId: string) => void;
};

export function AgentQueueRow({ item, onCancel, onRetry }: Props) {
  const { t } = useI18n();
  const canCancel = item.status === "queued";
  const canRetry = item.status === "failed" || item.status === "canceled";
  const planSummary = `${item.plan.plannedVariants || item.plan.prompts.length || 1}v/${item.plan.plannedParallelism || item.options.parallelism}p · ${item.plan.source}`;

  return (
    <div className={`agent-queue-row agent-queue-row--${item.status}`}>
      <div className="agent-queue-row__main">
        <strong>{item.prompt}</strong>
        <span>
          {t(`agent.queueStatus.${item.status}`)} · {formatAgentQueueStatus(item)} · {planSummary} · {formatAgentQueueTime(item.createdAt)}
        </span>
        {item.plan.reason ? <small>{item.plan.reason}</small> : null}
        {item.errorMessage ? <small>{item.errorMessage}</small> : null}
      </div>
      <div className="agent-queue-row__actions">
        {canCancel ? <button type="button" onClick={() => onCancel(item.id)}>{t("agent.cancelQueue")}</button> : null}
        {canRetry ? <button type="button" onClick={() => onRetry(item.id)}>{t("agent.retryQueue")}</button> : null}
      </div>
    </div>
  );
}
