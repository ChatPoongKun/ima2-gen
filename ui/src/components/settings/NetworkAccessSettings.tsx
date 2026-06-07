import { useEffect, useState } from "react";
import { getNetworkSettings, updateNetworkSettings } from "../../lib/api";
import { useI18n } from "../../i18n";

export function NetworkAccessSettings() {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [envOverride, setEnvOverride] = useState(false);

  useEffect(() => {
    void getNetworkSettings().then((settings) => {
      setEnabled(settings.allowExternalAccess);
      setRestartRequired(settings.restartRequired);
      setEnvOverride(settings.envOverride);
    });
  }, []);

  const onChange = async (next: boolean) => {
    setSaving(true);
    try {
      const settings = await updateNetworkSettings(next);
      setEnabled(settings.allowExternalAccess);
      setRestartRequired(settings.restartRequired);
      setEnvOverride(settings.envOverride);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="settings-row">
      <div className="settings-row__copy">
        <h4>{t("settingsNetwork.title")}</h4>
        <p>{t("settingsNetwork.body")}</p>
        {restartRequired ? <p className="settings-row__microcopy">{t("settingsNetwork.restart")}</p> : null}
        {envOverride ? <p className="settings-row__microcopy">{t("settingsNetwork.envOverride")}</p> : null}
      </div>
      <div className="settings-row__control">
        <label className="settings-network-toggle">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving || envOverride}
            onChange={(event) => void onChange(event.target.checked)}
          />
          <span>{enabled ? t("settingsNetwork.enabled") : t("settingsNetwork.disabled")}</span>
        </label>
      </div>
    </article>
  );
}
