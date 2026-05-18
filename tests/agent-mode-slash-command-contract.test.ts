import { after, afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import sharp from "sharp";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_DIR = mkdtempSync(join(tmpdir(), "ima2-agent-slash-"));
process.env.IMA2_CONFIG_DIR = TEST_DIR;
process.env.IMA2_DB_PATH = join(TEST_DIR, "sessions.db");

const { registerAgentRoutes } = await import("../routes/agent.ts");
const db = await import("../lib/db.ts");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(() => {
  db.closeDb();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

async function withApp(fn: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  registerAgentRoutes(app, {
    apiKey: "sk-test",
    config: {
      storage: { generatedDir: join(TEST_DIR, "generated") },
      log: { level: "silent" },
    },
    packageVersion: "test",
  });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address() as import("node:net").AddressInfo;
  try {
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function createSession(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/agent/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "slash contract" }),
  });
  assert.equal(res.status, 201);
  return await res.json() as { selectedSessionId: string };
}

async function waitFor<T>(read: () => Promise<T | null | undefined>, label: string): Promise<T> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function sseResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

async function pngB64() {
  const buffer = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: "#668844",
    },
  }).png().toBuffer();
  return buffer.toString("base64");
}

describe("Agent Mode slash command contract", () => {
  it("/question returns a text assistant turn without creating queue work", async () => {
    await withApp(async (baseUrl) => {
      const created = await createSession(baseUrl);
      const sessionId = created.selectedSessionId;
      const res = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "/question should we ask for style first?" }),
      });
      const body = await res.json() as any;
      assert.equal(res.status, 200);
      assert.equal(body.queueItem, null);
      assert.equal(body.workspace.queueBySession[sessionId].length, 0);
      assert.ok(body.workspace.turnsBySession[sessionId].some((turn: any) => (
        turn.role === "assistant" &&
        turn.text.includes("Question mode is active") &&
        turn.imageIds.length === 0
      )));
    });
  });

  it("slash fanout commands are stored as executable queue plans", async () => {
    const finalImage = await pngB64();
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, init);
      JSON.parse(String(init?.body));
      return sseResponse([
        {
          type: "response.output_item.done",
          item: { type: "image_generation_call", result: finalImage, revised_prompt: "slash fanout" },
        },
        { type: "response.completed", response: { usage: { total_tokens: 1 } } },
      ]);
    };

    await withApp(async (baseUrl) => {
      const created = await createSession(baseUrl);
      const sessionId = created.selectedSessionId;
      const res = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "/generate 4 cyberpunk product render",
          options: { provider: "api", parallelism: 2 },
        }),
      });
      const body = await res.json() as any;
      assert.equal(res.status, 202);
      assert.equal(body.queueItem.prompt, "cyberpunk product render");
      assert.equal(body.queueItem.plan.mode, "fanout");
      assert.equal(body.queueItem.plan.plannedVariants, 4);
      assert.equal(body.queueItem.plan.plannedParallelism, 2);
      assert.equal(body.queueItem.plan.source, "slash-command");

      await waitFor(async () => {
        const queueRes = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/queue`);
        const queue = (await queueRes.json() as any).queue as Array<any>;
        return queue.find((item) => item.id === body.queueItem.id && item.status === "succeeded");
      }, "slash fanout queue item to finish");
    });
  });

  it("ignores client-submitted plan bodies and recomputes queue plans server-side", async () => {
    const finalImage = await pngB64();
    let upstreamHits = 0;
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, init);
      JSON.parse(String(init?.body));
      upstreamHits++;
      return sseResponse([
        {
          type: "response.output_item.done",
          item: { type: "image_generation_call", result: finalImage, revised_prompt: "server recomputed" },
        },
        { type: "response.completed", response: { usage: { total_tokens: 1 } } },
      ]);
    };

    await withApp(async (baseUrl) => {
      const created = await createSession(baseUrl);
      const sessionId = created.selectedSessionId;
      const res = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "make one poster",
          options: { provider: "api", parallelism: 8 },
          plan: {
            prompts: Array.from({ length: 8 }, (_, index) => `malicious ${index}`),
            plannedVariants: 8,
            plannedParallelism: 8,
            source: "slash-command",
            reason: "client bypass",
          },
        }),
      });
      const body = await res.json() as any;
      assert.equal(res.status, 202);
      assert.equal(body.queueItem.plan.plannedVariants, 1);
      assert.equal(body.queueItem.plan.plannedParallelism, 1);
      assert.equal(body.queueItem.plan.source, "auto-default");
      assert.equal(body.queueItem.plan.prompts.length, 1);

      await waitFor(async () => {
        const queueRes = await fetch(`${baseUrl}/api/agent/sessions/${sessionId}/queue`);
        const queue = (await queueRes.json() as any).queue as Array<any>;
        return queue.find((item) => item.id === body.queueItem.id && item.status === "succeeded");
      }, "server-recomputed queue item to finish");

      assert.equal(upstreamHits, 1);
    });
  });
});
