import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (path) => readFileSync(join(root, path), "utf8");

describe("classic batch streaming UI", () => {
  it("adds each streamed image to history before the final response", () => {
    const api = readSource("ui/src/lib/api.ts");
    const store = readSource("ui/src/store/useAppStore.ts");

    assert.match(api, /export async function postGenerateStream/);
    assert.match(api, /Accept: "text\/event-stream"/);
    assert.match(api, /parsed\?\.event === "image"/);
    assert.match(api, /await handlers\.onImage\?\./);
    assert.match(store, /s\.count > 1[\s\S]*postGenerateStream/);
    assert.match(store, /onImage: async \(image\) =>/);
    assert.match(store, /await addHistory\(item, set, get\)/);
    assert.match(store, /streamedFilenames\.has\(img\.filename\)/);
  });
});
