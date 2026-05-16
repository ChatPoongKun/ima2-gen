import { useId, useState } from "react";
import { useI18n } from "../../i18n";
import { AgentSafeImage } from "./AgentSafeImage";
import { ChevronDownIcon, ChevronRightIcon } from "./AgentIcons";
import type { AgentImageHandle, AgentTurn } from "./agentTypes";

type Props = {
  turn: AgentTurn;
  imagesById: Record<string, AgentImageHandle>;
};

function formatToolLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim() || "tool";
}

export function AgentMessage({ turn, imagesById }: Props) {
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
  const renderImages = (summary = false) => imageIds.length ? (
    <div className={summary ? "agent-message__tool-thumbs" : "agent-message__images"}>
      {imageIds.map((imageId) => {
        const image = imagesById[imageId];
        return image ? (
          <AgentSafeImage
            key={imageId}
            className={summary ? "agent-message__tool-thumb" : undefined}
            fallbackClassName={summary ? "agent-message__tool-thumb agent-image-fallback" : undefined}
            src={image.thumbUrl ?? image.url}
            alt={image.prompt ?? t("agent.imageAlt")}
            iconSize={summary ? 14 : 18}
          />
        ) : null;
      })}
    </div>
  ) : null;
  const isTool = turn.role === "tool";
  const className = `agent-message agent-message--${turn.role}${turn.status === "streaming" ? " is-streaming" : ""}${isTool ? " is-collapsible" : ""}`;

  if (isTool) {
    const actionLabel = toolExpanded ? t("agent.toolCollapse") : t("agent.toolExpand");
    return (
      <article className={className} aria-busy={turn.status === "streaming" ? "true" : undefined}>
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
          {renderImages(true)}
          {imageIds.length > 0 ? <span className="agent-message__tool-count">{t("agent.toolImageCount", { count: imageIds.length })}</span> : null}
          {toolExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        </button>
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
