---
created: 2026-05-25
status: P / plan
tags: [phase1, diagnostics, doctor, logging]
depends_on:
  - 00_overview.md
  - 01_current_findings.md
---

# Phase 1 Diagnostics And Doctor

## Goal

Make one failing Windows run explain which class of failure occurred without
logging sensitive content.

Phase 1 should not change user-visible generation behavior except for safer
diagnostic fields returned with `EMPTY_RESPONSE` and a new explicit doctor
probe command.

## Sanitized Stream Fingerprint

Add a small internal summary object in `lib/responsesImageAdapter.ts` that is
safe to log and safe to return in debug/doctor contexts.

Suggested fields:

```ts
{
  requestId,
  provider,
  endpointKind: "api" | "oauth",
  model,
  size,
  quality,
  moderation,
  stream: true,
  toolTypes: ["web_search", "image_generation"],
  toolChoiceKind: "required" | "image_generation",
  webSearchEnabled,
  refsCount,
  inputImageCount,
  promptChars,
  promptHash,

  httpStatus,
  contentType,
  upstreamRequestId,
  oauthProxyVersion,
  nodeVersion,
  platform,
  arch,

  chunkCount,
  bytesRead,
  maxChunkBytes,
  lfBoundaryCount,
  crlfBoundaryCount,
  parseSkipCount,
  finalBufferChars,
  sawDoneSentinel,
  sawResponseCompleted,

  eventCount,
  eventTypes,
  outputItemSummary,

  imageCallSeen,
  imageCallCompleted,
  imageCallFailed,
  imageResultCount,
  webSearchCalls,
  messageOutputSeen,
  outputTextChars,
  responseStatus,
  incompleteReason,
  diagnosticReason
}
```

The `promptHash` must use a stable keyed hash or app-local salt if available.
Never log raw prompt text or revised prompt text.

## Output Item Summary

Record compact entries for every `response.output_item.done` and any output
items found inside `response.completed`.

Suggested shape:

```ts
{
  eventType,
  itemType,
  status,
  hasResult,
  resultChars,
  revisedPromptChars,
  partialImageChars,
  partialImageIndex,
  hasError,
  errorCode,
  errorType,
  errorParam
}
```

Only lengths and enum-like fields should be stored.

## Doctor Probe Matrix

Add a CLI/server doctor helper, tentatively:

```text
ima2 doctor image-probe --json
```

The probe should run a fixed built-in benign prompt and report only
`probePromptId: "builtin_cat"` plus safe metadata. It should not print the
prompt body by default.

Probe order:

1. OAuth text sanity.
2. OAuth image capability, non-stream minimal.
3. OAuth image stream minimal.
4. Current payload without web search.
5. Current payload with forced image tool.
6. Model fallback against account-advertised available models.
7. Optional API-key comparison when an API key is configured.

## Probe Interpretation

| Observation | Likely Cause |
|---|---|
| Text probe fails | OAuth/proxy/model auth problem |
| Text works, non-stream image fails | OAuth/Codex image entitlement, unsupported image tool, model mismatch, or explicit refusal |
| Non-stream image works, stream image fails | stream parser, SSE, proxy, or stream option combo |
| Bytes read but `eventCount = 0` | SSE delimiter or `data:` parsing bug |
| Only `web_search_call` and `message` events | `tool_choice: "required"` plus web search interaction |
| Image call seen with failed status | upstream image tool failure |
| API-key path works, OAuth path fails | Codex OAuth entitlement/proxy difference |

## Acceptance

Phase 1 is acceptable when:

- `EMPTY_RESPONSE` includes safe diagnostic fields in server logs;
- doctor output can distinguish text/auth failure from image capability failure;
- doctor output can distinguish non-stream success from stream/parser failure;
- no raw prompts, images, OAuth tokens, auth headers, or full response bodies are logged;
- tests cover summary generation with representative stream fixtures.
