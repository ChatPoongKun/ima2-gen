---
created: 2026-05-29
status: plan
depends_on:
  - 00_overview.md
  - 02_phase2_image_loading_perf.md
tags: [performance, pointer, raf, p2]
---

# Phase 3: 포인터 핸들러 RAF 스로틀

## 확정된 원인

**`useViewerTransform.ts:88-97`** (검증 완료):
```typescript
const handlePointerMove = useCallback(
  (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.baseX + event.clientX - drag.startX,
      y: drag.baseY + event.clientY - drag.startY,
    });
  },
  [drag],
);
```

`pointermove` 이벤트는 고주사율 모니터에서 초당 수백 회 발생 가능.
매 이벤트마다 `setPan()` (React useState setter) 호출 → 리렌더.
현재 RAF/throttle 유틸 import 없음 (React primitives만 사용 중).

## 수정 계획

### A. RAF ref + cancel 유틸 추가 (line 30 이후)

**import 변경** (line 1):
```diff
- import { useCallback, useEffect, useState } from "react";
+ import { useCallback, useEffect, useRef, useState } from "react";
```

**`useViewerTransform` 함수 내부**, `const [drag, setDrag]` (line 33) 다음:
```typescript
const rafRef = useRef(0);
const pendingPanRef = useRef<ViewerPan | null>(null);
```

### B. handlePointerMove RAF 스로틀 (line 88-97 → 교체)

**Before** (line 88-97):
```typescript
const handlePointerMove = useCallback(
  (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.baseX + event.clientX - drag.startX,
      y: drag.baseY + event.clientY - drag.startY,
    });
  },
  [drag],
);
```

**After**:
```typescript
const handlePointerMove = useCallback(
  (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = {
      x: drag.baseX + event.clientX - drag.startX,
      y: drag.baseY + event.clientY - drag.startY,
    };
    pendingPanRef.current = next;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setPan(next);
      pendingPanRef.current = null;
    });
  },
  [drag],
);
```

### C. handlePointerUp — flush 후 cancel (line 99-106 → 교체)

**Before** (line 99-106):
```typescript
const handlePointerUp = useCallback(
  (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  },
  [drag],
);
```

**After**:
```typescript
const handlePointerUp = useCallback(
  (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (pendingPanRef.current) {
      setPan(pendingPanRef.current);
      pendingPanRef.current = null;
    }
    setDrag(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  },
  [drag],
);
```

핵심: pending RAF를 cancel하고, 아직 적용되지 않은 마지막 위치를 **동기로 flush** → AC#3 "마지막 위치 정확히 반영" 보장.

### D. reset() — RAF cancel 추가 (line 35-39 → 교체)

**Before** (line 35-39):
```typescript
const reset = useCallback(() => {
  setZoom(1);
  setPan({ x: 0, y: 0 });
  setDrag(null);
}, []);
```

**After**:
```typescript
const reset = useCallback(() => {
  cancelAnimationFrame(rafRef.current);
  rafRef.current = 0;
  pendingPanRef.current = null;
  setZoom(1);
  setPan({ x: 0, y: 0 });
  setDrag(null);
}, []);
```

### E. unmount cleanup (line 43 다음에 추가)

**추가** (`resetKey` useEffect 다음):
```typescript
useEffect(() => {
  return () => {
    cancelAnimationFrame(rafRef.current);
  };
}, []);
```

핵심:
- `() => cancelPendingRaf` 가 아니라 `() => { cancelAnimationFrame(rafRef.current); }` — 화살표 함수 반환값이 cleanup이 되도록 명시적 `return`
- 빈 deps `[]` — mount 시 등록, unmount 시 실행
- `reset()` 에도 이미 cancel이 있으나, unmount는 reset 없이 일어날 수 있으므로 별도 필요

### 영향 범위

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| setPan 호출 빈도 | 이벤트당 1회 (무제한) | 프레임당 1회 (최대 60-120fps) |
| 드래그 반응성 | 동일 (시각적 차이 없음) | 동일 |
| 고주사율 환경 리렌더 | 과다 | 제한 |

## Acceptance Criteria

1. 캔버스 이미지 드래그 시 부드러운 pan 동작 유지
2. 고주사율 환경에서 리렌더 횟수 감소 (DevTools Profiler 확인)
3. 드래그 종료 시 마지막 위치 정확히 반영
4. cleanup에서 메모리 누수 없음

## Verification

```bash
cd ui && npx tsc -b --noEmit
cd ui && npm run build
npm test
```

+ 직원 검증: 캔버스에서 이미지 드래그 테스트 (부드러움 확인)
