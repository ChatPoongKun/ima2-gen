import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (path) => readFileSync(join(root, path), "utf8");

describe("classic UI improvements", () => {
  it("keeps the sidebar prompt at its user-set height within 15vh to 50vh", () => {
    const css = readSource("ui/src/index.css");
    const composer = readSource("ui/src/components/PromptComposer.tsx");

    assert.match(css, /\.composer--sidebar \.composer__textarea\s*\{[\s\S]*?height:\s*50vh/);
    assert.match(css, /\.composer--sidebar \.composer__textarea\s*\{[\s\S]*?min-height:\s*15vh/);
    assert.match(css, /\.composer--sidebar \.composer__textarea\s*\{[\s\S]*?max-height:\s*50vh/);
    assert.match(css, /\.composer--sidebar \.composer__textarea\s*\{[\s\S]*?resize:\s*none/);
    assert.match(css, /\.composer__textarea-resize-handle\s*\{[\s\S]*?width:\s*100%/);
    assert.match(css, /\.composer__textarea-resize-handle\s*\{[\s\S]*?cursor:\s*ns-resize/);
    assert.match(composer, /className="composer__textarea-resize-handle"/);
    assert.match(composer, /start\.height \+ event\.clientY - start\.y/);
    assert.match(
      composer,
      /if \(variant === "sidebar"\)\s*\{\s*if \(lastVariantRef\.current !== variant\)/,
    );
    assert.doesNotMatch(
      composer,
      /if \(variant === "sidebar"\)\s*\{\s*el\.style\.height = "";/,
    );
  });

  it("uses a slim themed scrollbar across the interface", () => {
    const css = readSource("ui/src/index.css");
    const sidebarHistoryCss = readSource("ui/src/styles/sidebar-history.css");

    assert.match(css, /scrollbar-width:\s*thin/);
    assert.match(css, /scrollbar-color:[^;]+transparent/);
    assert.match(css, /\*::\-webkit-scrollbar\s*\{[\s\S]*?width:\s*5px;[\s\S]*?height:\s*5px/);
    assert.match(css, /\*::\-webkit-scrollbar-thumb\s*\{[\s\S]*?border-radius:\s*999px/);
    assert.match(css, /\*::\-webkit-scrollbar-thumb:hover/);
    assert.doesNotMatch(sidebarHistoryCss, /scrollbar-width:\s*none|::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/);
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
    const styles = readSource("ui/src/index.css");

    assert.match(summary, /comparePrompts/);
    assert.match(summary, /result\.userPrompt/);
    assert.match(summary, /result\.revisedPrompt/);
    assert.match(summary, /result-prompt--\$\{view\}/);
    assert.match(summary, /result-prompt__change--/);
    assert.match(styles, /\.result-prompt--revised[\s\S]*border-color:\s*var\(--green\)/);
    assert.match(styles, /\.result-prompt__change--removed[\s\S]*line-through/);
    assert.match(styles, /\.result-prompt__change--added[\s\S]*underline/);
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
