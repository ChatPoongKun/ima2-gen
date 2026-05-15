import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

function lineCount(path) {
  return readSource(path).split("\n").length;
}

describe("prompt studio UI contract", () => {
  it("wires the workspace profile settings section without broken nav keys", () => {
    const settings = readSource("ui/src/components/SettingsWorkspace.tsx");
    const en = JSON.parse(readSource("ui/src/i18n/en.json"));
    const ko = JSON.parse(readSource("ui/src/i18n/ko.json"));

    assert.match(settings, /"appearance",\s*"workspace",\s*"language"/);
    assert.match(settings, /workspace:\s*null/);
    assert.match(settings, /WorkspaceProfileSettings/);
    assert.equal(typeof en.settings.sections.workspace.title, "string");
    assert.equal(typeof en.settings.sections.workspace.hint, "string");
    assert.equal(typeof ko.settings.sections.workspace.title, "string");
    assert.equal(typeof ko.settings.sections.workspace.hint, "string");
  });

  it("keeps prompt builder styles split, imported, and under the file budget", () => {
    const main = readSource("ui/src/main.tsx");
    const builderCss = readSource("ui/src/styles/prompt-builder.css");
    const messageCss = readSource("ui/src/styles/prompt-builder-messages.css");

    assert.match(main, /styles\/prompt-builder\.css/);
    assert.match(main, /styles\/prompt-builder-messages\.css/);
    assert.match(builderCss, /\.prompt-builder\s*\{/);
    assert.match(messageCss, /\.prompt-builder__message\s*\{/);
    assert.ok(lineCount("ui/src/styles/prompt-builder.css") < 500);
    assert.ok(lineCount("ui/src/styles/prompt-builder-messages.css") < 500);
  });

  it("stores builder output after the main prompt and exposes block movement controls", () => {
    const store = readSource("ui/src/store/useAppStore.ts");
    const composer = readSource("ui/src/components/PromptComposer.tsx");
    const structuredCard = readSource("ui/src/components/prompt-builder/PromptBuilderStructuredCard.tsx");
    const css = readSource("ui/src/styles/composer-flow.css");
    const en = JSON.parse(readSource("ui/src/i18n/en.json"));
    const ko = JSON.parse(readSource("ui/src/i18n/ko.json"));

    assert.match(store, /placement\?: "before" \| "after"/);
    assert.match(store, /const before = insertedPrompts\.filter\(\(prompt\) => prompt\.placement !== "after"\)/);
    assert.match(store, /const after = insertedPrompts\.filter\(\(prompt\) => prompt\.placement === "after"\)/);
    assert.match(store, /moveInsertedPromptInComposer: \(id: string, direction: "up" \| "down"\) => void/);
    assert.match(store, /moveInsertedPromptInComposer: \(id, direction\) =>/);
    assert.match(structuredCard, /placement:\s*"after"/);
    assert.match(composer, /moveInsertedPromptInComposer/);
    assert.match(composer, /composer__prompt-chips--after/);
    assert.match(css, /\.composer__prompt-chip-move/);
    assert.equal(typeof en.prompt.moveBlockUp, "string");
    assert.equal(typeof en.prompt.moveBlockDown, "string");
    assert.equal(typeof en.prompt.afterBlocks, "string");
    assert.equal(typeof ko.prompt.moveBlockUp, "string");
    assert.equal(typeof ko.prompt.moveBlockDown, "string");
    assert.equal(typeof ko.prompt.afterBlocks, "string");
  });

  it("persists composer snapshots through generation, multimode, and history rows", () => {
    const types = readSource("ui/src/types.ts");
    const api = readSource("ui/src/lib/api.ts");
    const store = readSource("ui/src/store/useAppStore.ts");
    const generateRoute = readSource("routes/generate.ts");
    const multimodeRoute = readSource("routes/multimode.ts");
    const historyList = readSource("lib/historyList.ts");
    const snapshot = readSource("lib/composerSnapshot.ts");

    assert.match(types, /export type ComposerInsertedPromptSnapshot/);
    assert.match(types, /composerPrompt\?: string \| null/);
    assert.match(types, /composerInsertedPrompts\?: ComposerInsertedPromptSnapshot\[\] \| null/);
    assert.match(api, /composerPrompt\?: string \| null/);
    assert.match(api, /composerInsertedPrompts\?: import\("\.\.\/types"\)\.ComposerInsertedPromptSnapshot\[\] \| null/);
    assert.match(snapshot, /normalizeComposerInsertedPrompts/);
    assert.match(store, /const composerPrompt = s\.prompt/);
    assert.match(store, /const composerInsertedPrompts = cloneInsertedPrompts\(s\.insertedPrompts\)/);
    assert.match(store, /composerPrompt,/);
    assert.match(store, /composerInsertedPrompts,/);
    assert.match(store, /getHistoryComposerPatch/);
    assert.match(generateRoute, /normalizeComposerPrompt/);
    assert.match(generateRoute, /composerPrompt,/);
    assert.match(generateRoute, /composerInsertedPrompts,/);
    assert.match(multimodeRoute, /normalizeComposerPrompt/);
    assert.match(multimodeRoute, /composerPrompt,/);
    assert.match(multimodeRoute, /composerInsertedPrompts,/);
    assert.match(historyList, /composerPrompt: meta\?\.composerPrompt/);
    assert.match(historyList, /composerInsertedPrompts: meta\?\.composerInsertedPrompts/);
  });
});
