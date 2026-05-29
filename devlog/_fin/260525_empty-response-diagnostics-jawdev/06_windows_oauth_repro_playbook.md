---
created: 2026-05-25
status: P / plan
tags: [windows, oauth, repro, support]
depends_on:
  - 00_overview.md
  - 02_phase1_diagnostics_and_doctor.md
---

# Windows OAuth Repro Playbook

## Goal

Give affected Windows users one safe way to produce actionable evidence without
sharing tokens, account cookies, raw prompts, or image data.

## User-Facing Minimal Steps

Recommended public support script:

```powershell
ima2 doctor
ima2 doctor image-probe --json > ima2-image-probe.json
```

If the app supports a one-shot generation CLI:

```powershell
ima2 gen "고양이" --no-web-search --json > ima2-cat-no-search.json
ima2 gen "고양이" --json > ima2-cat-current.json
```

The generated JSON must be safe to attach to an issue.

## What To Ask The User

Ask for:

- `ima2 doctor` output;
- `ima2 doctor image-probe --json` output;
- ima2-gen version;
- Windows version;
- whether they use VPN, corporate proxy, antivirus TLS inspection, or custom CA;
- whether SecretDNS or another DNS/fragmentation bypass tool auto-starts with
  Windows;
- whether API-key provider works on the same machine, if they already have an
  API key configured.

Do not ask for:

- ChatGPT cookies;
- OAuth token files;
- API keys;
- full raw upstream responses;
- prompt history;
- generated base64.

## Expected Probe Outcomes

### Case A: OAuth Text Fails

Likely root:

- expired OAuth;
- proxy not reachable;
- DNS/fragmentation bypass tool such as SecretDNS interfering with OAuth or SSE;
- model unavailable;
- local port/security software interference.

Next action:

- re-auth;
- inspect `openai-oauth` version;
- inspect proxy/CA environment;
- avoid image-specific changes until text is stable.

### Case B: Text Works, Minimal Non-Stream Image Fails

Likely root:

- account/Codex image entitlement mismatch;
- model tool unsupported through OAuth;
- upstream refusal or image tool unavailable.

Next action:

- compare available `/v1/models`;
- try configured supported image models;
- compare API-key path only if available.

### Case C: Non-Stream Image Works, Stream Image Fails

Likely root:

- SSE parser bug;
- stream transport buffering;
- upstream stream event shape drift.

Next action:

- fix parser and keep non-stream fallback.

### Case D: Search-Off Works, Current Fails

Likely root:

- `web_search` and `tool_choice: "required"` interaction.

Next action:

- force image tool for Classic image generation;
- split search and image calls for factual prompts.

### Case E: Bytes Read But No Events

Likely root:

- SSE delimiter parsing;
- `data:` line parsing;
- CRLF/buffering issue.

Next action:

- parser hardening first.

## Support Response Template

```text
Thanks. This is not enough evidence to call it moderation yet.
Your probe shows:

- OAuth text: <pass/fail>
- minimal non-stream image: <pass/fail>
- minimal stream image: <pass/fail>
- current payload: <pass/fail>
- diagnostic code: <code>

Next fix path: <parser | tool_choice/web_search | OAuth capability | local proxy>
```

## Acceptance

The playbook is acceptable when a Windows user can run one command and the
maintainer can classify the failure without requesting secrets or screenshots.
