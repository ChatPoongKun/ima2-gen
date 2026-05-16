import { useI18n } from "../../i18n";
import { AgentSafeImage } from "./AgentSafeImage";
import type { AgentImageHandle, AgentTurn } from "./agentTypes";

type Props = {
  turn: AgentTurn;
  imagesById: Record<string, AgentImageHandle>;
};

export function AgentMessage({ turn, imagesById }: Props) {
  const { t } = useI18n();
  const roleLabel =
    turn.role === "user"
      ? t("agent.user")
      : turn.role === "tool"
        ? t("agent.tool")
        : t("agent.assistant");

  return (
    <article
      className={`agent-message agent-message--${turn.role}${turn.status === "streaming" ? " is-streaming" : ""}`}
      aria-busy={turn.status === "streaming" ? "true" : undefined}
    >
      <div className="agent-message__role">{roleLabel}</div>
      <p>{turn.text}</p>
      {turn.imageIds?.length ? (
        <div className="agent-message__images">
          {turn.imageIds.map((imageId) => {
            const image = imagesById[imageId];
            return image ? (
              <AgentSafeImage
                key={imageId}
                src={image.thumbUrl ?? image.url}
                alt={image.prompt ?? t("agent.imageAlt")}
                iconSize={18}
              />
            ) : null;
          })}
        </div>
      ) : null}
    </article>
  );
}
