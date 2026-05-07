# Visible Text Language Prompt Plan

Status: done / shipped on main
Date: 2026-05-07
Parent context: Issue #57 planning folder, separate prompt-fidelity follow-up

## Problem

When a user wants readable text inside an image, a vague prompt like "Korean text", "Japanese words", or "foreign language keywords" can cause the model to translate, romanize, invent, or substitute text. The app already preserves prompt language broadly, but it does not yet force prompts that require visible in-image text to list the exact words in the target language/script.

The desired behavior is:

- If readable text must appear in the generated image, the prompt must explicitly list the exact visible words.
- The listed words must be written in the target language's native script.
- The model must not translate, romanize, summarize, substitute, or add extra readable text.
- Card News should keep using `textFields[].text` as the source of exact visible text.

## Current code facts

- `ui/src/store/useAppStore.ts` has `composePrompt(mainPrompt, insertedPrompts)` and simply prepends inserted prompts before the main prompt. This is not a safe place for mandatory global policy because users can omit inserted prompts.
- `lib/oauthProxy/prompts.ts` owns the main developer prompts and fidelity suffixes for generate/edit/multimode OAuth image calls.
- `tests/prompt-fidelity.test.ts` already asserts prompt fidelity and safety policy inclusion.
- `lib/cardNewsPlannerPrompt.ts` already says exact visible copy belongs in `textFields[].text`, not `visualPrompt`.
- `lib/cardNewsGenerator.ts` already emits `Render only the following readable text items exactly as written:` when `textFields` are present.

## Diff plan

### ADD `lib/visibleTextLanguagePolicy.ts`

Add a small shared policy string:

```ts
export const VISIBLE_TEXT_LANGUAGE_POLICY = [
  "Visible text and language rule:",
  "If the image must contain readable text, signage, labels, UI copy, captions, slogans, typography, or keywords in a specific language, explicitly list the exact visible words in that language and script.",
  "Do not translate, romanize, summarize, substitute, or invent alternate wording.",
  "Do not use vague placeholders such as \"Korean text\", \"Japanese words\", or \"foreign language text\".",
  "If exact words are needed, state them as exact visible text items and render only those listed items.",
].join(" ");
```

Rationale: keep the rule reusable and testable instead of duplicating long strings across developer prompts.

### MODIFY `lib/oauthProxy/prompts.ts`

Import the new policy:

```ts
import { VISIBLE_TEXT_LANGUAGE_POLICY } from "../visibleTextLanguagePolicy.js";
```

Append it to:

- `AUTO_PROMPT_FIDELITY_SUFFIX`
- `DIRECT_PROMPT_FIDELITY_SUFFIX`
- `GENERATE_DEVELOPER_PROMPT`
- `GENERATE_NO_SEARCH_DEVELOPER_PROMPT`
- `EDIT_DEVELOPER_PROMPT`
- `EDIT_NO_SEARCH_DEVELOPER_PROMPT`
- `MULTIMODE_DEVELOPER_PROMPT`
- `MULTIMODE_NO_SEARCH_DEVELOPER_PROMPT`

Implementation detail:

- Do not change `composePrompt(...)`.
- Do not make this only a Prompt Library inserted prompt.
- Keep the user's original text first; if a prompt already lists exact visible text, preserve it.
- Keep research-derived English clarifiers after the user's original text, but do not translate listed visible text items into those clarifiers.
- For developer prompt constants that already append `SAFETY_INTENT_POLICY`, append `VISIBLE_TEXT_LANGUAGE_POLICY` before `SAFETY_INTENT_POLICY` so image prompt fidelity rules stay grouped ahead of safety policy text.

### MODIFY `lib/responsesImageAdapter.ts`

Replace the Responses API multimode inline developer prompt with the shared multimode developer prompt constants.

Before:

```ts
{ role: "developer", content: `Create up to ${maxImages} separate image_generation_call outputs. Do not create a collage, grid, contact sheet, storyboard sheet, or multi-panel single image.` },
```

After:

```ts
{ role: "developer", content: webSearchEnabled ? MULTIMODE_DEVELOPER_PROMPT : MULTIMODE_NO_SEARCH_DEVELOPER_PROMPT },
```

Use the existing `./oauthProxy.js` prompt import surface. If either multimode prompt constant is not already imported in `responsesImageAdapter.ts`, add it to the existing import list.

Rationale: `generateMultimodeViaResponses(...)` currently has a higher-priority inline developer message that can bypass policy text added to `lib/oauthProxy/prompts.ts`. The user text still receives fidelity suffixes, but developer-level policy should be consistent across OAuth and Responses multimode paths.

### OPTIONAL ADD Prompt Library seed/template support

Only if the project already has a curated prompt seed/update path that can safely ship default prompt snippets. If no default prompt seed path is currently authoritative, skip this in the first patch and keep the global policy only.

Suggested user-facing snippet:

```md
[Visible Text Language Requirement]

If readable text appears in the image, render only the following exact text items.

Language/script: 한국어
Exact visible text:
- "여기에 실제로 보일 한국어 문구"
- "두 번째 키워드"

Do not translate, romanize, summarize, or replace these words.
Do not add extra readable text beyond the listed items.
```

Rationale: inserted prompts are useful UX, but they are not the mandatory correctness boundary.

### MODIFY `lib/cardNewsPlannerPrompt.ts`

Make the existing Card News policy more explicit without changing the data model:

Before, it already says:

```text
Only textFields[].text with renderMode="in-image" is intended to appear inside the image.
```

Add/strengthen:

```text
When visible text needs a specific language, textFields[].text must contain the exact words in that language/script. Do not translate, romanize, summarize, or replace visible text.
```

Rationale: Card News has a better structured path than general prompts, so the exact text must stay in `textFields[].text`.

### MODIFY `lib/cardNewsGenerator.ts`

Strengthen `formatRenderedTextInstruction(...)` by adding one sentence to both branches:

When no visible text is listed:

```text
If visible text is required, it must be listed explicitly in textFields[].text in the target language/script.
```

When visible text is listed:

```text
Do not translate, romanize, summarize, substitute, or add unlisted readable text.
```

Rationale: generation-time prompt assembly should enforce the same source-of-truth as planning.

### MODIFY `tests/prompt-fidelity.test.ts`

Add assertions:

- `VISIBLE_TEXT_LANGUAGE_POLICY` is included by generate/edit developer prompts.
- `VISIBLE_TEXT_LANGUAGE_POLICY` is included by multimode developer prompts, including no-search variants.
- `VISIBLE_TEXT_LANGUAGE_POLICY` is included by direct/auto fidelity suffixes.
- The policy contains concrete anti-placeholder wording such as `"Korean text"` and `"Japanese words"`.
- The policy says not to translate or romanize.
- `responsesImageAdapter.ts` uses `MULTIMODE_DEVELOPER_PROMPT` / `MULTIMODE_NO_SEARCH_DEVELOPER_PROMPT` for Responses API multimode developer content instead of an inline policy-bypassing string.

### MODIFY `tests/card-news-contract.test.ts`

Add assertions:

- planner prompt tells the model that visible text in a specific language must be in `textFields[].text`.
- generator prompt says not to translate/romanize/substitute listed visible text.
- existing exact rendered text list behavior stays intact.

## Non-goals

- Do not parse or auto-detect all possible languages in the frontend.
- Do not force the user to provide visible text for every image.
- Do not inject a visible text block into `composePrompt(...)` for every request.
- Do not duplicate Card News exact text into `visualPrompt`.
- Do not make requestId, prompt text, or translated wording part of image/history identity.

## Verification plan

```bash
node --test tests/prompt-fidelity.test.ts tests/card-news-contract.test.ts
npm run typecheck
npm test
```

## Employee review questions

1. Is `lib/oauthProxy/prompts.ts` the right mandatory policy boundary instead of `composePrompt(...)`?
2. Should the first patch skip Prompt Library seed/template changes unless an authoritative default seed path exists?
3. Are the Card News changes correctly limited to `textFields[].text` without duplicating exact copy in `visualPrompt`?
4. Are there any backend/image adapter paths that bypass these prompt builders and also need the policy?
