---
created: 2026-05-29
status: plan
depends_on:
  - 00_overview.md
  - 01_phase1_prompt_autofill_fix.md
tags: [performance, img, layout, p1]
---

# Phase 2: 이미지 로딩 최적화 + useLayoutEffect 리플로우 제거

## 확정된 원인

### A. useLayoutEffect 강제 리플로우 (매 키 입력)

**`PromptComposer.tsx:109-116`** (검증 완료):
```typescript
useLayoutEffect(() => {
  const el = textareaRef.current;
  if (!el) return;
  el.style.height = "auto";                                    // WRITE → 레이아웃 무효화
  const maxHeight = parseCssPixelValue(
    window.getComputedStyle(el).maxHeight                      // READ → 강제 동기 리플로우
  );
  const nextHeight = maxHeight
    ? Math.min(el.scrollHeight, maxHeight) : el.scrollHeight;  // READ → scrollHeight
  el.style.height = `${nextHeight}px`;                         // WRITE
}, [prompt, variant]);
```

**Write-Read-Write 패턴**:
1. `height = "auto"` → DOM 쓰기 (레이아웃 무효화)
2. `getComputedStyle().maxHeight` → 스타일 읽기 (브라우저가 동기 리플로우 강제 실행)
3. `scrollHeight` → 레이아웃 읽기
4. `height = nextHeight` → DOM 쓰기

`maxHeight`는 CSS에서 오며 키 입력마다 바뀌지 않음 → **캐시 가능**.

### B. `<img>` 동기 디코딩 누락 (검증 완료)

| 컴포넌트 | 파일:줄 | `loading` | `decoding` | 비고 |
|---|---|---|---|---|
| HistoryStrip 썸네일 | `HistoryStrip.tsx:56-65` | ❌ 없음 | ❌ 없음 | 다수의 썸네일 동시 로드 |
| Canvas 메인 이미지 | `Canvas.tsx:199-211` | N/A (항상 뷰포트) | ❌ 없음 | lazy 불필요, async만 |
| MultimodeSequence (2곳) | `MultimodeSequencePreview.tsx:87,89` | ❌ 없음 | ❌ 없음 | |
| PromptComposer 레퍼런스 | `PromptComposer.tsx:218` | ❌ 없음 | ❌ 없음 | |
| GalleryImageTile | `GalleryImageTile.tsx:28-33` | ✅ lazy | ✅ async | 이미 적용 |

3840×2160 이미지가 동기 디코딩되면 메인 스레드 ~50-200ms 차단.

**추가 발견 (감사 시):**
| CanvasModeStage 메인 이미지 | `canvas-mode/CanvasModeStage.tsx:55-65` | ❌ 없음 | ❌ 없음 | canvasOpen 시 사용 |
| CanvasModeStage 마스크 | `canvas-mode/CanvasModeStage.tsx:67-72` | N/A | ❌ 없음 | 마스크 오버레이 |

## 수정 계획

### A. useLayoutEffect 최적화 (`PromptComposer.tsx`)

**Before** (line 109-116):
```typescript
useLayoutEffect(() => {
  const el = textareaRef.current;
  if (!el) return;
  el.style.height = "auto";
  const maxHeight = parseCssPixelValue(window.getComputedStyle(el).maxHeight);
  const nextHeight = maxHeight ? Math.min(el.scrollHeight, maxHeight) : el.scrollHeight;
  el.style.height = `${nextHeight}px`;
}, [prompt, variant]);
```

**After**:
```typescript
const maxHeightRef = useRef<number | null>(null);
const lastVariantRef = useRef(variant);

useLayoutEffect(() => {
  const el = textareaRef.current;
  if (!el) return;
  if (maxHeightRef.current === null || lastVariantRef.current !== variant) {
    maxHeightRef.current =
      parseCssPixelValue(window.getComputedStyle(el).maxHeight) ?? 0;
    lastVariantRef.current = variant;
  }
  el.style.height = "auto";
  const sh = el.scrollHeight;
  el.style.height = `${maxHeightRef.current ? Math.min(sh, maxHeightRef.current) : sh}px`;
}, [prompt, variant]);
```

핵심:
- `getComputedStyle` 호출을 최초 1회 + `variant` 변경 시만 (같은 `useLayoutEffect` 안에서 `lastVariantRef` 비교로 판단 → variant 변경 첫 렌더에서 stale 값 사용 방지)
- 별도 `useEffect`로 무효화하면 layout effect 이후 실행되어 첫 렌더가 이전 variant의 maxHeight를 씀 → 같은 effect 안에서 처리
- 강제 리플로우 비용 축소 (`getComputedStyle` 제거). `height = "auto"` 후 `scrollHeight` 읽기는 불가피한 레이아웃 읽기이므로 완전 제거는 아님

### B. img 속성 추가

**HistoryStrip.tsx:56-65** — `<img>` 태그에 추가:
```diff
  <img
    key={key}
    ref={(node) => { thumbRefs.current[key] = node; }}
    src={item.thumb || item.url || item.image}
    alt=""
    className={`history-thumb${active ? " active" : ""}`}
+   loading="lazy"
+   decoding="async"
    onClick={() => selectHistory(item)}
  />
```

**Canvas.tsx:199-211** — `decoding="async"` 만 추가 (lazy는 뷰포트 내이므로 부적절):
```diff
  <img
    className="result-img"
    key={imageKey ?? undefined}
    src={imageSrc}
    alt={t("canvas.resultAlt")}
+   decoding="async"
    style={{ transform: `translate(...)` }}
    onDoubleClick={(event) => { ... }}
  />
```

**MultimodeSequencePreview.tsx:87** 및 **:89** — 두 `<img>` 모두:
```diff
- <img src={image.url ?? image.image} alt={t("canvas.resultAlt")} />
+ <img src={image.url ?? image.image} alt={t("canvas.resultAlt")} loading="lazy" decoding="async" />
```

**PromptComposer.tsx:218** — 레퍼런스 이미지:
```diff
  <img
    src={...}
+   loading="lazy"
+   decoding="async"
    ...
  />
```

**CanvasModeStage.tsx:55** — canvas-mode 메인 이미지:
```diff
  <img
    ref={imageElementRef}
    className="result-img"
    key={imageKey}
    src={imageSrc ?? fallbackImage}
    alt={alt}
+   decoding="async"
    onDoubleClick={...}
  />
```

**CanvasModeStage.tsx:67** — 마스크 오버레이:
```diff
  <img
    className="canvas-background-cleanup-mask"
    src={maskOverlayUrl}
    alt=""
    aria-hidden="true"
+   decoding="async"
  />
```

## Contract Test 수정 (필수)

**`tests/prompt-studio-ui-contract.test.js:162`**:

현재 regex가 `Math.min(el.scrollHeight, maxHeight)`를 요구.
Phase 2 변경 후 `Math.min(sh, maxHeightRef.current)`로 변수명 변경 → 불일치.

**Before** (line 162):
```javascript
assert.match(promptComposer, /Math\.min\(el\.scrollHeight, maxHeight\)/);
```

**After**:
```javascript
assert.match(promptComposer, /Math\.min\(.*scrollHeight.*,.*maxHeight/);
```

핵심: scrollHeight와 maxHeight 기반 min 연산이 존재하는지 유연하게 확인. 변수명/ref 접근 방식 변경 허용.

## Acceptance Criteria

1. 고해상도 이미지(3840×2160) 환경에서 프롬프트 입력 시 per-keystroke 렉이 체감 감소
2. 이미지 전환 시 동기 디코딩 차단 없음 (Canvas + CanvasModeStage 이미지 `decoding="async"`)
3. 히스토리 썸네일이 뷰포트 밖일 때 즉시 로드하지 않음 (`loading="lazy"`)
4. textarea auto-resize 정상 동작 (높이 계산 정확)

## Verification

```bash
cd ui && npx tsc -b --noEmit
cd ui && npm run build
npm test
```

+ Chrome DevTools Performance 프로파일링 (before/after 비교)
+ 직원 검증: 고해상도 이미지 5장 이상 + 프롬프트 타이핑 렉 확인
