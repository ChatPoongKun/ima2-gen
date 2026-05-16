import { useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import { UIModeSwitch } from "../UIModeSwitch";
import { PlusIcon, SearchIcon } from "./AgentIcons";
import { AgentSessionList } from "./AgentSessionList";
import type { AgentImageHandle, AgentSessionSummary } from "./agentTypes";

type Props = {
  sessions: AgentSessionSummary[];
  selectedId: string;
  imagesById: Record<string, AgentImageHandle>;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

export function AgentSessionSidebar(props: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return props.sessions;
    return props.sessions.filter((session) => session.title.toLowerCase().includes(normalized));
  }, [props.sessions, query]);

  return (
    <aside className="agent-sessions" aria-label={t("agent.sessions")}>
      <div className="agent-sessions__brand">
        <div>
          <span>ima2-gen</span>
          <strong>{t("agent.title")}</strong>
        </div>
        <UIModeSwitch />
      </div>
      <button type="button" className="agent-sessions__create" onClick={props.onCreate}>
        <PlusIcon size={16} />
        <span>{t("agent.newSession")}</span>
      </button>
      <label className="agent-sessions__search">
        <SearchIcon size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("agent.sessionSearch")} />
      </label>
      <AgentSessionList {...props} sessions={filtered} />
    </aside>
  );
}
