import { useI18n } from "../../i18n";
import type { AgentGenerationSettings } from "./agentTypes";

type Props = {
  settings: AgentGenerationSettings;
  onChange: (patch: Partial<AgentGenerationSettings>) => void;
};

export function AgentQualityPanel({ settings, onChange }: Props) {
  const { t } = useI18n();

  return (
    <section className="agent-settings-grid" aria-label={t("agent.quality")}>
      <label>
        <span>{t("agent.generationStrategy")}</span>
        <select value={settings.generationStrategy} onChange={(event) => onChange({ generationStrategy: event.target.value as AgentGenerationSettings["generationStrategy"] })}>
          <option value="auto">{t("agent.generationStrategyAuto")}</option>
          <option value="manual">{t("agent.generationStrategyManual")}</option>
        </select>
      </label>
      <label>
        <span>{t("agent.quality")}</span>
        <select value={settings.quality} onChange={(event) => onChange({ quality: event.target.value as AgentGenerationSettings["quality"] })}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </label>
      <label>
        <span>{t("agent.size")}</span>
        <select value={settings.size} onChange={(event) => onChange({ size: event.target.value })}>
          <option value="1024x1024">1024x1024</option>
          <option value="1536x1024">1536x1024</option>
          <option value="1024x1536">1024x1536</option>
          <option value="2048x2048">2048x2048</option>
        </select>
      </label>
      <label>
        <span>{t("agent.format")}</span>
        <select value={settings.format} onChange={(event) => onChange({ format: event.target.value as AgentGenerationSettings["format"] })}>
          <option value="png">png</option>
          <option value="jpeg">jpeg</option>
          <option value="webp">webp</option>
        </select>
      </label>
      <label>
        <span>{t("agent.moderation")}</span>
        <select value={settings.moderation} onChange={(event) => onChange({ moderation: event.target.value as AgentGenerationSettings["moderation"] })}>
          <option value="low">low</option>
          <option value="auto">auto</option>
        </select>
      </label>
      {settings.generationStrategy === "manual" ? (
        <label>
          <span>{t("agent.variantsCount")}</span>
          <input type="number" min={1} max={8} value={settings.variants} onChange={(event) => onChange({ variants: Number(event.target.value) })} />
        </label>
      ) : (
        <label>
          <span>{t("agent.maxAutoVariants")}</span>
          <input type="number" min={1} max={8} value={settings.maxAutoVariants} onChange={(event) => onChange({ maxAutoVariants: Number(event.target.value) })} />
        </label>
      )}
      <label>
        <span>{t("agent.parallelism")}</span>
        <input type="number" min={1} max={8} value={settings.parallelism} onChange={(event) => onChange({ parallelism: Number(event.target.value) })} />
      </label>
    </section>
  );
}
