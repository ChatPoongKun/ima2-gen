import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config } from "../config.js";
import { registerVideoExtendedRoutes } from "../routes/videoExtended.ts";

const execFileAsync = promisify(execFile);

function listen(server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

function closeServer(server): void {
  server.closeAllConnections?.();
  server.close();
}

async function makeTinyMp4(path: string): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "color=c=blue:s=64x64:d=1",
    "-pix_fmt", "yuv420p",
    path,
  ]);
}

function jsonRes(res, body, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function makeProxy(opts: { operation?: "edit" | "extend"; blocked?: boolean; responseText?: string; capture?: (url: string, body: any) => void } = {}) {
  let polls = 0;
  const server = createServer((req, res) => {
    const url = req.url || "";
    if (url.includes("/v1/videos/edits") || url.includes("/v1/videos/extensions")) {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        opts.capture?.(url, JSON.parse(body || "{}"));
        jsonRes(res, { request_id: opts.operation === "extend" ? "extend-1" : "edit-1" });
      });
      return;
    }
    if (url.includes("/v1/videos/edit-1") || url.includes("/v1/videos/extend-1")) {
      polls += 1;
      const port = (server.address() as any).port;
      if (polls < 2) return jsonRes(res, { status: "pending", progress: 50 });
      return jsonRes(res, {
        status: "done",
        progress: 100,
        video: { url: `http://127.0.0.1:${port}/dl/out.mp4`, duration: opts.operation === "extend" ? 9 : 4, respect_moderation: opts.blocked ? false : true },
        usage: { cost_in_usd_ticks: 500000000 },
      });
    }
    if (url.includes("/v1/responses")) {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        opts.capture?.(url, JSON.parse(body || "{}"));
        jsonRes(res, { output: [{ type: "message", content: [{ type: "output_text", text: opts.responseText ?? "structured video prompt" }] }] });
      });
      return;
    }
    if (url.includes("/dl/")) {
      res.writeHead(200, { "Content-Type": "video/mp4" });
      res.end(Buffer.from("FAKE-EDITED-MP4"));
      return;
    }
    res.writeHead(404);
    res.end("nope");
  });
  return server;
}

async function videoApp(generatedDir: string, proxyPort: number) {
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  registerVideoExtendedRoutes(app, {
    rootDir: process.cwd(),
    packageVersion: "test",
    config: {
      ...config,
      ids: { ...config.ids, generatedHexBytes: 2 },
      storage: { ...config.storage, generatedDir },
      grokProvider: {
        ...config.grokProvider,
        proxyHost: "127.0.0.1",
        proxyPort,
        videoPollIntervalMs: 1,
        videoStartTimeoutMs: 5000,
        videoTimeoutMs: 30000,
        videoDownloadTimeoutMs: 5000,
      },
    },
  });
  const server = createServer(app);
  const url = await listen(server);
  return { server, url };
}

test("/api/video/edit forwards xAI payload and saves local video artifact", async () => {
  let startBody: any = null;
  const proxy = makeProxy({ operation: "edit", capture: (_url, body) => (startBody = body) });
  const proxyUrl = await listen(proxy);
  const generatedDir = await mkdtemp(join(tmpdir(), "ima2-video-ext-edit-"));
  const { server, url } = await videoApp(generatedDir, Number(new URL(proxyUrl).port));
  try {
    const res = await fetch(`${url}/api/video/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "make it sunset", videoUrl: "https://vidgen.example/input.mp4" }),
    });
    const data: any = await res.json();
    assert.equal(res.status, 200);
    assert.equal(startBody.model, "grok-imagine-video");
    assert.equal(startBody.prompt, "make it sunset");
    assert.deepEqual(startBody.video, { url: "https://vidgen.example/input.mp4" });
    assert.equal(data.requestId, "edit-1");
    assert.match(data.url, /^\/generated\/.+\.mp4$/);
    assert.match(data.filename, /\.mp4$/);
    assert.equal(data.sourceUrl, `http://127.0.0.1:${new URL(proxyUrl).port}/dl/out.mp4`);
    const files = await readdir(generatedDir);
    assert.ok(files.some((f) => f.endsWith(".mp4")), "mp4 written");
    assert.ok(files.some((f) => f.endsWith(".mp4.json")), "sidecar written");
  } finally {
    closeServer(server);
    closeServer(proxy);
    await rm(generatedDir, { recursive: true, force: true });
  }
});

test("/api/video/extend validates duration/model and rejects moderation-blocked result", async () => {
  const proxy = makeProxy({ operation: "extend", blocked: true });
  const proxyUrl = await listen(proxy);
  const generatedDir = await mkdtemp(join(tmpdir(), "ima2-video-ext-extend-"));
  const { server, url } = await videoApp(generatedDir, Number(new URL(proxyUrl).port));
  try {
    const badDuration = await fetch(`${url}/api/video/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "continue", videoUrl: "https://vidgen.example/input.mp4", duration: "abc" }),
    });
    assert.equal(badDuration.status, 400);
    assert.match((await badDuration.json()).error, /duration must be an integer/);

    const badModel = await fetch(`${url}/api/video/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "continue", videoUrl: "https://vidgen.example/input.mp4", duration: 5, model: "grok-imagine-video-1.5-preview" }),
    });
    assert.equal(badModel.status, 400);
    assert.match((await badModel.json()).error, /only supports grok-imagine-video/);

    const blocked = await fetch(`${url}/api/video/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "continue", videoUrl: "https://vidgen.example/input.mp4", duration: 5 }),
    });
    assert.equal(blocked.status, 502);
    assert.match((await blocked.json()).error, /moderation/i);
  } finally {
    closeServer(server);
    closeServer(proxy);
    await rm(generatedDir, { recursive: true, force: true });
  }
});

test("/api/video/frame supports generated relative and absolute paths safely", async () => {
  const proxy = makeProxy();
  const proxyUrl = await listen(proxy);
  const generatedDir = await mkdtemp(join(tmpdir(), "ima2-video-ext-frame-"));
  const mp4 = join(generatedDir, "clip.mp4");
  await makeTinyMp4(mp4);
  const { server, url } = await videoApp(generatedDir, Number(new URL(proxyUrl).port));
  try {
    for (const file of ["clip.mp4", mp4]) {
      const res = await fetch(`${url}/api/video/frame?file=${encodeURIComponent(file)}&position=0`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") || "", /image\/png/);
      assert.ok((await res.arrayBuffer()).byteLength > 100);
    }
    const traversal = await fetch(`${url}/api/video/frame?file=${encodeURIComponent("../clip.mp4")}`);
    assert.equal(traversal.status, 400);
  } finally {
    closeServer(server);
    closeServer(proxy);
    await rm(generatedDir, { recursive: true, force: true });
  }
});

test("/api/video/analyze extracts first/last frames and sends input_image payload", async () => {
  let responseBody: any = null;
  const proxy = makeProxy({ responseText: "first and last frame analysis", capture: (url, body) => { if (url.includes("/v1/responses")) responseBody = body; } });
  const proxyUrl = await listen(proxy);
  const generatedDir = await mkdtemp(join(tmpdir(), "ima2-video-ext-analyze-"));
  const mp4 = join(generatedDir, "clip.mp4");
  await makeTinyMp4(mp4);
  const { server, url } = await videoApp(generatedDir, Number(new URL(proxyUrl).port));
  try {
    const res = await fetch(`${url}/api/video/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: "clip.mp4" }),
    });
    const data: any = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.analysis, "first and last frame analysis");
    assert.equal(data.method, "first-last-frame");
    assert.equal(responseBody.model, "grok-4.3");
    const content = responseBody.input[0].content;
    assert.equal(content.filter((item: any) => item.type === "input_image").length, 2);
    assert.ok(content.every((item: any) => item.type !== "input_file"));
  } finally {
    closeServer(server);
    closeServer(proxy);
    await rm(generatedDir, { recursive: true, force: true });
  }
});
