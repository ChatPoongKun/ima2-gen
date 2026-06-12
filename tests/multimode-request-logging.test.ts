import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerMultimodeRoutes } from "../routes/multimode.ts";
import { config } from "../config.js";

const FINAL_B64 = Buffer.from("final image").toString("base64");
const SECOND_B64 = Buffer.from("second image").toString("base64");
const originalFetch = globalThis.fetch;

function sseResponse(images: string[]) {
  const encoder = new TextEncoder();
  const events = [
    ...images.map((result) => ({
      type: "response.output_item.done",
      item: { type: "image_generation_call", result, revised_prompt: "revised" },
    })),
    { type: "response.completed", response: { usage: { total_tokens: 3 } } },
  ];
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("multimode request logging", () => {
  it("records successful and failed sequence counts in the generation request log", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "ima2-multimode-log-"));
    const generatedDir = join(rootDir, "generated");
    const generationRequestLogFile = join(rootDir, "generation-requests.json");
    const dbPath = join(rootDir, "sessions.db");
    const app = express();
    app.use(express.json());
    registerMultimodeRoutes(app, {
      rootDir,
      apiKey: "sk-test",
      config: {
        ...config,
        storage: { ...config.storage, generatedDir, generationRequestLogFile, dbPath },
        log: { ...config.log, level: "silent" },
      },
      packageVersion: "test",
    });
    const server = await new Promise<import("node:http").Server>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address() as import("node:net").AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      globalThis.fetch = async (url, init) => {
        if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, init);
        return sseResponse([FINAL_B64, SECOND_B64]);
      };
      const success = await fetch(`${baseUrl}/api/generate/multimode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "two stages", provider: "api", maxImages: 2 }),
      });
      assert.match(await success.text(), /event: done/);

      globalThis.fetch = async (url, init) => {
        if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, init);
        return sseResponse([]);
      };
      const failure = await fetch(`${baseUrl}/api/generate/multimode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "empty stages", provider: "api", maxImages: 1 }),
      });
      assert.match(await failure.text(), /event: error/);

      const log = JSON.parse(await readFile(generationRequestLogFile, "utf8"));
      assert.equal(log.length, 2);
      assert.deepEqual(
        {
          prompt: log[0].prompt,
          requested: log[0].requested,
          succeeded: log[0].succeeded,
        },
        { prompt: "empty stages", requested: 1, succeeded: 0 },
      );
      assert.match(log[0].error, /No image data returned/);
      assert.deepEqual(
        {
          prompt: log[1].prompt,
          requested: log[1].requested,
          succeeded: log[1].succeeded,
          error: log[1].error,
        },
        { prompt: "two stages", requested: 2, succeeded: 2, error: null },
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
