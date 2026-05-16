import { useI18n } from "../../i18n";
import { UIModeSwitch } from "../UIModeSwitch";
import { ImageIcon, MenuIcon } from "./AgentIcons";
import { AgentSafeImage } from "./AgentSafeImage";
import type { AgentImageHandle, AgentLayoutMode, AgentSessionSummary } from "./agentTypes";

type Props = {
  layoutMode: AgentLayoutMode;
  session: AgentSessionSummary | null;
  currentImage: AgentImageHandle | null;
  onOpenSessions: () => void;
  onOpenImage: () => void;
};

export function AgentTopBar({ layoutMode, session, currentImage, onOpenSessions, onOpenImage }: Props) {
  const { t } = useI18n();
  const mobile = layoutMode === "mobile-chat-image-sheet";

  return (
    <header className="agent-topbar">
      <button type="button" className="agent-topbar__icon" onClick={onOpenSessions} aria-label={t("agent.openSessions")} title={t("agent.openSessions")}>
        <MenuIcon size={18} />
      </button>
      <div className="agent-topbar__title">
        <span>{t("agent.title")}</span>
        <strong>{session?.title ?? t("agent.newSession")}</strong>
      </div>
      <UIModeSwitch />
      {mobile ? (
        <button type="button" className="agent-topbar__image" onClick={onOpenImage} aria-label={t("agent.openImage")} title={t("agent.openImage")}>
          {currentImage ? <AgentSafeImage src={currentImage.thumbUrl ?? currentImage.url} alt="" iconSize={18} /> : <ImageIcon size={18} />}
        </button>
      ) : null}
    </header>
  );
}
