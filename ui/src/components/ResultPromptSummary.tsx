import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  const [height, setHeight] = useState<number | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
  const effectiveRevisedPrompt = revisedPrompt?.trim() || userPrompt;
  const diff = useMemo(
    () => comparePrompts(userPrompt, effectiveRevisedPrompt),
    [effectiveRevisedPrompt, userPrompt],
  );
  const tokens = view === "user" ? diff.before : diff.after;

  const resizePanel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStartRef.current = {
      y: event.clientY,
      height: panel.getBoundingClientRect().height,
    };
  };

  const continueResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    const minHeight = window.innerHeight * 0.1;
    const maxHeight = window.innerHeight * 0.5;
    setHeight(Math.min(maxHeight, Math.max(minHeight, start.height + start.y - event.clientY)));
  };

  const stopResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    resizeStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      ref={panelRef}
      className={`result-prompt result-prompt--${view}`}
      aria-label={t("result.promptComparison")}
      style={height === null ? undefined : { height }}
    >
      <button
        type="button"
        className="result-prompt__resize-handle"
        aria-label={t("result.promptComparison")}
        onPointerDown={resizePanel}
        onPointerMove={continueResize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
      />
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
            className={
              token.changed
                ? `result-prompt__change result-prompt__change--${
                    view === "user" ? "removed" : "added"
                  }`
                : undefined
            }
          >
            {token.text}
          </span>
        ))}
      </div>
    </section>
  );
}
