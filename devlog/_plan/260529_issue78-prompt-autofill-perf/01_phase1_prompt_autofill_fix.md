---
created: 2026-05-29
status: plan
depends_on:
  - 00_overview.md
tags: [bug, prompt, data-loss, p0]
---

# Phase 1: 프롬프트 자동 덮어쓰기 수정

## 확정된 원인

### 코드 경로 (검증 완료)

1. **진입점** — 이미지 클릭 시 `selectHistory(item)` 호출
   - `HistoryStrip.tsx:64` — 히스토리 썸네일
   - `GalleryModal.tsx:323` — 갤러리 타일
   - `SidebarHistory.tsx:126` — 사이드바
   - `MultimodeSequencePreview.tsx:21` — 멀티모드 시퀀스

2. **핵심 로직** — `useAppStore.ts:3079-3096`:
   ```typescript
   selectHistory: (item) => {
     // ...target 결정 로직...
     const shouldRestoreComposer = resolveWorkspaceSettings(
       get().workspaceProfile
     ).restoreComposerFromHistory;                          // ← line 3085
     const composerPatch = shouldRestoreComposer && target
       ? getHistoryComposerPatch(target) : {};              // ← line 3086
     if (Object.keys(composerPatch).length > 0) {
       saveGenerationDefaultsPatch(composerPatch);          // ← line 3088 ⚠️
     }
     set({ currentImage: target, ...composerPatch });       // ← line 3094
   }
   ```

3. **프롬프트 추출** — `useAppStore.ts:404-416`:
   ```typescript
   function getHistoryComposerPatch(item: GenerateItem) {
     const restoredInsertedPrompts = normalizeInsertedPromptArray(
       item.composerInsertedPrompts
     );
     if (typeof item.composerPrompt === "string") {
       return { prompt: item.composerPrompt, insertedPrompts: ... };
     }
     if (restoredInsertedPrompts) return { insertedPrompts: ... };
     return {};
   }
   ```

4. **워크스페이스 설정** — `ui/src/lib/workspaceProfile.ts`:
   - Line 15: `DEFAULT_WORKSPACE_PRESET` → `restoreComposerFromHistory: true`
   - Line 23: `PROMPT_STUDIO_WORKSPACE_PRESET` → `restoreComposerFromHistory: false`

### 간헐적인 이유 (확정)

- `composerPrompt` 필드가 있는 이미지(최근 생성분) → 프롬프트 반환 → 덮어쓰기
- `composerPrompt`가 없는 이미지(구 버전 생성분) → `{}` 반환 → 프롬프트 유지

### Overview에 없었던 추가 발견

**`saveGenerationDefaultsPatch(composerPatch)` (line 3088)**:
- composerPatch가 비어있지 않으면 localStorage에도 기록됨
- 히스토리 탐색만 해도 localStorage가 오염되어, 브라우저 재시작 후에도 마지막으로 클릭한 이미지의 프롬프트가 복원됨
- 이건 browsing이지 "사용자의 의도적 프롬프트 선택"이 아님 → 부작용

## 수정 계획

### 변경 사항 (`useAppStore.ts`)

**Before** (line 3085-3094):
```typescript
const shouldRestoreComposer = resolveWorkspaceSettings(
  get().workspaceProfile
).restoreComposerFromHistory;
const composerPatch = shouldRestoreComposer && target
  ? getHistoryComposerPatch(target) : {};
if (Object.keys(composerPatch).length > 0) {
  saveGenerationDefaultsPatch(composerPatch);
}
set({ currentImage: target, ...composerPatch });
```

**After**:
```typescript
const ws = resolveWorkspaceSettings(get().workspaceProfile);
const shouldRestoreComposer = ws.restoreComposerFromHistory;
const currentPrompt = get().prompt;
const currentInserted = get().insertedPrompts;
const isComposerDirty = currentPrompt.trim() !== "" || currentInserted.length > 0;
const composerPatch =
  shouldRestoreComposer && target && !isComposerDirty
    ? getHistoryComposerPatch(target)
    : {};
set({ currentImage: target, ...composerPatch });
```

핵심 변경:
1. **composer dirty 전체 확인** — `prompt.trim()` + `insertedPrompts.length` 모두 확인. 텍스트가 비어있어도 삽입 프롬프트 블록이 있으면 작성 중으로 판단.
2. `saveGenerationDefaultsPatch(composerPatch)` 제거 — 히스토리 탐색으로 localStorage 오염 방지

### 영향 범위

| 워크스페이스 | 변경 전 | 변경 후 |
|---|---|---|
| Default (Classic) — 빈 프롬프트 | 복원됨 | 복원됨 (동일) |
| Default (Classic) — 작성 중 | **덮어씌워짐** ← 버그 | 유지됨 ✅ |
| Prompt Studio | 복원 안 됨 | 복원 안 됨 (동일) |

## Acceptance Criteria

1. Default 워크스페이스에서 프롬프트 작성 중 히스토리 이미지 클릭 → 프롬프트 유지
2. Default 워크스페이스에서 빈 프롬프트 상태로 히스토리 클릭 → 이전 프롬프트 복원
3. Prompt Studio는 기존 동작 유지 (복원 안 됨)
4. localStorage에 히스토리 탐색만으로 프롬프트가 저장되지 않음
5. `composerPrompt` 있는 이미지와 없는 이미지 모두 정상 동작
6. 빈 프롬프트 + insertedPrompts가 있는 상태에서 히스토리 클릭 → 프롬프트 유지

## Contract Test 수정 (필수)

**`tests/issue75-prompt-studio-state-contract.test.js:48`**:

현재 regex가 정확히 `const composerPatch = shouldRestoreComposer && target ? getHistoryComposerPatch(target) : {}`를 요구.
Phase 1 변경 후 `&& !isComposerDirty` 추가로 불일치 발생.

**Before** (line 48):
```javascript
assert.match(store, /const composerPatch = shouldRestoreComposer && target \? getHistoryComposerPatch\(target\) : \{\}/);
```

**After**:
```javascript
assert.match(store, /const composerPatch =\s+shouldRestoreComposer && target && !isComposerDirty/);
assert.match(store, /getHistoryComposerPatch\(target\)/);
```

핵심: dirty gate 추가를 확인하되, 줄바꿈/공백에 유연하게.

## Verification

```bash
cd ui && npx tsc -b --noEmit
cd ui && npm run build
npm test
```

+ 직원 Computer Use smoke test (Default workspace에서 프롬프트 입력 → 히스토리 클릭 → 프롬프트 유지 확인)
