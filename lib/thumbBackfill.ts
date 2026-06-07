import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { ensureVideoThumbnail, videoThumbExists } from "./videoThumb.js";

export type ThumbBackfillFailure = {
  file: string;
  kind: "video";
  reason: string;
};

export type ThumbBackfillResult = {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  failures: ThumbBackfillFailure[];
};

const FAILURE_DETAIL_LIMIT = 20;

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Recursively scan `dir` (up to `maxDepth` levels, matching historyList's walk
 * depth) and generate missing `.thumb.jpg` thumbnails for videos.
 * Videos live both at the top level and inside subdirectories
 * (e.g. video series clips nested one level deep under a date-stamped folder),
 * so a flat readdir misses them — this walks the tree so the gallery never
 * shows a thumbless media tile. Images use their original files in the gallery
 * so we do not create extra image thumbnail sidecars.
 */
export async function backfillThumbnails(
  dir: string,
  maxDepth = 2,
): Promise<ThumbBackfillResult> {
  const result: ThumbBackfillResult = { total: 0, created: 0, skipped: 0, failed: 0, failures: [] };

  function recordFailure(file: string, kind: "video", reason: string): void {
    result.failed++;
    if (result.failures.length >= FAILURE_DETAIL_LIMIT) return;
    result.failures.push({ file, kind, reason });
  }

  async function walk(current: string, depth: number): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (depth > 0 && entry.name !== "trash") await walk(full, depth - 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".thumb.jpg")) continue;
      if (!/\.mp4$/i.test(entry.name)) continue;

      result.total++;
      const kind = "video";
      try {
        if (await videoThumbExists(full)) { result.skipped++; continue; }
        const ok = await ensureVideoThumbnail(current, entry.name);
        if (ok) result.created++; else recordFailure(full, kind, "thumbnail generation returned false");
      } catch (error) {
        recordFailure(full, kind, errorReason(error));
      }
    }
  }

  await walk(dir, maxDepth);
  return result;
}
