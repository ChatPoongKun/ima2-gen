import { useI18n } from "../../i18n";
import { AgentResultThumb } from "./AgentResultThumb";
import { AgentToolGroup } from "./AgentToolGroup";
import type { AgentImageHandle, AgentTurn } from "./agentTypes";

type Props = {
  turn: AgentTurn;
  imagesById: Record<string, AgentImageHandle>;
  currentImageId: string | null;
  onImageSelect: (imageId: string) => void;
};

export function AgentMessage({ turn, imagesById, currentImageId, onImageSelect }: Props) {
  const { t } = useI18n();
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
    return <AgentToolGroup turn={turn} imagesById={imagesById} currentImageId={currentImageId} onImageSelect={onImageSelect} />;
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
