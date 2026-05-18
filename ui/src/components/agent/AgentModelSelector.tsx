import { useI18n } from "../../i18n";
import { IMAGE_MODEL_OPTIONS } from "../../lib/imageModels";
import type { AgentGenerationSettings } from "./agentTypes";

type Props = {
  settings: AgentGenerationSettings;
  onChange: (patch: Partial<AgentGenerationSettings>) => void;
};

export function AgentModelSelector({ settings, onChange }: Props) {
  const { t } = useI18n();

  return (
    <section className="agent-settings-grid" aria-label={t("agent.model")}>
      <label>
        <span>{t("agent.model")}</span>
        <select value={settings.model} onChange={(event) => onChange({ model: event.target.value })}>
          {IMAGE_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{t(option.fullLabelKey)}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("agent.provider")}</span>
        <select value={settings.provider} onChange={(event) => onChange({ provider: event.target.value as AgentGenerationSettings["provider"] })}>
          <option value="oauth">OAuth</option>
          <option value="api">API</option>
        </select>
      </label>
      <label>
        <span>{t("agent.reasoningEffort")}</span>
        <select value={settings.reasoningEffort} onChange={(event) => onChange({ reasoningEffort: event.target.value as AgentGenerationSettings["reasoningEffort"] })}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="xhigh">xhigh</option>
        </select>
      </label>
    </section>
  );
}
