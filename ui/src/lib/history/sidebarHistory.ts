import type { GenerateItem } from "../../types";
import { getGalleryItemKey, isGalleryVisibleItem } from "../galleryNavigation";

export type SidebarHistoryEntry =
  | { type: "image"; key: string; item: GenerateItem }
  | { type: "sequence"; key: string; sequenceId: string; items: GenerateItem[] };

export const SIDEBAR_HISTORY_RENDER_LIMIT = 72;

export function compareSequenceItems(a: GenerateItem, b: GenerateItem): number {
  const ai = a.sequenceIndex ?? Number.MAX_SAFE_INTEGER;
  const bi = b.sequenceIndex ?? Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

export function getSequenceThumbSlotCount(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  return 4;
}

export function groupSidebarHistoryEntries(history: GenerateItem[]): SidebarHistoryEntry[] {
  const seenImages = new Set<string>();
  const sequences = new Map<string, Extract<SidebarHistoryEntry, { type: "sequence" }>>();
  const entries: SidebarHistoryEntry[] = [];

  for (const item of history) {
    if (!isGalleryVisibleItem(item)) continue;

    if (item.sequenceId) {
      const key = `sequence:${item.sequenceId}`;
      let entry = sequences.get(item.sequenceId);
      if (!entry) {
        entry = { type: "sequence", key, sequenceId: item.sequenceId, items: [] };
        sequences.set(item.sequenceId, entry);
        entries.push(entry);
      }
      entry.items.push(item);
      continue;
    }

    const key = getGalleryItemKey(item);
    if (seenImages.has(key)) continue;
    seenImages.add(key);
    entries.push({ type: "image", key, item });
  }

  for (const entry of sequences.values()) {
    entry.items.sort(compareSequenceItems);
  }

  return entries;
}
