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
| `"none"` 또는 `undefined` | (표시 안 함) | off 상태는 표시 안 함 |
| `"low"` | `R:l` | 단일문자 |
| `"medium"` | `R:m` | quality `m`과 구분: `R:` 접두사 |
| `"high"` | `R:h` | 단일문자 |
| `"xhigh"` | `R:x` | 단일문자 |

### B. 변경 사항

**`Canvas.tsx:228-239`:**
```diff
+ const reasoningLabel = formatReasoningLabel(item.reasoningEffort); // R:l/R:m/R:h/R:x · none→null
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

### C. 공통 헬퍼 — `reasoning.ts`에 추가 (단일문자 전용 맵)

`ui/src/lib/reasoning.ts:6-16`에 `REASONING_EFFORT_OPTIONS`가 이미 `shortLabel`을 가짐.
새 하드코딩 helper 대신 기존 옵션 데이터를 재사용:

```typescript
// ui/src/lib/reasoning.ts 내부에 추가 (ReasoningEffort는 동일 파일에 이미 정의됨)
export function formatReasoningLabel(
  effort: ReasoningEffort | undefined,
): string | null {
  if (!effort || effort === "none") return null;
  const SHORT = { low: "l", medium: "m", high: "h", xhigh: "x" } as const;
  return `R:${SHORT[effort as keyof typeof SHORT]}`;
}
```

위치: `ui/src/lib/reasoning.ts` (formatMeta.ts 신규 X — reasoning 로직 한 곳). ⚠️ `REASONING_EFFORT_OPTIONS.shortLabel`(off/low/med/high/xhigh, 드롭다운용 다중문자)은 라벨 재사용 금지 — 위 단일문자맵 사용.

### D. Node Mode 주의사항

`ImageNode.tsx:153-161`는 `GenerateItem`이 아닌 `ImageNodeData`를 참조 (`ImageNode.tsx:35`, `useAppStore.ts:687-705`).
따라서 **Phase 1이 `ImageNodeData.reasoningEffort`와 node mapping까지 추가해야** 이 Phase에서 Node mode 표시가 가능.
Phase 1의 영향 범위가 Node mode까지 확장되어야 Phase 2가 구현 가능.

## Acceptance Criteria

1. reasoning이 `low`/`medium`/`high`/`xhigh`인 이미지에 `R:l`/`R:m`/`R:h`/`R:x` 표시
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

---

## 🔍 검증 정정 (audit 2026-05-29, post-#78)

### 렌더 사이트 위치 (현재 코드)

| 사이트 | 위치 | 데이터 타입 |
|---|---|---|
| Classic | `Canvas.tsx:228-240` | `GenerateItem` |
| Canvas Mode | `CanvasModeResultDetails.tsx:28-39` | `GenerateItem` (display props는 부모 `CanvasModeWorkspace`에서 포맷) |
| Node Mode | `ImageNode.tsx:153-161` | **`ImageNodeData`** (GenerateItem 아님). 더 짧은 i18n 기반 바 |

### ⚠️ 계획이 놓친 함정

1. **`lib/formatMeta.ts`는 존재하지 않음** (계획은 "있으면 거기"라고 가정) → 새로 만들지/인라인할지 결정 필요. 현재 3개 사이트가 build+filter+join 패턴을 각자 복붙 중. `formatQualityAlias`/`formatSizeAlias`는 `Canvas.tsx` 내부 로컬 함수(미 export).
2. **값 vs 라벨 혼동 (치명적).** 정식 값 = `none/low/medium/high/xhigh`. `off`·`med`는 `REASONING_EFFORT_OPTIONS`(`lib/reasoning.ts:6-16`)의 **shortLabel(표시용)**일 뿐. 비교는 반드시 정식값(`=== "none"`, `=== "medium"`), 표시만 shortLabel.
3. **Phase 1 의존.** `GenerateItem`·`ImageNodeData` 둘 다 `reasoningEffort` 없음 → Phase 1이 두 타입 모두에 필드를 넣고 영속해야 Phase 2 표시가 가능.
