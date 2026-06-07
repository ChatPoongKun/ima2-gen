import test from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backfillThumbnails } from "../lib/thumbBackfill.ts";
import { thumbPathForImage } from "../lib/imageThumb.ts";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

test("thumbnail backfill recursively covers nested media and skips trash", async () => {
  const root = await mkdtemp(join(tmpdir(), "ima2-thumb-backfill-"));
  try {
    const nested = join(root, "continuous_01");
    const trash = join(root, "trash");
    await mkdir(nested, { recursive: true });
    await mkdir(trash, { recursive: true });

    const imagePath = join(root, "image.png");
    const videoPath = join(nested, "clip.mp4");
    const trashImagePath = join(trash, "trashed.png");
    await writeFile(imagePath, "image files are ignored by thumbnail backfill");
    await writeFile(videoPath, "fake video");
    await writeFile(`${videoPath}.thumb.jpg`, "existing thumb");
    await writeFile(trashImagePath, "trash image files are ignored");

    const result = await backfillThumbnails(root);

    assert.deepEqual(result, { total: 1, created: 0, skipped: 1, failed: 0, failures: [] });
    assert.equal(await exists(thumbPathForImage(imagePath)), false);
    assert.equal(await exists(thumbPathForImage(trashImagePath)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("thumbnail backfill treats a missing generated directory as empty", async () => {
  const missing = join(tmpdir(), `ima2-missing-generated-${Date.now()}`);

  const result = await backfillThumbnails(missing);

  assert.deepEqual(result, { total: 0, created: 0, skipped: 0, failed: 0, failures: [] });
});

test("thumbnail backfill reports videos that fail thumbnail generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "ima2-thumb-backfill-failure-"));
  try {
    const badVideoPath = join(root, "bad.mp4");
    await writeFile(badVideoPath, "not a video");

    const result = await backfillThumbnails(root);

    assert.equal(result.total, 1);
    assert.equal(result.created, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].file, badVideoPath);
    assert.equal(result.failures[0].kind, "video");
    assert.equal(result.failures[0].reason, "thumbnail generation returned false");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
