import { mkdir, readFile, writeFile } from "fs/promises";
import { safeWriteSidecar, atomicWriteJson } from "../lib/atomicWrite.js";
import { join } from "path";
import { randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import { detectImageMimeFromB64, summarizeReferencePayload, validateAndNormalizeRefs } from "../lib/refs.js";
import { classifyUpstreamError } from "../lib/errorClassify.js";
import { normalizeOAuthParams } from "../lib/oauthNormalize.js";
import { resolveProviderOptions } from "../lib/providerOptions.js";
import { generateViaResponses } from "../lib/responsesImageAdapter.js";
import { generateViaGrok, planGrokImage } from "../lib/grokImageAdapter.js";
import { generateViaAgy } from "../lib/agyImageAdapter.js";
import { generateViaGeminiApi } from "../lib/geminiApiImageAdapter.js";
import { isNonRetryableGenerationError, normalizeGenerationFailure, type UpstreamErr } from "../lib/generationErrors.js";
import { startJob, finishJob, registerJobAbortController, isJobCanceled } from "../lib/inflight.js";
import {
  isGenerationCanceledError,
  makeGenerationCanceledError,
  throwIfJobCanceled,
} from "../lib/generationCancel.js";
import { logEvent, logError } from "../lib/logger.js";
import { embedImageMetadataBestEffort } from "../lib/imageMetadataStore.js";
import { invalidateHistoryIndex } from "../lib/historyIndex.js";
import {
  normalizeComposerInsertedPrompts,
  normalizeComposerPrompt,
} from "../lib/composerSnapshot.js";

import { errInfo } from "../lib/errInfo.js";
import { requireRuntimeContext, type RouteRuntimeContext, type RuntimeContext } from "../lib/runtimeContext.js";
import { appendGenerationRequestLog } from "../lib/generationRequestLog.js";

function sendSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function validateModeration(ctx: RuntimeContext, moderation: unknown) {
  if (typeof moderation !== "string" || !ctx.config.oauth.validModeration.has(moderation)) {
    return { error: "moderation must be one of: auto, low" };
  }
  return { moderation };
}

function imageFormatFromMime(mime: string | null | undefined): "png" | "jpeg" | "webp" {
  if (mime === "image/jpeg") return "jpeg";
  if (mime === "image/webp") return "webp";
  return "png";
}

export function registerGenerateRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.post("/api/generate", async (req: Request, res: Response) => {
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : req.id;
    let finishStatus = "completed";
    let finishHttpStatus;
    let finishErrorCode;
    let finishMeta = {};
    let finishCanceled = false;
    let requestPrompt = "";
    let requestedCount = 1;
    let requestError: string | null = null;
    const cancelController = new AbortController();
    try {
      const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : null;
      const clientNodeId = typeof req.body?.clientNodeId === "string" ? req.body.clientNodeId : null;
      const {
        prompt,
        quality: rawQuality = "medium",
        size = "1024x1024",
        format = "png",
        moderation = "low",
        provider = "auto",
        n = 1,
        references = [],
        mode: promptMode = "auto",
        model: rawModel,
        reasoningEffort: rawReasoningEffort,
        webSearchEnabled: rawWebSearchEnabled = true,
      } = req.body;
      const storyboardActive = req.body?.storyboard === true;
      const storyboardPrefix = storyboardActive
        ? [
          "[STORYBOARD MODE — Video Production Keyframe / Storyboard Grid]",
          "This image will be used for video production. It may be a single keyframe OR a 3x3 storyboard grid.",
          "The prompt and all injected instructions MUST be in English.",
          "",
          "IF GENERATING A 3x3 STORYBOARD GRID:",
          "- Panel 1 (top-left) MUST be COMPLETELY SOLID BLACK — no image, no text, just pure black.",
          "- Panels 2-9 contain the action sequence (8 key moments).",
          "- Do NOT add timestamp labels or text overlays to any panel — they burn into the video.",
          "- Maintain identical character designs across all panels.",
          "- Each panel should look like a cinematic film still, not a sketch.",
          "",
          "CHARACTER LOCK:",
          "- Identify each character by 2-3 VISUAL identifiers (clothing color + physique + position/props). Never by name alone.",
          "- Copy character descriptions VERBATIM from the reference/prior frame. Do NOT rephrase or drift.",
          "",
          "SCENE CONTINUITY:",
          "- Lock lighting direction, color palette, environment, and art style to prior frames.",
          "- Change ONLY: action, shot scale, camera angle, or expression.",
          "- Reference image = canonical anchor. Preserve it faithfully.",
          "",
          "VIDEO-READY COMPOSITION:",
          "- Frame for animation: leave space for motion, avoid static-only poses.",
          "- Use descriptive caption format: shot type + subject action + environment + technical (lens, lighting) + mood.",
          "- Specify intended camera movement for the video phase (e.g. 'slow dolly-in', 'static wide').",
          "- End pose must be stable and suitable for video continuation.",
          "",
        ].join("\n") + "\n"
        : "";
      const composerPrompt = normalizeComposerPrompt(req.body?.composerPrompt);
      const composerInsertedPrompts = normalizeComposerInsertedPrompts(
        req.body?.composerInsertedPrompts,
      );
      const { quality, warnings: qualityWarnings } = normalizeOAuthParams({ provider, quality: rawQuality });
      const providerOptions = resolveProviderOptions(ctx, {
        provider,
        rawModel,
        rawReasoningEffort,
        rawSize: size,
        rawWebSearchEnabled,
      });
      if (providerOptions.error) {
        finishStatus = "error";
        finishHttpStatus = providerOptions.status;
        finishErrorCode = providerOptions.code;
        return res.status(providerOptions.status).json({ error: providerOptions.error, code: providerOptions.code });
      }
      const imageModel = providerOptions.model;
      const reasoningEffort = providerOptions.reasoningEffort;
      const effectiveSize = providerOptions.size;
      const webSearchEnabled = providerOptions.webSearchEnabled;
      const activeProvider = providerOptions.provider;
      const normalizedPromptMode = promptMode === "direct" ? "direct" : "auto";
      const generationPrompt = storyboardPrefix + prompt;

      if (!prompt) return res.status(400).json({ error: "Prompt is required" });
      const moderationCheck = validateModeration(ctx, moderation);
      if (moderationCheck.error) return res.status(400).json({ error: moderationCheck.error });
      const count = Math.min(Math.max(parseInt(n) || 1, 1), 8);
      requestPrompt = typeof prompt === "string" ? prompt : "";
      requestedCount = count;
      const referencePayload = summarizeReferencePayload(references);

      startJob({
        requestId,
        kind: "classic",
        prompt,
        meta: {
          kind: "classic",
          sessionId,
          parentNodeId: null,
          clientNodeId,
          quality,
          model: imageModel,
          size: effectiveSize,
          n: count,
          refsCount: referencePayload.refsCount,
          referenceBytes: referencePayload.referenceBytes,
          referenceB64Chars: referencePayload.referenceB64Chars,
          composerPrompt,
          composerInsertedPrompts,
        },
      });
      registerJobAbortController(requestId, cancelController);

      const refCheckResult = validateAndNormalizeRefs(references);
      if (refCheckResult.error) {
        finishStatus = "error";
        finishHttpStatus = 400;
        finishErrorCode = refCheckResult.code;
        return res.status(400).json({ error: refCheckResult.error, code: refCheckResult.code });
      }
      const refCheck = refCheckResult as Extract<typeof refCheckResult, { refs: string[] }>;
      if ((activeProvider === "grok" || activeProvider === "agy" || activeProvider === "grok-api" || activeProvider === "gemini-api") && refCheck.refs.length > 3) {
        finishStatus = "error";
        finishHttpStatus = 400;
        finishErrorCode = activeProvider === "agy" ? "AGY_REF_TOO_MANY" : "GROK_REF_TOO_MANY";
        return res.status(400).json({
          error: `${activeProvider === "agy" ? "Agy" : "Grok"} image editing supports up to 3 reference images`,
          code: activeProvider === "agy" ? "AGY_REF_TOO_MANY" : "GROK_REF_TOO_MANY",
          requestId,
        });
      }

      const client = req.get("x-ima2-client") || "ui";
      const referenceDiagnostics = refCheck.referenceDiagnostics || [];
      const referenceMismatchCount = referenceDiagnostics.filter((ref) => ref.warnings?.includes("mime_mismatch")).length;
      logEvent("generate", "request", {
        requestId,
        client,
        provider: activeProvider,
        quality,
        model: imageModel,
        size: effectiveSize,
        moderation,
        n: count,
        refs: refCheck.refs.length,
        referenceBytes: referencePayload.referenceBytes,
        referenceMismatchCount,
        refDetectedMimes: [...new Set(referenceDiagnostics.map((ref) => ref.detectedMime).filter(Boolean))].join(","),
        refDeclaredMimes: [...new Set(referenceDiagnostics.map((ref) => ref.declaredMime).filter(Boolean))].join(","),
        sessionId,
        clientNodeId,
        promptChars: typeof prompt === "string" ? prompt.length : 0,
        promptMode: normalizedPromptMode,
        webSearchEnabled,
      });
      const startTime = Date.now();

      const mimeMap: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
      const effectiveFormat = activeProvider === "grok" || activeProvider === "agy" || activeProvider === "grok-api" || activeProvider === "gemini-api" ? "jpeg" : String(format);
      const mime = mimeMap[effectiveFormat] || "image/png";
      await mkdir(ctx.config.storage.generatedDir, { recursive: true });

      const grokDirectApiKey = activeProvider === "grok-api" ? ctx.xaiApiKey : undefined;
      const sharedGrokPlan = activeProvider === "grok" || activeProvider === "grok-api"
        ? await planGrokImage(generationPrompt, ctx, {
          model: quality === "high" ? "grok-imagine-image-quality" : imageModel,
          size: effectiveSize,
          signal: cancelController.signal,
          requestId,
          referenceCount: refCheck.refs.length,
          references: refCheck.refDetails,
          directApiKey: grokDirectApiKey,
        })
        : null;
      const streamResponse = count > 1 && (req.get("accept") || "").includes("text/event-stream");
      if (streamResponse) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();
        sendSse(res, "phase", { phase: "generating", requestId, requested: count });
      }

      const generateOne = async () => {
        if (activeProvider === "gemini-api") {
          const r = await generateViaGeminiApi(generationPrompt, requireRuntimeContext(ctx), {
            model: imageModel,
            size: effectiveSize,
            signal: cancelController.signal,
            requestId,
            references: refCheck.refDetails,
          });
          throwIfJobCanceled(requestId);
          return r;
        }

        if (activeProvider === "agy") {
          const r = await generateViaAgy(generationPrompt, {
            references: refCheck.refDetails,
            signal: cancelController.signal,
            requestId,
          });
          throwIfJobCanceled(requestId);
          return r;
        }

        if (activeProvider === "grok" || activeProvider === "grok-api") {
          const grokModel = quality === "high" ? "grok-imagine-image-quality" : imageModel;
          const r = await generateViaGrok(generationPrompt, ctx, {
            model: grokModel,
            size: effectiveSize,
            signal: cancelController.signal,
            requestId,
            plannedPrompt: sharedGrokPlan?.prompt,
            webSearchCalls: sharedGrokPlan?.webSearchCalls,
            references: refCheck.refDetails,
            directApiKey: grokDirectApiKey,
          });
          throwIfJobCanceled(requestId);
          return r;
        }

        const MAX_RETRIES = 1;
        let lastErr: unknown;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const r = await generateViaResponses(
              activeProvider,
              generationPrompt,
              quality,
              effectiveSize,
              moderation,
              refCheck.refDetails || refCheck.refs,
              requestId,
              normalizedPromptMode,
              ctx,
              {
                model: imageModel,
                reasoningEffort,
                webSearchEnabled,
                signal: cancelController.signal,
                allowPromptOnlyOAuthFallback: activeProvider !== "api",
              },
            );
            throwIfJobCanceled(requestId);
            if (r.b64) return r;
            lastErr = new Error("Empty response (safety refusal)");
          } catch (e) {
            lastErr = e;
            if (isNonRetryableGenerationError(e as UpstreamErr | null | undefined)) break;
          }
          if (attempt < MAX_RETRIES) {
            const errCode = (lastErr && typeof lastErr === "object" && "code" in lastErr)
              ? (lastErr as { code?: unknown }).code
              : undefined;
            logEvent("generate", "retry", { requestId, attempt: attempt + 1, errorCode: errCode });
          }
        }
        throw normalizeGenerationFailure(lastErr as UpstreamErr | null | undefined, {
          safetyMessage: "Content generation refused after retries",
        });
      };

      const images: Array<{ image: string; filename: string; revisedPrompt: any }> = [];
      const metadataByFilename = new Map<string, Record<string, unknown>>();
      let totalUsage: Record<string, number> | null = null;
      let totalWebSearchCalls = 0;
      let firstRetryMeta: Record<string, unknown> | null = null;
      const persistGeneratedResult = async (
        value: Awaited<ReturnType<typeof generateOne>>,
        index: number,
      ) => {
        if (!value.b64) return;
        throwIfJobCanceled(requestId);
        const valueWithMime = value as typeof value & { mime?: string };
        const resultMime = activeProvider === "grok" || activeProvider === "agy" || activeProvider === "grok-api" || activeProvider === "gemini-api"
          ? (valueWithMime.mime || detectImageMimeFromB64(value.b64) || mime)
          : mime;
        const resultFormat = activeProvider === "grok" || activeProvider === "agy" || activeProvider === "grok-api" || activeProvider === "gemini-api" ? imageFormatFromMime(resultMime) : effectiveFormat;
        const retryValue = value as typeof value & {
          retryKind?: string;
          initialEventCount?: number;
          initialEventTypes?: unknown;
          referencesDroppedOnRetry?: boolean;
          developerPromptDroppedOnRetry?: boolean;
          webSearchDroppedOnRetry?: boolean;
        };
        if (!firstRetryMeta && retryValue.retryKind) {
          firstRetryMeta = {
            retryKind: retryValue.retryKind,
            initialEventCount: retryValue.initialEventCount ?? null,
            initialEventTypes: retryValue.initialEventTypes || null,
            referencesDroppedOnRetry: retryValue.referencesDroppedOnRetry ?? null,
            developerPromptDroppedOnRetry: retryValue.developerPromptDroppedOnRetry ?? null,
            webSearchDroppedOnRetry: retryValue.webSearchDroppedOnRetry ?? null,
          };
        }
        const rand = randomBytes(ctx.config.ids.generatedHexBytes).toString("hex");
        const filename = `${Date.now()}_${rand}_${index}.${resultFormat}`;
        const meta = {
          kind: "classic",
          requestId,
          sessionId,
          clientNodeId,
          prompt,
          userPrompt: prompt,
          revisedPrompt: value.revisedPrompt || null,
          promptMode: normalizedPromptMode,
          composerPrompt,
          composerInsertedPrompts,
          quality,
          size: effectiveSize,
          format: resultFormat,
          moderation,
          model: activeProvider === "grok" ? (quality === "high" ? "grok-imagine-image-quality" : imageModel) : imageModel,
          reasoningEffort,
          provider: activeProvider,
          createdAt: Date.now(),
          usage: value.usage || null,
          webSearchCalls: value.webSearchCalls || 0,
          webSearchEnabled,
          refsCount: refCheck.refs.length,
        };
        const rawBuffer = Buffer.from(value.b64, "base64");
        const embedded: any = await embedImageMetadataBestEffort(rawBuffer, resultFormat, meta, {
          version: ctx.packageVersion,
        });
        if (!embedded.embedded) {
          logEvent("generate", "metadata_embed_skipped", {
            requestId,
            filename,
            code: embedded.code,
            warning: embedded.warning,
          });
        }
        const filePath = join(ctx.config.storage.generatedDir, filename);
        await writeFile(filePath, embedded.buffer);
        if (resultFormat !== "png") await safeWriteSidecar(filePath + ".json", meta);
        metadataByFilename.set(filename, meta);
        invalidateHistoryIndex();
        const image = {
          image: `data:${resultMime};base64,${value.b64}`,
          filename,
          revisedPrompt: value.revisedPrompt || null,
        };
        images.push(image);
        if (streamResponse) {
          sendSse(res, "image", {
            ...image,
            elapsed: +((Date.now() - startTime) / 1000).toFixed(1),
            requestId,
            provider: activeProvider,
            quality,
            size: effectiveSize,
            moderation,
            model: imageModel,
            reasoningEffort,
            promptMode: normalizedPromptMode,
          });
        }
        if (value.usage) {
          const usageValue = value.usage;
          if (!totalUsage) totalUsage = { ...usageValue };
          else {
            const tu = totalUsage;
            Object.keys(usageValue).forEach((k) => {
              if (typeof usageValue[k] === "number") tu[k] = (tu[k] || 0) + usageValue[k];
            });
          }
        }
        if (typeof value.webSearchCalls === "number") {
          totalWebSearchCalls = activeProvider === "grok" || activeProvider === "grok-api"
            ? Math.max(totalWebSearchCalls, value.webSearchCalls)
            : totalWebSearchCalls + value.webSearchCalls;
        }
      };

      const results = await Promise.allSettled(
        Array.from({ length: count }, (_, index) =>
          generateOne().then(async (value) => {
            await persistGeneratedResult(value, index);
            return value;
          }),
        ),
      );
      throwIfJobCanceled(requestId);
      for (const r of results) {
        if (r.status === "rejected") {
          logError("generate", "parallel_failed", r.reason, { requestId });
        }
      }

      if (images.length === 0) {
        const firstErr = results.find((r) => r.status === "rejected")?.reason;
        if (firstErr?.code) {
          const status = firstErr.status || 500;
          if (isGenerationCanceledError(firstErr)) {
            finishCanceled = true;
            finishHttpStatus = firstErr.status;
            finishErrorCode = firstErr.code;
            if (streamResponse) {
              sendSse(res, "error", {
                error: firstErr.message,
                code: firstErr.code,
                status: firstErr.status,
                requestId,
              });
              res.end();
              return;
            }
            return res.status(firstErr.status).json({
              error: firstErr.message,
              code: firstErr.code,
              requestId,
            });
          }
          finishStatus = "error";
          finishHttpStatus = status;
          finishErrorCode = firstErr.code;
          requestError = firstErr.message || String(firstErr.code);
          if (streamResponse) {
            sendSse(res, "error", {
              error: firstErr.message,
              code: firstErr.code,
              status,
              requestId,
            });
            res.end();
            return;
          }
          return res.status(status).json({
            error: firstErr.message,
            code: firstErr.code,
            upstreamCode: firstErr.upstreamCode || null,
            upstreamType: firstErr.upstreamType || null,
            upstreamParam: firstErr.upstreamParam || null,
            diagnosticReason: firstErr.diagnosticReason || null,
            retryKind: firstErr.retryKind || null,
            initialEventCount: firstErr.initialEventCount ?? null,
            initialEventTypes: firstErr.initialEventTypes || null,
            referencesDroppedOnRetry: firstErr.referencesDroppedOnRetry ?? null,
            developerPromptDroppedOnRetry: firstErr.developerPromptDroppedOnRetry ?? null,
            webSearchDroppedOnRetry: firstErr.webSearchDroppedOnRetry ?? null,
            fallbackEventCount: firstErr.fallbackEventCount ?? null,
            fallbackEventTypes: firstErr.fallbackEventTypes || null,
            fallbackImageCallSeen: firstErr.fallbackImageCallSeen ?? null,
            fallbackImageResultCount: firstErr.fallbackImageResultCount ?? null,
            errorEventCount: firstErr.eventCount ?? null,
            eventTypes: firstErr.eventTypes || null,
            webSearchCalls: firstErr.webSearchCalls ?? null,
            responseDiagnostics: firstErr.responseDiagnostics || null,
            toolTypes: firstErr.toolTypes || null,
            toolChoiceKind: firstErr.toolChoiceKind || null,
            requestId,
          });
        }
        finishStatus = "error";
        finishHttpStatus = 500;
        finishErrorCode = "GENERATE_ALL_FAILED";
        requestError = "All generation attempts failed";
        if (streamResponse) {
          sendSse(res, "error", {
            error: requestError,
            code: finishErrorCode,
            status: finishHttpStatus,
            requestId,
          });
          res.end();
          return;
        }
        return res.status(500).json({ error: "All generation attempts failed" });
      }

      const elapsed = +((Date.now() - startTime) / 1000).toFixed(1);
      // Persist elapsed after the parallel generation loop completes.
      await Promise.all(
        images.map(async ({ filename }) => {
          try {
            if (filename.toLowerCase().endsWith(".png")) {
              const filePath = join(ctx.config.storage.generatedDir, filename);
              const meta = { ...(metadataByFilename.get(filename) || {}), elapsed };
              const embedded = await embedImageMetadataBestEffort(await readFile(filePath), "png", meta, {
                version: ctx.packageVersion,
              });
              await writeFile(filePath, embedded.buffer);
              return;
            }
            const sidecarPath = join(ctx.config.storage.generatedDir, filename + ".json");
            const sidecarMeta = JSON.parse(await readFile(sidecarPath, "utf-8"));
            sidecarMeta.elapsed = elapsed;
            await atomicWriteJson(sidecarPath, sidecarMeta);
          } catch {
            /* best-effort elapsed patch */
          }
        }),
      );
      const firstRevised = images[0]?.revisedPrompt || null;
      const extra = {
        usage: totalUsage,
        provider: activeProvider,
        reasoningEffort,
        webSearchCalls: totalWebSearchCalls,
        quality,
        size: effectiveSize,
        moderation,
        model: imageModel,
        warnings: qualityWarnings,
        revisedPrompt: firstRevised,
        promptMode: normalizedPromptMode,
        webSearchEnabled,
        ...(firstRetryMeta || {}),
      };

      if (count === 1) {
        finishHttpStatus = 200;
        finishMeta = { filenames: [images[0].filename], imageCount: 1 };
        logEvent("generate", "saved", {
          requestId,
          imageCount: 1,
          elapsedMs: Date.now() - startTime,
          filename: images[0].filename,
        });
        res.json({ image: images[0].image, elapsed, filename: images[0].filename, requestId, ...extra });
      } else {
        finishHttpStatus = 200;
        finishMeta = { filenames: images.map((image) => image.filename), imageCount: images.length };
        logEvent("generate", "saved", {
          requestId,
          imageCount: images.length,
          elapsedMs: Date.now() - startTime,
        });
        const payload = { images, elapsed, count: images.length, requestId, ...extra };
        if (streamResponse) {
          sendSse(res, "done", payload);
          res.end();
        } else res.json(payload);
      }
    } catch (e) {
      const err = errInfo(e);
      const ext = (err.raw && typeof err.raw === "object" ? err.raw as Record<string, unknown> : {});
      const fallbackCode = err.code || classifyUpstreamError(err.message);
      if (isGenerationCanceledError(err.raw) || isJobCanceled(requestId)) {
        const canceled = makeGenerationCanceledError();
        finishCanceled = true;
        finishHttpStatus = canceled.status;
        finishErrorCode = canceled.code;
        if (res.headersSent) {
          sendSse(res, "error", {
            error: canceled.message,
            code: canceled.code,
            status: canceled.status,
            requestId,
          });
          res.end();
          return;
        }
        return res.status(canceled.status).json({
          error: canceled.message,
          code: canceled.code,
          requestId,
        });
      }
      finishStatus = "error";
      finishHttpStatus = err.status || 500;
      finishErrorCode = fallbackCode || "GENERATE_FAILED";
      requestError = err.message;
      logError("generate", "error", err.raw, { requestId, code: finishErrorCode });
      if (res.headersSent) {
        sendSse(res, "error", {
          error: err.message,
          code: fallbackCode,
          status: err.status || 500,
          requestId,
        });
        res.end();
        return;
      }
      res.status(err.status || 500).json({
        error: err.message,
        code: fallbackCode,
        upstreamCode: ext.upstreamCode || null,
        upstreamType: ext.upstreamType || null,
        upstreamParam: ext.upstreamParam || null,
        diagnosticReason: ext.diagnosticReason || null,
        retryKind: ext.retryKind || null,
        initialEventCount: ext.initialEventCount ?? null,
        initialEventTypes: ext.initialEventTypes || null,
        referencesDroppedOnRetry: ext.referencesDroppedOnRetry ?? null,
        developerPromptDroppedOnRetry: ext.developerPromptDroppedOnRetry ?? null,
        webSearchDroppedOnRetry: ext.webSearchDroppedOnRetry ?? null,
        fallbackEventCount: ext.fallbackEventCount ?? null,
        fallbackEventTypes: ext.fallbackEventTypes || null,
        fallbackImageCallSeen: ext.fallbackImageCallSeen ?? null,
        fallbackImageResultCount: ext.fallbackImageResultCount ?? null,
        errorEventCount: ext.eventCount ?? null,
        eventTypes: ext.eventTypes || null,
        webSearchCalls: ext.webSearchCalls ?? null,
        responseDiagnostics: ext.responseDiagnostics || null,
        toolTypes: ext.toolTypes || null,
        toolChoiceKind: ext.toolChoiceKind || null,
        requestId,
      });
    } finally {
      finishJob(requestId, {
        canceled: finishCanceled,
        status: finishStatus,
        httpStatus: finishHttpStatus,
        errorCode: finishErrorCode,
        meta: finishMeta,
      });
      if (requestPrompt) {
        await appendGenerationRequestLog(ctx.config.storage.generationRequestLogFile, {
          id: `${Date.now()}_${randomBytes(4).toString("hex")}`,
          requestId,
          createdAt: Date.now(),
          prompt: requestPrompt,
          requested: requestedCount,
          succeeded: Number((finishMeta as { imageCount?: number }).imageCount || 0),
          error: requestError,
        }).catch((error) => {
          logError("generate", "request_log_failed", error, { requestId });
        });
      }
    }
  });
}
