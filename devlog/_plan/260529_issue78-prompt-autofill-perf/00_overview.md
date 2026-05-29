---
created: 2026-05-29
issue: 78
reporter: nagareruhikari01-code
env: Windows 11 / Edge / Ryzen 9 3900XT / RTX 3090 / 64GB / SSD
version: 1.1.14
tags: [bug, performance, ux, prompt, high-priority]
---

# Issue #78: 선택한 이미지의 프롬프트가 자동으로 채워지는 버그 + 고해상도 렉

## 리포트 요약

두 가지 문제:
1. 히스토리에서 이미지를 클릭하면 작성 중이던 프롬프트가 해당 이미지의 프롬프트로 덮어씌워짐 (일부 이미지만 — 간헐적)
2. 고해상도 이미지 위주 사용 시 극심한 렉: 이미지 전환 1초+, 프롬프트 입력 시 글자당 1-2초+ 멈춤

## Bug 1: 프롬프트 자동 채워짐

### 원인 분석

`selectHistory()` → `getHistoryComposerPatch()` 경로에서 default workspace의 `restoreComposerFromHistory: true` 설정이 작동.

**코드 경로:**

1. 이미지 클릭 → `selectHistory(item)` 호출
   - `HistoryStrip.tsx:64` — 히스토리 썸네일 클릭
   - `GalleryModal.tsx:323` — 갤러리 타일 선택
   - `SidebarHistory.tsx:126` — 사이드바 히스토리
   - `MultimodeSequencePreview.tsx:21` — 멀티모드 시퀀스

2. `useAppStore.ts:3079-3096` — `selectHistory`:
   ```typescript
   const shouldRestoreComposer = resolveWorkspaceSettings(get().workspaceProfile).restoreComposerFromHistory;
   const composerPatch = shouldRestoreComposer && target ? getHistoryComposerPatch(target) : {};
   set({ currentImage: target, ...composerPatch });
   ```

3. `useAppStore.ts:404-416` — `getHistoryComposerPatch`:
   ```typescript
   if (typeof item.composerPrompt === "string") {
     return { prompt: item.composerPrompt, insertedPrompts: restoredInsertedPrompts ?? [] };
   }
   ```

**간헐적인 이유:**
- `composerPrompt` 필드가 있는 이미지(최근 생성분) → 프롬프트 덮어쓰기 발생
- `composerPrompt`가 없는 이미지(구 버전 생성분) → 빈 `{}` 반환 → 프롬프트 안 바뀜

**워크스페이스별 차이:**
- `ui/src/lib/workspaceProfile.ts:15` — default: `restoreComposerFromHistory: true` (기본값)
- `ui/src/lib/workspaceProfile.ts:23` — prompt-studio: `restoreComposerFromHistory: false`

### 수정 방향

- **Option A**: default workspace에서도 `restoreComposerFromHistory: false`로 변경
- **Option B**: 프롬프트 복원 전 현재 프롬프트가 비어있을 때만 복원 (빈 프롬프트 → 복원, 작성 중 → 스킵)
- **Option C**: 복원 시 확인 UI 추가 ("이전 프롬프트를 복원하시겠습니까?")

권장: **Option B** — 사용자가 작성 중인 프롬프트가 있으면 덮어쓰지 않음. 빈 상태에서만 복원.

## Bug 2: 고해상도 이미지 성능 렉

### 원인 분석

#### A. 프롬프트 입력 렉 — useLayoutEffect 리플로우

`PromptComposer.tsx:109-116`:
```typescript
useLayoutEffect(() => {
  el.style.height = "auto";           // 리플로우 1
  const maxHeight = ...getComputedStyle(el).maxHeight;  // 리플로우 2
  el.style.height = `${nextHeight}px`; // 리플로우 3
}, [prompt, variant]);  // ← 매 키 입력마다 실행
```
글자 하나마다 동기 리플로우 3회. 고해상도 이미지가 DOM에 있으면 리플로우 비용 증가.

#### B. 이미지 로딩 최적화 누락

| 컴포넌트 | 파일 | `loading="lazy"` | `decoding="async"` |
|---|---|---|---|
| HistoryStrip 썸네일 | `HistoryStrip.tsx:56-65` | ❌ | ❌ |
| Canvas 메인 이미지 | `Canvas.tsx:199-211` | ❌ | ❌ |
| MultimodeSequence | `MultimodeSequencePreview.tsx:87,89` | ❌ | ❌ |
| PromptComposer 레퍼런스 | `PromptComposer.tsx:218` | ❌ | ❌ |
| GalleryImageTile | `GalleryImageTile.tsx:28-33` | ✅ | ✅ |

고해상도 이미지(최대 3840×2160)가 동기 디코딩되면 메인 스레드 차단.

#### C. 포인터 핸들러 스로틀 없음

`useViewerTransform.ts:88-97` — `handlePointerMove`가 매 포인터 이벤트마다 `setPan()` 호출 → 고빈도 리렌더.

### 수정 방향

- `useLayoutEffect` 내 `getComputedStyle` 호출을 `useRef` 캐싱으로 최소화 (최초 1회 + variant 변경 시만)
- 히스토리/멀티모드/캔버스/CanvasModeStage `<img>`에 `loading="lazy" decoding="async"` 추가
- 포인터 핸들러에 `requestAnimationFrame` 스로틀 적용 + pointerUp 시 마지막 위치 동기 flush

## 원인 검증 상태

| 항목 | 코드 경로 | 검증 | 추가 발견 |
|---|---|---|---|
| 프롬프트 덮어쓰기 | `useAppStore.ts:3079-3096` | ✅ 확정 | `saveGenerationDefaultsPatch` → localStorage 오염 |
| useLayoutEffect 리플로우 | `PromptComposer.tsx:109-116` | ✅ 확정 | `getComputedStyle` 캐시 가능 |
| img lazy/async 누락 | HistoryStrip/Canvas/Multimode | ✅ 확정 | GalleryImageTile은 이미 적용됨 |
| 포인터 핸들러 | `useViewerTransform.ts:88-97` | ✅ 확정 | RAF import 없음, 추가 필요 |

## ⚠️ devlog gitignore

`devlog/`는 `.gitignore:6` 대상. Phase 문서 커밋 시 `git add -f devlog/_plan/260529_issue78-prompt-autofill-perf/` 필요.

## Phase 계획

| Phase | 문서 | 내용 | 우선순위 |
|---|---|---|---|
| Phase 1 | `01_phase1_prompt_autofill_fix.md` | 프롬프트 덮어쓰기 수정 (작성 중이면 스킵) + localStorage 오염 차단 | P0 — 데이터 유실 |
| Phase 2 | `02_phase2_image_loading_perf.md` | 이미지 `lazy`/`async` 추가 + useLayoutEffect maxHeight 캐싱 | P1 — 성능 |
| Phase 3 | `03_phase3_pointer_throttle.md` | 포인터 핸들러 RAF 스로틀 | P2 — 추가 최적화 |
