import { useI18n } from "../../i18n";
import { AgentContextTabs } from "./AgentContextTabs";
import { ImageIcon } from "./AgentIcons";
import type { AgentContextTab, AgentImageHandle } from "./agentTypes";

type Props = {
  currentImage: AgentImageHandle | null;
  images: AgentImageHandle[];
  activeTab: AgentContextTab;
  onTabChange: (tab: AgentContextTab) => void;
};

function TabBody({ activeTab, currentImage }: Pick<Props, "activeTab" | "currentImage">) {
  const { t } = useI18n();
  if (activeTab === "refs") return <div className="agent-tab-empty">{t("agent.noRefs")}</div>;
  if (activeTab === "web") return <div className="agent-tab-empty">{t("agent.noWeb")}</div>;
  if (activeTab === "memory") {
    return (
      <ul className="agent-memory-list">
        <li>{t("agent.memoryItemStyle")}</li>
        <li>{t("agent.memoryItemSubject")}</li>
      </ul>
    );
  }
  return (
    <dl className="agent-image-meta">
      <div><dt>{t("agent.filename")}</dt><dd>{currentImage?.filename ?? "-"}</dd></div>
      <div><dt>{t("agent.prompt")}</dt><dd>{currentImage?.prompt ?? currentImage?.revisedPrompt ?? "-"}</dd></div>
    </dl>
  );
}

export function AgentImagePane({ currentImage, images, activeTab, onTabChange }: Props) {
  const { t } = useI18n();

  return (
    <section className="agent-image" aria-label={t("agent.imagePane")}>
      <header className="agent-pane-header">
        <div>
          <span>{t("agent.imagePane")}</span>
          <strong>{t("agent.currentImage")}</strong>
        </div>
      </header>
      <div className="agent-image__preview">
        {currentImage ? <img src={currentImage.url} alt={currentImage.prompt ?? t("agent.imageAlt")} /> : <div className="agent-image__empty"><ImageIcon size={34} /><span>{t("agent.noImage")}</span></div>}
      </div>
      <div className="agent-image__variants" aria-label={t("agent.variants")}>
        {images.map((image) => (
          <button key={image.id} type="button" className={image.id === currentImage?.id ? "active" : ""}>
            <img src={image.thumbUrl ?? image.url} alt={image.prompt ?? t("agent.imageAlt")} />
          </button>
        ))}
      </div>
      <AgentContextTabs activeTab={activeTab} onChange={onTabChange} />
      <TabBody activeTab={activeTab} currentImage={currentImage} />
    </section>
  );
}
