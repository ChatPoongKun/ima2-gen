import type { GenerateItem } from "../types";

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

export function isVideoUrl(src: string | null | undefined): boolean {
  if (!src || src.startsWith("data:image/")) return false;
  const clean = src.split("?")[0];
  return VIDEO_EXT.test(clean) || src.startsWith("data:video/");
}

export function isVideoItem(
  item: Pick<GenerateItem, "filename" | "url" | "image"> | null | undefined,
): boolean {
  if (!item) return false;
  return isVideoUrl(item.filename) || isVideoUrl(item.url) || isVideoUrl(item.image);
}
