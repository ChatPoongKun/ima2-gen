import { useId, useState } from "react";
import { useI18n } from "../../i18n";
import { formatAgentToolLabel, getAgentToolCalls } from "../../lib/agentToolFormatting";
import { ChevronDownIcon, ChevronRightIcon } from "./AgentIcons";
import { AgentResultThumb } from "./AgentResultThumb";
import { AgentToolCallRow } from "./AgentToolCallRow";
import type { AgentImageHandle, AgentTurn } from "./agentTypes";

type Props = {
  turn: AgentTurn;
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  onImageSelect: (imageId: string) => void;
};

export function AgentToolGroup({ turn, imagesById, currentImageId, onImageSelect }: Props) {
  const { t } = useI18n();
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const imageIds = turn.imageIds ?? [];
  const toolCalls = getAgentToolCalls(turn);
  const actionLabel = expanded ? t("agent.toolCollapse") : t("agent.toolExpand");
  const label = formatAgentToolLabel(turn.text);

  return (
    <article className={`agent-message agent-message--tool is-collapsible${turn.status === "streaming" ? " is-streaming" : ""}`} aria-busy={turn.status === "streaming" ? "true" : undefined}>
      <div className="agent-message__tool-summary">
        <button
          type="button"
          className="agent-message__tool-toggle"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${actionLabel}: ${label}`}
          onClick={() => setExpanded((next) => !next)}
        >
          <span className="agent-message__tool-dot" aria-hidden="true" />
          <span className="agent-message__tool-main">
            <span className="agent-message__role">{t("agent.toolGroup")}</span>
            <span className="agent-message__tool-label">{label}</span>
          </span>
          {imageIds.length > 0 ? <span className="agent-message__tool-count">{t("agent.toolImageCount", { count: imageIds.length })}</span> : null}
          {toolCalls.length > 0 ? <span className="agent-message__tool-count">{t("agent.toolCallCount", { count: toolCalls.length })}</span> : null}
          {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        </button>
        {imageIds.length > 0 ? (
          <div className="agent-message__tool-thumbs">
            {imageIds.map((imageId) => {
              const image = imagesById[imageId];
              if (!image) return null;
              return (
                <AgentResultThumb
                  key={imageId}
                  image={image}
                  selected={imageId === currentImageId}
                  compact
                  onSelect={onImageSelect}
                />
              );
            })}
          </div>
        ) : null}
      </div>
      <div id={detailsId} className="agent-message__tool-details" hidden={!expanded}>
        <p>{turn.text}</p>
        {toolCalls.length > 0 ? (
          <ul className="agent-tool-call-list">
            {toolCalls.map((call) => (
              <AgentToolCallRow
                key={call.id}
                call={call}
                imagesById={imagesById}
                currentImageId={currentImageId}
                onImageSelect={onImageSelect}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
