import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (path) => readFileSync(join(root, path), "utf8");

describe("classic UI improvements", () => {
  it("makes the sidebar prompt vertically resizable from 30vh to 70vh", () => {
    const css = readSource("ui/src/index.css");
    const composer = readSource("ui/src/components/PromptComposer.tsx");

    assert.match(css, /\.composer--sidebar \.composer__textarea\s*\{[\s\S]*?height:\s*50vh/);
    assert.match(css, /\.composer--sidebar \.composer__textarea\s*\{[\s\S]*?min-height:\s*30vh/);
    assert.match(css, /\.composer--sidebar \.composer__textarea\s*\{[\s\S]*?max-height:\s*70vh/);
    assert.match(css, /\.composer--sidebar \.composer__textarea\s*\{[\s\S]*?resize:\s*vertical/);
    assert.match(composer, /if \(variant === "sidebar"\)/);
  });

  it("blurs the active element on Escape before editable-target shortcut filtering", () => {
    const navigation = readSource("ui/src/hooks/useGalleryViewerNavigation.ts");

    const escapeIndex = navigation.indexOf('event.key === "Escape"');
    const editableIndex = navigation.indexOf("isEditableTarget(event.target)");
    assert.ok(escapeIndex > -1);
    assert.ok(editableIndex > escapeIndex);
    assert.match(navigation, /activeElement\.blur\(\)/);
    assert.match(navigation, /addEventListener\("keydown", onKeyDown, true\)/);
  });

  it("shows prompt differences without making the prompt panel a copy target", () => {
    const summary = readSource("ui/src/components/ResultPromptSummary.tsx");
    const actions = readSource("ui/src/components/ResultActions.tsx");

    assert.match(summary, /comparePrompts/);
    assert.match(summary, /result\.userPrompt/);
    assert.match(summary, /result\.revisedPrompt/);
    assert.match(summary, /result-prompt__change/);
    assert.doesNotMatch(summary, /copyTextToClipboard|onCopy/);
    assert.match(actions, /result\.copyPrompt/);
  });

  it("colors failed request counts red and successful request counts green", () => {
    const panel = readSource("ui/src/components/GenerationRequestLogPanel.tsx");
    const css = readSource("ui/src/index.css");

    assert.match(panel, /item\.succeeded === 0 \? " is-error" : " is-success"/);
    assert.match(css, /\.generation-request-log__count\.is-error\s*\{[\s\S]*?var\(--red\)/);
    assert.match(css, /\.generation-request-log__count\.is-success\s*\{[\s\S]*?var\(--green\)/);
  });
});
