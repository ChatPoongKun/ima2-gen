import { useCallback, useEffect, useState } from "react";
import { getGenerationRequestLog, type GenerationRequestLogEntry } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through to the textarea fallback for non-secure origins or denied permissions.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("copy command failed");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

export function GenerationRequestLogPanel() {
  const { t } = useI18n();
  const showToast = useAppStore((state) => state.showToast);
  const activeGenerations = useAppStore((state) => state.activeGenerations);
  const [items, setItems] = useState<GenerationRequestLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await getGenerationRequestLog();
      setItems(result.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, activeGenerations]);

  const copyPrompt = async (item: GenerationRequestLogEntry) => {
    try {
      await copyTextToClipboard(item.prompt);
      showToast(t("generationLog.copied"));
    } catch {
      showToast(t("toast.copyFailed"), true);
    }
  };

  if (loading) {
    return <div className="generation-request-log__empty">{t("common.loading")}</div>;
  }

  return (
    <div className="generation-request-log" role="list">
      {items.length === 0 ? (
        <div className="generation-request-log__empty">{t("generationLog.empty")}</div>
      ) : items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="listitem"
          className="generation-request-log__item"
          onClick={() => void copyPrompt(item)}
          title={item.succeeded === 0 && item.error ? item.error : t("generationLog.copy")}
        >
          <span className="generation-request-log__prompt">{item.prompt}</span>
          <span className={`generation-request-log__count${item.succeeded === 0 ? " is-error" : ""}`}>
            {item.succeeded}/{item.requested}
          </span>
        </button>
      ))}
    </div>
  );
}
