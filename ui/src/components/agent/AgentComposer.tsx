import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { GlobeIcon, PaperclipIcon, SendIcon } from "./AgentIcons";

type Props = {
  webSearchEnabled: boolean;
  insertedPrompt?: { id: number; text: string } | null;
  onWebSearchChange: (enabled: boolean) => void;
  onSend: (text: string) => void;
};

export function AgentComposer({ webSearchEnabled, insertedPrompt, onWebSearchChange, onSend }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const canSend = draft.trim().length > 0;
  const showSlashCommands = draft.trimStart().startsWith("/");

  useEffect(() => {
    if (!insertedPrompt?.text) return;
    setDraft((current) => current.trim() ? `${current.trim()}\n\n${insertedPrompt.text}` : insertedPrompt.text);
  }, [insertedPrompt]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="agent-composer">
      <textarea
        value={draft}
        placeholder={t("agent.composerPlaceholder")}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {showSlashCommands ? (
        <div className="agent-composer__commands" role="listbox" aria-label={t("agent.slashCommands")}>
          <span>/question</span>
          <span>/variants 3</span>
          <span>/generate 4</span>
          <span>/parallelism 2</span>
        </div>
      ) : null}
      <div className="agent-composer__actions">
        <button type="button" aria-label={t("agent.attachReference")} title={t("agent.attachReference")}>
          <PaperclipIcon size={16} />
        </button>
        <button
          type="button"
          className={webSearchEnabled ? "is-active" : ""}
          aria-pressed={webSearchEnabled}
          onClick={() => onWebSearchChange(!webSearchEnabled)}
          aria-label={t("agent.webSearch")}
          title={t("agent.webSearch")}
        >
          <GlobeIcon size={16} />
        </button>
        <button type="button" className="agent-composer__send" onClick={submit} disabled={!canSend} aria-label={t("agent.send")}>
          <SendIcon size={16} />
          <span>{t("agent.send")}</span>
        </button>
      </div>
    </div>
  );
}
