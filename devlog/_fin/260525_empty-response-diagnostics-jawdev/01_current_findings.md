---
created: 2026-05-25
status: P / plan
tags: [source-audit, empty-response, oauth, responses-api]
depends_on:
  - 00_overview.md
---

# Current Findings

## Local Runtime Snapshot

Observed on the maintainer machine:

```text
ima2-gen v1.1.13
Node.js v24.14.1
Configured provider: oauth
Backend actual URL: http://127.0.0.1:3333
OAuth actual URL: http://127.0.0.1:10534 (ready)
Doctor: 6 passed, 0 failed
openai-oauth: 1.0.2
Default OAuth model: gpt-5.4-mini
Default OAuth reasoning: medium
API web search default: enabled
```

This proves the local repo can start with OAuth ready, but it does not prove a
remote Windows user has working image-tool entitlement through the Codex OAuth
backend.

## UI Surface

The Korean card lives in:

```text
ui/src/i18n/ko.json
  errorCard.emptyResponse.title = "이미지가 돌아오지 않았어요"
  errorCard.emptyResponse.body  = "Codex가 응답을 보냈지만 이미지 데이터가 비어 있었어요..."
```

The copy is user-friendly, but too coarse for support. It currently hides
whether the backend saw bytes, saw events, saw an image tool call, saw only web
search, or saw an upstream image-tool failure.

## Active Classic Generation Path

`routes/generate.ts` imports and calls `generateViaResponses()`:

```text
routes/generate.ts
  import { generateViaResponses } from "../lib/responsesImageAdapter.js";
```

Inside `generateOne()`, every Classic generation attempt calls:

```text
generateViaResponses(
  activeProvider,
  prompt,
  quality,
  effectiveSize,
  moderation,
  refs,
  requestId,
  normalizedPromptMode,
  ctx,
  { model, reasoningEffort, webSearchEnabled, signal }
)
```

Therefore the old Classic `generateViaOAuth()` logic is not the route of record
for this UI error.

## Current Responses Payload Shape

`lib/responsesImageAdapter.ts` builds tools like this:

```ts
function tools(webSearchEnabled: boolean, imageOptions: ImageGenOptions) {
  return [
    ...(webSearchEnabled ? [{ type: "web_search" }] : []),
    { type: "image_generation", ...imageOptions },
  ];
}
```

Classic generation then sends:

```ts
{
  model,
  input: [
    { role: "developer", content: ... },
    { role: "user", content: userContent },
  ],
  tools: tools(webSearchEnabled, { quality, size, moderation }),
  tool_choice: "required",
  reasoning: { effort },
  stream: true,
}
```

Risk: `tool_choice: "required"` requires at least one tool call, not necessarily
the image tool. If `web_search` is available, a web-search-only response can
satisfy the requirement and still contain no image.

## Current Stream Parser Shape

The stream parser tracks event counts and text, but only records a final image
when this exact event arrives:

```ts
data.type === "response.output_item.done" &&
data.item?.type === "image_generation_call" &&
data.item.result
```

It currently misses or under-records:

- `data:` lines without a space after the colon;
- CRLF-delimited SSE blocks;
- `partial_image_b64` and `partial_image_index`;
- image summaries in `response.completed.response.output`;
- image-call status, failure, or error fields;
- message-only output as an explicit diagnostic reason;
- web-search-only completion as a distinct error type.

## Error Collapse

If `generateViaResponses()` sees no parsed image, it throws:

```ts
makeError("No image data received from Responses API", {
  code: "EMPTY_RESPONSE",
  eventCount: result.eventCount,
});
```

That means the route loses:

- `eventTypes`;
- `webSearchCalls`;
- output item summaries;
- text output length;
- image-call status;
- stream byte/chunk stats;
- model/quality/size/moderation context.

`lib/generationErrors.ts` then treats event-count-bearing errors as
`EMPTY_RESPONSE`, which makes several different root causes appear identical in
the UI.

## Lost Fallback From Older OAuth Path

The older `lib/oauthProxy/generators.ts` path did this after a streamed no-image
result:

1. log `retry_json`;
2. retry `stream: false`;
3. send prompt-only input;
4. use only `image_generation`;
5. drop the developer prompt;
6. preserve event types, model, size, quality, refs, and retry metadata on
   failure.

This fallback is useful both as mitigation and diagnosis. If it succeeds, the
account can generate images and the defect is in the stream/current payload
shape rather than moderation or entitlement.
