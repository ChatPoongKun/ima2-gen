import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendGenerationRequestLog,
  listGenerationRequestLog,
  type GenerationRequestLogEntry,
} from "../lib/generationRequestLog.ts";

describe("generation request log", () => {
  it("recovers the write queue after a filesystem failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "ima2-generation-log-"));
    const blockedParent = join(root, "not-a-directory");
    const validPath = join(root, "generation-requests.json");
    const entry: GenerationRequestLogEntry = {
      id: "entry-1",
      requestId: "request-1",
      createdAt: Date.now(),
      prompt: "recover logging",
      requested: 1,
      succeeded: 1,
      error: null,
    };

    try {
      await writeFile(blockedParent, "file");
      await assert.rejects(
        appendGenerationRequestLog(join(blockedParent, "log.json"), entry),
      );
      await appendGenerationRequestLog(validPath, entry);
      assert.deepEqual(await listGenerationRequestLog(validPath), [entry]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
