---
created: 2026-05-25
status: P / plan
tags: [image-tool-call, tool-choice, hardening, responses-api]
depends_on:
  - 00_overview.md
  - 02_phase1_diagnostics_and_doctor.md
  - 03_phase2_parser_and_payload_hardening.md
---

# Image Tool Call Hardening

## Goal

Make image generation requests prove three separate facts:

1. the image tool was offered to the model;
2. the image tool was selected or forced when an image is mandatory;
3. the image tool call produced, failed, or skipped a result for a classified
   reason.

The current `EMPTY_RESPONSE` card does not separate those facts. This hardening
slice makes them explicit.

## Image Call Contract

For Classic text-to-image generation, the contract is:

```text
user asks for image
-> request includes image_generation tool
-> request forces or otherwise verifies image_generation selection
-> response contains image_generation_call with result
-> otherwise return a classified diagnostic
```

The app should not treat a web-search-only response, text-only message, parser
failure, or failed image call as the same condition.

## Request Builder Hardening

Add or refactor toward one explicit helper, for example:

```ts
buildImageGenerationToolRequest({
  model,
  input,
  quality,
  size,
  moderation,
  stream,
  webSearchPolicy,
  forceImageTool,
  reasoningEffort,
})
```

The helper should make the tool policy visible in tests:

```ts
{
  tools: [{ type: "image_generation", quality, size, moderation }],
  tool_choice: { type: "image_generation" },
}
```

When web search is needed, prefer a separate search/planning call before the
image call. Avoid relying on `tool_choice: "required"` with both `web_search`
and `image_generation` for mandatory image output.

## Observability Fields

Attach these safe fields to stream summaries and empty-response errors:

```ts
{
  imageToolOffered,
  imageToolChoiceForced,
  imageToolChoiceKind,
  toolTypes,
  imageCallSeen,
  imageCallCompleted,
  imageCallFailed,
  imageCallStatus,
  imageCallErrorCode,
  imageCallErrorType,
  imageResultCount,
  imageResultChars,
  webSearchCallSeen,
  messageOutputSeen,
  outputTextChars
}
```

Do not log image arguments, prompt text, revised prompt text, or base64.

## Classification Rules

The image call state should drive error codes:

```text
imageToolOffered=false
  -> IMAGE_TOOL_NOT_OFFERED

imageToolOffered=true, imageCallSeen=false, webSearchCallSeen=true
  -> WEB_SEARCH_ONLY_RESPONSE

imageToolOffered=true, imageCallSeen=false, messageOutputSeen=true
  -> IMAGE_TOOL_NOT_CALLED

imageCallSeen=true, imageCallFailed=true
  -> IMAGE_TOOL_FAILED

imageCallCompleted=true, imageResultCount=0
  -> IMAGE_TOOL_COMPLETED_WITHOUT_RESULT

bytesRead>0, eventCount=0
  -> STREAM_PARSE_FAILED
```

`EMPTY_RESPONSE` should remain only as the final unknown bucket.

## Fallback Rule

If the first streamed OAuth request does not produce an image, retry once with
the smallest possible image call:

```ts
{
  input: [{ role: "user", content: promptOnlyContent }],
  tools: [{ type: "image_generation", quality, size, moderation }],
  tool_choice: { type: "image_generation" },
  stream: false,
}
```

Record whether the fallback succeeded:

```ts
{
  retryKind: "prompt_only_json_image_tool",
  initialImageCallSeen,
  initialWebSearchCallSeen,
  initialEventTypes,
  fallbackImageCallSeen,
  fallbackImageResultCount
}
```

## Doctor Probe Coverage

`ima2 doctor image-probe --json` should include explicit image-tool-call probes:

1. image tool offered, `tool_choice: "required"`, no web search;
2. image tool offered, `tool_choice: { type: "image_generation" }`, no web
   search;
3. current payload with web search enabled;
4. current payload with forced image tool;
5. non-stream forced image tool fallback.

These probes answer whether the problem is "image tool unavailable", "image
tool not selected", "stream/parser failure", or "current payload interaction".

## Tests

Add contract tests for:

- payload includes only `image_generation` for simple Classic generation;
- payload forces `tool_choice: { type: "image_generation" }` when configured;
- multi-tool payload never classifies web-search-only output as generic empty;
- `image_generation_call` failed status becomes `IMAGE_TOOL_FAILED`;
- completed image call without result becomes
  `IMAGE_TOOL_COMPLETED_WITHOUT_RESULT`;
- fallback payload is image-tool-only and non-stream;
- logs and route JSON omit prompt text, revised prompt text, and base64.

## Acceptance

This hardening slice is complete when a support report can answer:

- Was the image tool offered?
- Was the image tool selected?
- Did the image tool fail, complete without result, or never run?
- Did web search satisfy the tool requirement instead?
- Did the fallback image-only call work?

Without those answers, `EMPTY_RESPONSE` remains too vague for real support.
