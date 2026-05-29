---
created: 2026-05-25
status: P / plan
tags: [verification, tests, risks, acceptance]
depends_on:
  - 00_overview.md
  - 04_image_tool_call_hardening.md
---

# Verification Risks Acceptance

## Required Tests

### Parser Fixtures

Add or update:

```text
tests/responses-image-stream-parser-contract.test.ts
tests/responses-image-adapter-contract.test.ts
```

Cases:

- `data: {...}\n\n` parses;
- `data:{...}\n\n` parses;
- CRLF-delimited SSE parses;
- multi-line `data:` blocks parse;
- `partial_image_b64` is recognized;
- final image from `response.output_item.done` is recognized;
- final image from `response.completed.response.output[]` is recognized;
- web-search-only + message output is classified distinctly;
- bytes read with zero parsed events becomes `STREAM_PARSE_FAILED`;
- image call failed without result becomes `IMAGE_TOOL_FAILED`.

### Payload Contracts

Add or update:

```text
tests/responses-image-payload-contract.test.ts
```

Cases:

- Classic generation can force `tool_choice: { type: "image_generation" }`;
- search-off Classic payload has only `image_generation`;
- search-enabled factual flow does not let `web_search` alone satisfy image
  generation;
- OAuth retry payload is prompt-only, non-stream, image-tool-only;
- API provider behavior remains compatible.

### Error Classification

Add or update:

```text
tests/generation-error-classification-contract.test.ts
```

Cases:

- old `EMPTY_RESPONSE` still maps to current generic UI fallback;
- `WEB_SEARCH_ONLY_RESPONSE` maps to a specific diagnostic reason;
- `STREAM_PARSE_FAILED` maps to stream parse copy/status;
- `IMAGE_TOOL_FAILED` preserves safe upstream code/type;
- retry metadata is preserved through `routes/generate.ts`.

### Doctor Probe

Add:

```text
tests/image-doctor-probe-contract.test.ts
```

Cases:

- probe result contains no raw prompt text;
- probe result contains no base64;
- probe result distinguishes text, non-stream image, stream image, current
  payload, and forced-image outcomes;
- JSON output is stable for issue attachment.

## Manual QA

Run on macOS maintainer machine:

```text
ima2 doctor
ima2 doctor image-probe --json
ima2 gen "고양이" --no-web-search --json
ima2 gen "고양이" --json
```

Run on at least one Windows machine when available:

```text
ima2 doctor
ima2 doctor image-probe --json
```

Browser/UI QA:

- trigger a forced fake `WEB_SEARCH_ONLY_RESPONSE`;
- trigger a fake `STREAM_PARSE_FAILED`;
- trigger a fake generic `EMPTY_RESPONSE`;
- confirm Korean cards remain readable;
- confirm advanced diagnostic fields are not shown as noisy primary copy.

## Static Verification

Expected commands after implementation:

```bash
npm run typecheck
npm run typecheck:tests
npm test
cd ui && npx tsc -b --noEmit
cd ui && npm run build
```

If some commands do not exist in the current package, record the exact failure
and use the closest existing project command only after explicit decision.

## Risks

### Privacy Leak

Diagnostics can accidentally log prompt text, revised prompts, images, tokens,
or upstream body snippets.

Mitigation:

- use lengths, booleans, enum fields, counts, and hashes only;
- add tests that assert absent sensitive fields;
- do not include raw upstream bodies in route JSON.

### Hidden Behavior Change

Forcing `image_generation` may remove some currently useful search-then-image
behavior.

Mitigation:

- Classic simple image generation should force image;
- factual search should become a two-step flow;
- keep a config guard during rollout if needed.

### False Capability Diagnosis

OAuth/Codex entitlement can vary by account, plan, region, and model list.

Mitigation:

- doctor probes should report observations, not make unsupported claims;
- compare API-key path only when configured;
- keep account-specific language in support copy.

### Retry Cost

Non-stream fallback can create an extra image call.

Mitigation:

- retry only after streamed no-image result;
- retry once;
- log retry metadata;
- consider exposing retry occurrence in debug details.

## Acceptance Summary

The lane is ready to implement when:

- Phase 1 doctor/fingerprint scope is accepted;
- payload rule is chosen: force image tool now, or ship behind config first;
- fallback policy is chosen: OAuth-only first or all providers;
- tests listed above are mapped to existing test harness files;
- public support output is confirmed safe to paste into GitHub/DCInside issue
  comments.
