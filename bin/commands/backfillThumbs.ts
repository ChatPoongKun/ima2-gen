import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config.js";
import { ensureVideoThumbnail } from "../../lib/videoThumb.js";
import { generateImageThumbnail, imageThumbExists } from "../../lib/imageThumb.js";
import { invalidateHistoryIndex } from "../../lib/historyIndex.js";

export async function backfillThumbs() {
  const dir = config.storage.generatedDir;
  console.log(`[thumbs] Scanning ${dir} for missing thumbnails...`);

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    console.log("[thumbs] No generated directory found. Nothing to backfill.");
    return;
  }

  const media = files.filter((f) => /\.(png|jpe?g|webp|mp4)$/i.test(f) && !f.endsWith(".thumb.jpg"));
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const f of media) {
    try {
      if (/\.mp4$/i.test(f)) {
        const ok = await ensureVideoThumbnail(dir, f);
        if (ok) created++; else failed++;
      } else {
        const full = join(dir, f);
        if (await imageThumbExists(full)) { skipped++; continue; }
        await generateImageThumbnail(full);
        created++;
      }
    } catch {
      failed++;
    }
  }

  if (created > 0) invalidateHistoryIndex();
  console.log(`[thumbs] Done: ${created} created, ${skipped} skipped (already exist), ${failed} failed out of ${media.length} media files.`);
}
