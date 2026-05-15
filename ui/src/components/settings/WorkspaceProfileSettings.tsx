import { useAppStore } from "../../store/useAppStore";
import { useI18n } from "../../i18n";
import type { WorkspaceProfile } from "../../lib/workspaceProfile";

const PROFILES: { value: WorkspaceProfile; labelKey: string; descKey: string }[] = [
  { value: "default", labelKey: "workspace.defaultLabel", descKey: "workspace.defaultDesc" },
  { value: "prompt-studio", labelKey: "workspace.promptStudioLabel", descKey: "workspace.promptStudioDesc" },
];

export function WorkspaceProfileSettings() {
  const profile = useAppStore((s) => s.workspaceProfile);
  const setProfile = useAppStore((s) => s.setWorkspaceProfile);
  const { t } = useI18n();

  return (
    <div className="settings-field">
      <label className="settings-field__label">{t("workspace.profileLabel")}</label>
      <div className="settings-field__options">
        {PROFILES.map((item) => (
          <label key={item.value} className="settings-radio-option">
            <input
              type="radio"
              name="workspaceProfile"
              value={item.value}
              checked={profile === item.value}
              onChange={() => setProfile(item.value)}
            />
            <span className="settings-radio-option__text">
              <strong>{t(item.labelKey)}</strong>
              <span className="settings-radio-option__desc">{t(item.descKey)}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
