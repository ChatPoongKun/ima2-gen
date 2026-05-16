import { useId, useState } from "react";
import { useI18n } from "../../i18n";
import { ChevronDownIcon, ChevronRightIcon } from "./AgentIcons";
import { AgentResultThumb } from "./AgentResultThumb";
import type { AgentImageHandle, AgentTurn } from "./agentTypes";

type Props = {
  turn: AgentTurn;
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  onImageSelect: (imageId: string) => void;
};

function formatToolLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim() || "tool";
}

export function AgentMessage({ turn, imagesById, currentImageId, onImageSelect }: Props) {
  const { t } = useI18n();
  const detailsId = useId();
  const [toolExpanded, setToolExpanded] = useState(false);
  const roleLabel =
    turn.role === "user"
      ? t("agent.user")
      : turn.role === "tool"
        ? t("agent.tool")
        : t("agent.assistant");
  const imageIds = turn.imageIds ?? [];
  const renderImages = (compact = false) => imageIds.length ? (
    <div className={compact ? "agent-message__tool-thumbs" : "agent-message__images"}>
      {imageIds.map((imageId) => {
        const image = imagesById[imageId];
        if (!image) return null;
        return (
          <AgentResultThumb
            key={imageId}
            image={image}
            selected={imageId === currentImageId}
            compact={compact}
            onSelect={onImageSelect}
          />
        );
      })}
    </div>
  ) : null;
  const isTool = turn.role === "tool";
  const className = `agent-message agent-message--${turn.role}${turn.status === "streaming" ? " is-streaming" : ""}${isTool ? " is-collapsible" : ""}`;

  if (isTool) {
    const actionLabel = toolExpanded ? t("agent.toolCollapse") : t("agent.toolExpand");
    return (
      <article className={className} aria-busy={turn.status === "streaming" ? "true" : undefined}>
        <div className="agent-message__tool-summary">
          <button
            type="button"
            className="agent-message__tool-toggle"
            aria-expanded={toolExpanded}
            aria-controls={detailsId}
            aria-label={`${actionLabel}: ${formatToolLabel(turn.text)}`}
            onClick={() => setToolExpanded((expanded) => !expanded)}
          >
            <span className="agent-message__tool-dot" aria-hidden="true" />
            <span className="agent-message__tool-main">
              <span className="agent-message__role">{roleLabel}</span>
              <span className="agent-message__tool-label">{formatToolLabel(turn.text)}</span>
            </span>
            {imageIds.length > 0 ? <span className="agent-message__tool-count">{t("agent.toolImageCount", { count: imageIds.length })}</span> : null}
            {toolExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          </button>
          {renderImages(true)}
        </div>
        <div id={detailsId} className="agent-message__tool-details" hidden={!toolExpanded}>
          <p>{turn.text}</p>
          {renderImages()}
        </div>
      </article>
    );
  }

  return (
    <article
      className={className}
      aria-busy={turn.status === "streaming" ? "true" : undefined}
    >
      <div className="agent-message__role">{roleLabel}</div>
      <p>{turn.text}</p>
      {renderImages()}
    </article>
  );
}
