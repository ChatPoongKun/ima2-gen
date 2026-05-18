import { AgentFormTemplatePanel } from "./AgentFormTemplatePanel";
import { AgentImagePane } from "./AgentImagePane";
import { AgentModelSelector } from "./AgentModelSelector";
import { AgentPromptLibraryPanel } from "./AgentPromptLibraryPanel";
import { AgentQualityPanel } from "./AgentQualityPanel";
import { AgentQueuePanel } from "./AgentQueuePanel";
import { AgentSidebarTabs } from "./AgentSidebarTabs";
import { useI18n } from "../../i18n";
import type {
  AgentContextTab,
  AgentGenerationSettings,
  AgentImageHandle,
  AgentQueueItem,
  AgentSessionRunSummary,
  AgentSidebarTab,
} from "./agentTypes";

type Props = {
  currentImage: AgentImageHandle | null;
  images: AgentImageHandle[];
  contextTab: AgentContextTab;
  sidebarTab: AgentSidebarTab;
  queueItems: AgentQueueItem[];
  runSummary?: AgentSessionRunSummary;
  settings: AgentGenerationSettings;
  onContextTabChange: (tab: AgentContextTab) => void;
  onSidebarTabChange: (tab: AgentSidebarTab) => void;
  onImageSelect: (imageId: string) => void;
  onSettingsChange: (patch: Partial<AgentGenerationSettings>) => void;
  onInsertPrompt: (text: string) => void;
  onCancelQueue: (itemId: string) => void;
  onRetryQueue: (itemId: string) => void;
};

export function AgentRightSidebar({
  currentImage,
  images,
  contextTab,
  sidebarTab,
  queueItems,
  runSummary,
  settings,
  onContextTabChange,
  onSidebarTabChange,
  onImageSelect,
  onSettingsChange,
  onInsertPrompt,
  onCancelQueue,
  onRetryQueue,
}: Props) {
  const { t } = useI18n();

  return (
    <aside className="agent-right-sidebar">
      <AgentSidebarTabs activeTab={sidebarTab} onChange={onSidebarTabChange} />
      {sidebarTab === "image" ? (
        <AgentImagePane currentImage={currentImage} images={images} activeTab={contextTab} onTabChange={onContextTabChange} onImageSelect={onImageSelect} />
      ) : null}
      {sidebarTab === "library" ? <AgentPromptLibraryPanel mode="library" onInsert={onInsertPrompt} /> : null}
      {sidebarTab === "forms" ? <AgentFormTemplatePanel onInsert={onInsertPrompt} /> : null}
      {sidebarTab === "quality" ? (
        <section className="agent-sidebar-section" aria-label={t("agent.quality")}>
          <header>
            <div>
              <span>{t("agent.quality")}</span>
              <strong>{settings.generationStrategy === "auto" ? t("agent.generationStrategyAuto") : t("agent.generationStrategyManual")}</strong>
            </div>
          </header>
          <AgentQualityPanel settings={settings} onChange={onSettingsChange} />
        </section>
      ) : null}
      {sidebarTab === "model" ? (
        <section className="agent-sidebar-section" aria-label={t("agent.modelSettings")}>
          <header>
            <div>
              <span>{t("agent.modelSettings")}</span>
              <strong>{settings.model}</strong>
            </div>
          </header>
          <AgentModelSelector settings={settings} onChange={onSettingsChange} />
        </section>
      ) : null}
      {sidebarTab === "queue" ? (
        <AgentQueuePanel items={queueItems} summary={runSummary} onCancel={onCancelQueue} onRetry={onRetryQueue} />
      ) : null}
    </aside>
  );
}
