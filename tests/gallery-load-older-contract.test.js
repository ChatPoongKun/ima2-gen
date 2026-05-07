import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

test("gallery can load older pages without raising the default history cap", () => {
  const store = readSource("ui/src/store/useAppStore.ts");
  const gallery = readSource("ui/src/components/GalleryModal.tsx");
  const api = readSource("ui/src/lib/api.ts");

  assert.match(api, /favoritesOnly\?: boolean/);
  assert.match(api, /qs\.set\("favoritesOnly", "1"\)/);
  assert.match(store, /historyNextCursor:\s*HistoryCursor \| null/);
  assert.match(store, /historyLoadingOlder:\s*boolean/);
  assert.match(store, /loadOlderHistory:\s*async/);
  assert.match(store, /\.\.\.s\.history,\s*\.\.\.appended/);
  assert.match(gallery, /const historyNextCursor = useAppStore/);
  assert.match(gallery, /className="gallery__load-more"/);
  assert.match(gallery, /loadOlderHistory/);
});

test("favorites mode asks the backend for favorites before pagination", () => {
  const routes = readSource("routes/history.ts");
  const store = readSource("ui/src/store/useAppStore.ts");
  const gallery = readSource("ui/src/components/GalleryModal.tsx");

  assert.match(routes, /const favoritesOnly =/);
  assert.match(routes, /if \(favoritesOnly\) \{\s*filtered = filtered\.filter\(\(r\) => favoriteSet\.has\(r\.filename\)\);/s);
  assert.match(store, /loadFavoriteHistory:\s*async/);
  assert.match(store, /getHistory\(\{ limit: HISTORY_LIMIT, favoritesOnly: true \}\)/);
  assert.match(gallery, /void loadFavoriteHistory\(\)/);
});
