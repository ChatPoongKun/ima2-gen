import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("in-flight prompt tooltip contract", () => {
  it("keeps compact prompt rows while exposing the full prompt", () => {
    const source = readSource("ui/src/components/InFlightList.tsx");

    assert.match(source, /const fullPrompt = f\.prompt\.trim\(\)\.replace\(/);
    assert.match(source, /const promptLabel = fullPrompt \|\| t\("inflight\.noPrompt"\)/);
    assert.match(source, /title=\{promptLabel\}/);
    assert.match(source, /aria-label=\{`\$\{phaseLabel\}: \$\{promptLabel\}`\}/);
    assert.match(source, /\{truncate\(f\.prompt\)\}/);
  });

  it("does not expose a misleading cancel button before backend abort exists", () => {
    const source = readSource("ui/src/components/InFlightList.tsx");
    const api = readSource("ui/src/lib/api.ts");

    assert.doesNotMatch(source, /cancelInflight/);
    assert.doesNotMatch(source, />\s*\{?t\("common\.cancel"\)\}?\s*</);
    assert.match(api, /export async function cancelInflight/);
  });

  it("merges noPrompt into the existing locale inflight objects", () => {
    const en = JSON.parse(readSource("ui/src/i18n/en.json"));
    const ko = JSON.parse(readSource("ui/src/i18n/ko.json"));

    assert.equal(en.inflight.queued, "Queued");
    assert.equal(en.inflight.streaming, "Generating");
    assert.equal(en.inflight.decoding, "Finalizing");
    assert.equal(en.inflight.noPrompt, "No prompt");
    assert.equal(ko.inflight.queued, "대기 중");
    assert.equal(ko.inflight.streaming, "생성 중");
    assert.equal(ko.inflight.decoding, "마무리 중");
    assert.equal(ko.inflight.noPrompt, "프롬프트 없음");
  });
});
