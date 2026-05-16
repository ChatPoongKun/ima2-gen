import { useI18n } from "../../i18n";
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
    <article className={`agent-message agent-message--${turn.role}${turn.status === "streaming" ? " is-streaming" : ""}`}>
      <div className="agent-message__role">{roleLabel}</div>
      <p>{turn.text}</p>
      {turn.imageIds?.length ? (
        <div className="agent-message__images">
          {turn.imageIds.map((imageId) => {
            const image = imagesById[imageId];
            return image ? <img key={imageId} src={image.thumbUrl ?? image.url} alt={image.prompt ?? t("agent.imageAlt")} /> : null;
          })}
        </div>
      ) : null}
    </article>
  );
}
