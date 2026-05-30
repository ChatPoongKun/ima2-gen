import { errInfo } from "./errInfo.js";
import { imagePayload, postGrokImages, grokError } from "./grokImageAdapter.js";
import { logEvent } from "./logger.js";
import type { RouteRuntimeContext } from "./runtimeContext.js";

export interface GrokMultimodeResult {
  images: Array<{ b64: string; revisedPrompt?: string; mime?: string }>;
  usage: Record<string, number> | null;
  webSearchCalls: number;
  extraIgnored: number;
}

export async function generateMultimodeViaGrok(
  prompt: string,
  ctx: RouteRuntimeContext,
  options: {
    model?: string;
    maxImages?: number;
    size?: string;
    signal?: AbortSignal;
    requestId?: string;
    onFinalImage?: (image: { b64: string; revisedPrompt?: string; mime?: string }, index: number) => void | Promise<void>;
  } = {},
): Promise<GrokMultimodeResult> {
  const model = options.model || (ctx.config as any).grokProvider?.defaultImageModel || "grok-imagine-image";
  const maxImages = Math.min(8, Math.max(1, options.maxImages || 4));
  const images: Array<{ b64: string; revisedPrompt?: string; mime?: string }> = [];
  let totalCost = 0;

  logEvent("grok", "multimode:start", { requestId: options.requestId, model, maxImages });

  for (let i = 0; i < maxImages; i++) {
    if (options.signal?.aborted) throw grokError("Generation canceled", 499, "GENERATION_CANCELED");

    const indexedPrompt = maxImages > 1 ? `[Image ${i + 1} of ${maxImages}] ${prompt}` : prompt;
    const payload = imagePayload(model, indexedPrompt, options.size);

    try {
      const result = await postGrokImages(ctx, payload, options.signal);
      if (result.data?.[0]?.b64_json) {
        const img = { b64: result.data[0].b64_json, mime: result.data[0].mime_type };
        images.push(img);
        if (result.usage?.cost_in_usd_ticks) totalCost += result.usage.cost_in_usd_ticks;
        await options.onFinalImage?.(img, i);
      }
    } catch (e: any) {
      if (e.code === "GENERATION_CANCELED") throw e;
      logEvent("grok", "multimode:item-error", { requestId: options.requestId, index: i, error: errInfo(e) });
    }
  }

  logEvent("grok", "multimode:done", { requestId: options.requestId, model, returned: images.length, requested: maxImages });

  const usage = totalCost > 0 ? { grok_cost_usd_ticks: totalCost } : null;
  return { images, usage, webSearchCalls: 0, extraIgnored: 0 };
}
