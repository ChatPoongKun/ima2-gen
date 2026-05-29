---
created: 2026-05-25
status: P / plan
tags: [phase2, parser, responses-api, payload]
depends_on:
  - 00_overview.md
  - 02_phase1_diagnostics_and_doctor.md
---

# Phase 2 Parser And Payload Hardening

## Goal

Make the Responses parser accept documented image-stream variants and make the
Classic generation payload unambiguously require an image.

## Robust SSE Parsing

Update `extractSseData()` and the stream loop to support:

- `data: {...}`;
- `data:{...}`;
- LF and CRLF block delimiters;
- multi-line `data:` blocks;
- final non-empty buffer diagnostics.

Suggested parser rule:

```ts
function extractSseData(block: string) {
  let eventData = "";
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("data:")) {
      eventData += line.slice(5).trimStart();
    }
  }
  return eventData;
}
```

Do not treat parse failures as success. Count them as `parseSkipCount` and keep
only safe metadata.

## Image Event Extraction

Extend `SseData` and extraction helpers to handle current documented fields:

```ts
partial_image_b64?: string;
partial_image_index?: number;
```

Partial images are not the final answer, but missing their shape is evidence
that the parser is lagging behind the API surface.

For final images:

- keep accepting `response.output_item.done` with `image_generation_call.result`;
- additionally scan `response.completed.response.output[]` for
  `image_generation_call.result`;
- record `image_generation_call` items with failed or incomplete status even
  when no result exists.

## Payload Rule For Classic Generation

For Classic text-to-image where the expected output is always an image, prefer
a forced image tool:

```ts
tool_choice: { type: "image_generation" }
```

This aligns with OpenAI image-generation docs and avoids a web-search-only
tool call satisfying `tool_choice: "required"`.

## Search Separation

Do not rely on a single call containing both `web_search` and
`image_generation` unless diagnostics prove it is stable.

Preferred future flow for factual prompts:

```text
Phase A: optional search/planning call
  tools: [web_search]
  output: safe factual visual clarifiers

Phase B: image call
  tools: [image_generation]
  tool_choice: { type: "image_generation" }
  output: image_generation_call.result
```

This separates "search failed" from "image failed" and makes cost/latency
easier to explain.

## Config And Compatibility

Do not hardcode behavior only in the route. Add a small config or provider
option if rollout needs a guard:

```text
oauth.forceImageToolChoice: true
oauth.splitSearchAndImage: false
oauth.emptyResponseJsonFallback: true
```

Default should be conservative:

- force image tool for image-only Classic requests;
- keep search optional and explicit;
- keep fallback enabled for OAuth first.

## Acceptance

Phase 2 is acceptable when:

- stream fixtures with `data:` no-space and CRLF delimiters parse;
- fixtures with `partial_image_b64` are recognized;
- fixtures with final image inside completed output are recognized;
- web-search-only responses become a diagnostic code, not generic empty;
- Classic generation payload can force `image_generation`;
- tests lock the chosen payload for web-search-enabled and search-off requests.
