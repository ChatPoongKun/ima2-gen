import { useMemo, useState } from "react";
import { useI18n } from "../i18n";

type DiffToken = {
  text: string;
  changed: boolean;
};

interface ResultPromptSummaryProps {
  userPrompt: string;
  revisedPrompt?: string | null;
}

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

function comparePrompts(before: string, after: string): {
  before: DiffToken[];
  after: DiffToken[];
} {
  const a = tokenize(before);
  const b = tokenize(after);
  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs = Array.from({ length: rows }, () => new Uint32Array(cols));

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const beforeTokens: DiffToken[] = [];
  const afterTokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      beforeTokens.push({ text: a[i], changed: false });
      afterTokens.push({ text: b[j], changed: false });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      beforeTokens.push({ text: a[i], changed: true });
      i++;
    } else {
      afterTokens.push({ text: b[j], changed: true });
      j++;
    }
  }
  while (i < a.length) beforeTokens.push({ text: a[i++], changed: true });
  while (j < b.length) afterTokens.push({ text: b[j++], changed: true });

  return { before: beforeTokens, after: afterTokens };
}

export function ResultPromptSummary({
  userPrompt,
  revisedPrompt,
}: ResultPromptSummaryProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"user" | "revised">("user");
  const effectiveRevisedPrompt = revisedPrompt?.trim() || userPrompt;
  const diff = useMemo(
    () => comparePrompts(userPrompt, effectiveRevisedPrompt),
    [effectiveRevisedPrompt, userPrompt],
  );
  const tokens = view === "user" ? diff.before : diff.after;

  return (
    <section className="result-prompt" aria-label={t("result.promptComparison")}>
      <div className="result-prompt__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === "user"}
          className={view === "user" ? "active" : ""}
          onClick={() => setView("user")}
        >
          {t("result.userPrompt")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "revised"}
          className={view === "revised" ? "active" : ""}
          onClick={() => setView("revised")}
        >
          {t("result.revisedPrompt")}
        </button>
      </div>
      <div className="result-prompt__text" role="tabpanel">
        {tokens.map((token, index) => (
          <span
            key={`${view}-${index}`}
            className={token.changed ? "result-prompt__change" : undefined}
          >
            {token.text}
          </span>
        ))}
      </div>
    </section>
  );
}
