---
created: 2026-05-29
status: plan
depends_on:
  - 00_overview.md
  - 01_phase1_elapsed_reasoning_persistence.md
tags: [enhancement, metadata, ui, p1]
---

# Phase 2: 메타데이터 바에 reasoning 표시 추가

## 현재 상태 (검증 완료)

메타데이터 바는 3곳에서 렌더링됨. 모두 reasoning 미표시.

### Classic — `Canvas.tsx:228-239`

```typescript
const metaParts = [elapsed, tokens, quality, size, model, provider]
  .filter(Boolean)
  .join(" · ");
```

### Canvas Mode — `CanvasModeResultDetails.tsx:28-39`

같은 패턴. `elapsed`, `tokens`, `quality`, `size`, `model`, `provider` join.

### Node Mode — `ImageNode.tsx:153-161`

```typescript
// elapsed, webSearchCalls, model 표시. reasoning 없음.
```

## 수정 계획

Phase 1에서 `GenerateItem.reasoningEffort`가 저장되므로, 표시만 추가.

### A. reasoning 라벨 포맷

| `reasoningEffort` 값 | 표시 | 비고 |
|---|---|---|
| `"none"` 또는 `undefined` | (표시 안 함) | off 상태는 표시할 필요 없음 |
| `"low"` | `R:low` | |
| `"medium"` | `R:med` | |
| `"high"` | `R:high` | |
| `"xhigh"` | `R:xhigh` | |

### B. 변경 사항

**`Canvas.tsx:228-239`:**
```diff
+ const reasoningLabel = item.reasoningEffort && item.reasoningEffort !== "none"
+   ? `R:${item.reasoningEffort === "medium" ? "med" : item.reasoningEffort}`
+   : null;
  const metaParts = [
    elapsed,
    tokens,
+   reasoningLabel,
    quality,
    size,
    model,
    provider,
  ].filter(Boolean).join(" · ");
```

**`CanvasModeResultDetails.tsx:28-39`** — 동일 패턴 적용.

**`ImageNode.tsx:153-161`** — status line에 reasoning 추가.

### C. 공통 헬퍼 — 기존 `reasoning.ts` 재사용

`ui/src/lib/reasoning.ts:6-16`에 `REASONING_EFFORT_OPTIONS`가 이미 `shortLabel`을 가짐.
새 하드코딩 helper 대신 기존 옵션 데이터를 재사용:

```typescript
import { REASONING_EFFORT_OPTIONS } from "../lib/reasoning";

export function formatReasoningLabel(
  effort: GenerateItem["reasoningEffort"]
): string | null {
  if (!effort || effort === "none") return null;
  const opt = REASONING_EFFORT_OPTIONS.find(o => o.value === effort);
  return opt ? `R:${opt.shortLabel}` : `R:${effort}`;
}
```

위치: `ui/src/lib/formatMeta.ts` (이미 존재하면 거기에, 없으면 inline)

### D. Node Mode 주의사항

`ImageNode.tsx:153-161`는 `GenerateItem`이 아닌 `ImageNodeData`를 참조 (`ImageNode.tsx:35`, `useAppStore.ts:687-705`).
따라서 **Phase 1이 `ImageNodeData.reasoningEffort`와 node mapping까지 추가해야** 이 Phase에서 Node mode 표시가 가능.
Phase 1의 영향 범위가 Node mode까지 확장되어야 Phase 2가 구현 가능.

## Acceptance Criteria

1. reasoning이 `low`/`medium`/`high`/`xhigh`인 이미지에 `R:low` 등 표시
2. reasoning이 `none`이거나 없는 이미지에는 표시 없음
3. Classic, Canvas Mode, Node Mode 3곳 모두 동일하게 표시
4. 기존 메타데이터 (elapsed, tokens, quality, size, model, provider) 유지

## Verification

```bash
cd ui && npx tsc -b --noEmit
cd ui && npm run build
npm test
```

+ 직원 검증: 각 모드에서 reasoning 있는/없는 이미지의 메타데이터 바 확인
