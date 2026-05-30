import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { OptionGroup } from "./OptionGroup";
import { deriveVideoModeUI, MAX_REF2V_DURATION_UI } from "../lib/imageModels";
import type { VideoResolutionUI } from "../types";

const RES_ITEMS = [
  { value: "480p" as const, label: "480p" },
  { value: "720p" as const, label: "720p" },
];
const ASPECT_ITEMS = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"].map((v) => ({ value: v, label: v }));
const DURATIONS = [3, 5, 8, 10, 12, 15];

export function VideoControlsPanel() {
  const { t } = useI18n();
  const refCount = useAppStore((s) => s.activeVideoRefCount());
  const duration = useAppStore((s) => s.videoDuration);
  const setDuration = useAppStore((s) => s.setVideoDuration);
  const resolution = useAppStore((s) => s.videoResolution);
  const setResolution = useAppStore((s) => s.setVideoResolution);
  const aspect = useAppStore((s) => s.videoAspectRatio);
  const setAspect = useAppStore((s) => s.setVideoAspectRatio);
  const maxDuration = refCount >= 2 ? MAX_REF2V_DURATION_UI : 15;
  const mode = deriveVideoModeUI(refCount);

  return (
    <div className="right-panel-settings video-controls">
      <div className="provider-compat-note" role="note">
        <strong>{t("video.modeLabel")}</strong>
        <span>{t(`video.mode.${mode}`, { n: refCount })}</span>
      </div>
      <div className="option-group">
        <div className="section-title">{t("video.durationTitle")}</div>
        <div className="option-row">
          {DURATIONS.filter((d) => d <= maxDuration).map((d) => (
            <button
              key={d}
              type="button"
              className={`option-btn${duration === d ? " active" : ""}`}
              onClick={() => setDuration(d)}
            >
              {d}s
            </button>
          ))}
        </div>
      </div>
      <OptionGroup<VideoResolutionUI>
        title={t("video.resolutionTitle")}
        items={RES_ITEMS}
        value={resolution}
        onChange={setResolution}
      />
      <OptionGroup<string>
        title={t("video.aspectTitle")}
        items={ASPECT_ITEMS}
        value={aspect}
        onChange={setAspect}
      />
    </div>
  );
}
