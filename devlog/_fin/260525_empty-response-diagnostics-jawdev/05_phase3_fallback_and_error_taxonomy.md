---
created: 2026-05-25
status: P / plan
tags: [phase3, fallback, errors, user-facing-copy]
depends_on:
  - 00_overview.md
  - 03_phase2_parser_and_payload_hardening.md
---

# Phase 3 Fallback And Error Taxonomy

## Goal

Stop using one `EMPTY_RESPONSE` bucket for every no-image outcome. Keep the UI
friendly, but give support and issue reports enough structure to diagnose the
cause.

## Restore Prompt-Only Non-Stream Fallback

After a streamed OAuth no-image result, retry once with the minimal payload:

```ts
{
  model,
  input: [{ role: "user", content: buildUserTextPrompt(prompt, mode, { webSearchEnabled: false }) }],
  tools: [{ type: "image_generation", quality, size, moderation }],
  tool_choice: { type: "image_generation" },
  stream: false,
}
```

Attach retry metadata:

```ts
{
  retryKind: "prompt_only_json_image_tool",
  initialEventCount,
  initialEventTypes,
  referencesDroppedOnRetry,
  developerPromptDroppedOnRetry: true,
  webSearchDroppedOnRetry: true
}
```

If the fallback succeeds, return the image and log the initial stream result as
a warning. If it fails, return a more specific diagnostic code.

## Suggested Error Codes

Add app-level codes that preserve friendly copy while separating root causes:

```text
STREAM_PARSE_FAILED
IMAGE_TOOL_NOT_CALLED
WEB_SEARCH_ONLY_RESPONSE
IMAGE_TOOL_FAILED
IMAGE_TOOL_COMPLETED_WITHOUT_RESULT
OAUTH_IMAGE_CAPABILITY_UNAVAILABLE
RESPONSES_STREAM_ERROR
EMPTY_RESPONSE
```

`EMPTY_RESPONSE` should remain as the final unknown bucket, not the first
classification.

## Classification Rules

Suggested order:

```ts
if (bytesRead > 0 && eventCount === 0) return "STREAM_PARSE_FAILED";
if (!imageCallSeen && webSearchCalls > 0) return "WEB_SEARCH_ONLY_RESPONSE";
if (!imageCallSeen && messageOutputSeen) return "IMAGE_TOOL_NOT_CALLED";
if (imageCallFailed) return "IMAGE_TOOL_FAILED";
if (imageCallCompleted && imageResultCount === 0) return "IMAGE_TOOL_COMPLETED_WITHOUT_RESULT";
if (textWorks && minimalImageFails) return "OAUTH_IMAGE_CAPABILITY_UNAVAILABLE";
return "EMPTY_RESPONSE";
```

The doctor command can calculate `textWorks` and `minimalImageFails`; the
normal generation path should classify from observed stream metadata only.

## UI Copy Direction

Keep user copy simple:

- `WEB_SEARCH_ONLY_RESPONSE`: "이미지 도구가 호출되지 않았어요."
- `STREAM_PARSE_FAILED`: "이미지 응답 스트림을 해석하지 못했어요."
- `IMAGE_TOOL_FAILED`: "이미지 도구 호출이 실패했어요."
- `OAUTH_IMAGE_CAPABILITY_UNAVAILABLE`: "현재 OAuth 계정/모델에서 이미지 도구를 사용할 수 없는 것 같아요."
- `EMPTY_RESPONSE`: keep the current generic fallback.

Advanced fields should stay in details/debug JSON, not the main card body.

## Route Response

Extend current error response fields safely:

```ts
{
  error,
  code,
  diagnosticReason,
  eventTypes,
  errorEventCount,
  webSearchCalls,
  imageCallSeen,
  imageCallFailed,
  messageOutputSeen,
  retryKind,
  requestId
}
```

Keep raw upstream body out of the response.

## Acceptance

Phase 3 is acceptable when:

- old generic card still works as fallback;
- no-image fixtures classify into at least four distinct codes;
- stream fallback success path is covered;
- fallback metadata is visible in logs and JSON;
- current user-facing Korean copy remains calm and non-alarming;
- support can ask for one safe JSON blob instead of screenshots of vague UI.
