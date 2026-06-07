import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { isEditableTarget } from "../lib/domEvents";
import type { GalleryShortcutAction } from "../lib/galleryShortcuts";

const KEY_TO_ACTION: Record<string, GalleryShortcutAction | undefined> = {
  ArrowLeft: "previous",
  ArrowRight: "next",
  Home: "first",
  End: "last",
  PageUp: "pagePrevious",
  PageDown: "pageNext",
};

export function useGalleryViewerNavigation() {
  const uiMode = useAppStore((s) => s.uiMode);
  const hasNavigationAnchor = useAppStore((s) => Boolean(s.currentImage) || Boolean(s.multimodePreviewFlightId));
  const currentImage = useAppStore((s) => s.currentImage);
  const selectHistoryShortcutTarget = useAppStore((s) => s.selectHistoryShortcutTarget);
  const trashHistoryItem = useAppStore((s) => s.trashHistoryItem);
  const permanentlyDeleteHistoryItemByShortcut = useAppStore(
    (s) => s.permanentlyDeleteHistoryItemByShortcut,
  );

  useEffect(() => {
    if (uiMode !== "classic") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!currentImage) return;
        event.preventDefault();
        if (event.shiftKey) {
          void permanentlyDeleteHistoryItemByShortcut(currentImage);
        } else {
          void trashHistoryItem(currentImage);
        }
        return;
      }

      const action = KEY_TO_ACTION[event.key];
      if (!action) return;
      if (!hasNavigationAnchor) return;

      event.preventDefault();
      selectHistoryShortcutTarget(action);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    currentImage,
    hasNavigationAnchor,
    permanentlyDeleteHistoryItemByShortcut,
    selectHistoryShortcutTarget,
    trashHistoryItem,
    uiMode,
  ]);
}
