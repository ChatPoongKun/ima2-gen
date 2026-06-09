import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("gallery viewer focusless navigation contract", () => {
  it("handles movement and deletion once through the global shortcut owner", () => {
    const hook = readSource("ui/src/hooks/useGalleryViewerNavigation.ts");
    const store = readSource("ui/src/store/useAppStore.ts");
    const canvas = readSource("ui/src/components/Canvas.tsx");
    const domEvents = readSource("ui/src/lib/domEvents.ts");
    const css = readSource("ui/src/index.css");

    assert.match(hook, /KEY_TO_ACTION/);
    assert.match(hook, /ArrowLeft:\s*"previous"/);
    assert.match(hook, /ArrowRight:\s*"next"/);
    assert.match(hook, /Home:\s*"first"/);
    assert.match(hook, /End:\s*"last"/);
    assert.match(hook, /PageUp:\s*"pagePrevious"/);
    assert.match(hook, /PageDown:\s*"pageNext"/);
    assert.match(hook, /event\.key === "Delete" \|\| event\.key === "Backspace"/);
    assert.match(hook, /if \(event\.repeat\) return/);
    assert.match(hook, /permanentlyDeleteHistoryItemByShortcut\(currentImage\)/);
    assert.match(hook, /trashHistoryItem\(currentImage\)/);
    assert.match(hook, /uiMode !== "classic"/);
    assert.match(hook, /hasNavigationAnchor/);
    assert.match(hook, /Boolean\(s\.currentImage\) \|\| Boolean\(s\.multimodePreviewFlightId\)/);
    assert.match(hook, /if \(!hasNavigationAnchor\) return/);
    assert.match(hook, /if \(!currentImage\) return/);
    assert.match(hook, /event\.defaultPrevented/);
    assert.match(hook, /isEditableTarget\(event\.target\)/);

    assert.match(domEvents, /HTMLButtonElement/);
    assert.match(store, /selectHistoryShortcutTarget:\s*\(action\) =>/);
    assert.match(store, /getSidebarHistoryShortcutTarget\(/);
    assert.match(store, /getShortcutTarget\(state\.history,\s*state\.currentImage,\s*action\)/);
    assert.match(store, /resolveVisibleShortcutCurrent,/);
    assert.match(store, /getVisibleGalleryItems,/);
    assert.match(store, /saveSelectedFilename\(target\?\.filename \?\? null\)/);
    assert.match(canvas, /const handleViewerMouseDown/);
    assert.match(canvas, /isEditableTarget\(event\.target\)/);
    assert.match(canvas, /event\.currentTarget\.focus\(\)/);
    assert.match(canvas, /const resultContainerRef = useRef<HTMLDivElement>\(null\)/);
    assert.match(canvas, /const restoreResultFocus = useCallback/);
    assert.match(canvas, /requestAnimationFrame\(\(\) => resultContainerRef\.current\?\.focus\(\)\)/);
    assert.match(canvas, /ref=\{resultContainerRef\}/);
    assert.match(canvas, /<ResultActions onAfterDeleteFocus=\{restoreResultFocus\} \/>/);
    assert.match(canvas, /onMouseDown=\{handleViewerMouseDown\}/);
    assert.doesNotMatch(canvas, /onKeyDown=\{handleViewerKeyDown\}/);
    assert.doesNotMatch(canvas, /const handleViewerKeyDown/);
    assert.match(css, /\.result-container:focus,/);
    assert.match(css, /\.result-img\s*\{[\s\S]*?cursor:\s*pointer;/);
    assert.match(css, /\.right-panel-backdrop\s*\{[\s\S]*?pointer-events:\s*none;/);
  });

  it("keeps permanent delete explicit by click or global Shift+Delete", () => {
    const resultActions = readSource("ui/src/components/ResultActions.tsx");
    const store = readSource("ui/src/store/useAppStore.ts");
    const hook = readSource("ui/src/hooks/useGalleryViewerNavigation.ts");
    const canvas = readSource("ui/src/components/Canvas.tsx");
    const canvasMode = readSource("ui/src/components/canvas-mode/CanvasModeWorkspace.tsx");
    const canvasModeDetails = readSource("ui/src/components/canvas-mode/CanvasModeResultDetails.tsx");
    const canvasShortcuts = readSource("ui/src/components/canvas-mode/useCanvasModeShortcuts.ts");

    assert.match(hook, /trashHistoryItem/);
    assert.match(resultActions, /onAfterDeleteFocus\?: \(\) => void/);
    assert.match(resultActions, /const deleteToTrash = async \(\) =>/);
    assert.match(resultActions, /await trashHistoryItem\(actionImage\)/);
    assert.match(resultActions, /const deletePermanently = async \(\) =>/);
    assert.match(resultActions, /await permanentlyDeleteHistoryItemByClick\(actionImage\)/);
    assert.match(resultActions, /onAfterDeleteFocus\?\.\(\)/);
    assert.match(resultActions, /onClick=\{\(\) => void deleteToTrash\(\)\}/);
    assert.match(resultActions, /onClick=\{\(\) => void deletePermanently\(\)\}/);
    assert.match(resultActions, /result\.permanentDelete/);
    assert.doesNotMatch(canvas, /permanentlyDeleteHistoryItemByShortcut/);
    assert.match(canvasMode, /const resultContainerRef = useRef<HTMLDivElement>\(null\)/);
    assert.match(canvasMode, /const restoreResultFocus = useCallback/);
    assert.match(canvasMode, /<CanvasModeResultDetails/);
    assert.match(canvasMode, /onAfterDeleteFocus=\{restoreResultFocus\}/);
    assert.match(canvasModeDetails, /<ResultActions/);
    assert.match(canvasModeDetails, /onAfterDeleteFocus=\{onAfterDeleteFocus\}/);
    assert.doesNotMatch(canvasShortcuts, /permanentlyDeleteHistoryItemByShortcut/);
    assert.doesNotMatch(canvasShortcuts, /selectHistoryShortcutTarget/);
    assert.match(hook, /event\.shiftKey[\s\S]*permanentlyDeleteHistoryItemByShortcut\(currentImage\)/);
    assert.match(store, /permanentlyDeleteHistoryItemByClick:\s*async \(item\) => \{[\s\S]*permanentlyDeleteHistoryItemByShortcut\(item\)/);
    assert.match(store, /window\.confirm\(t\("result\.permanentDeleteConfirm"/);
  });
});
