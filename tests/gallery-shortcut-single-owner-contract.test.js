import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (path) => readFileSync(join(root, path), "utf8");

describe("gallery shortcut single owner", () => {
  it("does not handle gallery movement or deletion in focused viewer handlers", () => {
    const globalShortcuts = readSource("ui/src/hooks/useGalleryViewerNavigation.ts");
    const canvas = readSource("ui/src/components/Canvas.tsx");
    const canvasShortcuts = readSource("ui/src/components/canvas-mode/useCanvasModeShortcuts.ts");

    assert.match(globalShortcuts, /window\.addEventListener\("keydown", onKeyDown, true\)/);
    assert.match(globalShortcuts, /selectHistoryShortcutTarget\(action\)/);
    assert.match(globalShortcuts, /trashHistoryItem\(currentImage\)/);
    assert.match(globalShortcuts, /if \(event\.repeat\) return/);

    assert.doesNotMatch(canvas, /handleViewerKeyDown/);
    assert.doesNotMatch(canvas, /selectHistoryShortcutTarget/);
    assert.doesNotMatch(canvas, /trashHistoryItem/);
    assert.doesNotMatch(canvasShortcuts, /selectHistoryShortcutTarget/);
    assert.doesNotMatch(canvasShortcuts, /trashHistoryItem/);
    assert.doesNotMatch(canvasShortcuts, /permanentlyDeleteHistoryItemByShortcut/);
  });
});
