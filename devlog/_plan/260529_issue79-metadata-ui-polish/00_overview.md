---
created: 2026-05-29
issue: 79
reporter: PARKJONGMlN
title: "기능 세가지 요청"
tags: [enhancement, ux, metadata, modal]
---

# Issue #79: 메타데이터 UI 개선 3건

## 요청 1: 생성 시간(elapsed) 표시가 사라짐

### 현상
이미지 생성 직후에는 걸린 시간이 표시되지만, 이후 (새 이미지 생성 / 갤러리 탐색 / 시간 경과) 사라짐.

### 원인 분석

`elapsed` 필드가 서버 히스토리 재로딩 시 매핑되지 않음.

- `types.ts:60` — `GenerateItem.elapsed?: number` 타입 정의 존재
- 생성 직후: `useAppStore.ts:2729,3649,3664`에서 API 응답의 elapsed를 설정
- **문제**: `mapHistoryItem()` (서버에서 히스토리 로드 시)에서 `elapsed` 필드를 매핑하지 않음
- 서버 폴링/갤러리 열기 시 기존 아이템이 elapsed 없는 새 객체로 교체됨

**표시 위치:**
- Classic: `Canvas.tsx:227-239` — metadata bar에서 `[elapsed, tokens, quality, size, model, provider]` join
- Canvas mode: `CanvasModeResultDetails.tsx:28-39`
- Node mode: `ImageNode.tsx:153-161`

### 수정 방향

- 서버 응답에 elapsed 포함 시: `mapHistoryItem()`에서 매핑 추가
- 서버에 elapsed가 없을 시: `preserveHistoryMetadata()`에서 기존 elapsed를 보존
- 또는 elapsed를 서버 DB에 영구 저장

## 요청 2: 추론(reasoning) 옵션 메타데이터 표시

### 현상
이미지 프리뷰 메타데이터에 `[시간] · [토큰] · [품질] · [해상도] · [모델] · [oauth/api]`는 있지만, reasoning level (off/low/med/high/xhigh)이 없음.

### 원인 분석

- `types.ts:175` — `GenerateRequest.reasoningEffort` 타입은 존재
- **문제**: `GenerateItem` 타입에 `reasoningEffort` 필드가 없음
- 생성 결과에 어떤 reasoning으로 생성했는지 per-item 저장이 안 됨
- metadata 표시 컴포넌트(`Canvas.tsx:228-239`)에서도 reasoning 접근 없음

### 수정 방향

1. `GenerateItem` 타입에 `reasoningEffort` 필드 추가
2. 생성 시 요청의 `reasoningEffort`를 결과 아이템에 저장
3. metadata bar에 reasoning level 표시 추가
4. 서버 히스토리에도 영구 저장

## 요청 3: 모델/추론 선택 모달 짤림

### 현상
모델과 추론 선택 모달이 화면 밖으로 잘려서 전체 내용이 보이지 않음. (스크린샷 참조)

### 원인 분석 (검증 결과 정정 — 초기 가설 폐기)

~~초기 가설: `.image-model-select__menu`의 `max-height: 280px` 부족~~
→ **폐기**: 실제 CSS에는 `max-height`가 아니라 `max-width: min(280px, calc(100vw - 24px))` (`index.css:1692`). `max-height` 자체가 존재하지 않음.

### 수정 방향 (검증 결과 확정)

Overview 원인 분석이 부정확했음. **실제 원인은 `max-height` 부족이 아니라 `.sidebar`의 `overflow: hidden`**.

- 드롭다운 `.image-model-select__menu`는 `position: absolute` + `z-index: 40`
- 상위 `.sidebar` (`index.css:561`)에 `overflow: hidden` → z-index 무시하고 잘림
- 메뉴 자체에 `max-height`도 없음 → 스크롤도 불가
- `AgentModelSheet`는 `position: fixed` 오버레이라 **정상** — 수정 불필요

**수정 방향**: Portal로 `document.body`에 렌더 + `max-height` + `overflow-y: auto` 안전망

## 원인 검증 상태

| 항목 | 검증 | 추가 발견 |
|---|---|---|
| elapsed 유실 | ✅ 확정 | 서버 sidecar + historyList + mapHistoryItem 3곳 모두 누락 |
| reasoningEffort 미저장 | ✅ 확정 | GenerateItem, EmbeddedMetadata, sidecar 전부 없음 |
| 모달 짤림 | ✅ 확정 (원인 정정) | `overflow: hidden`이 진짜 원인. AgentModelSheet는 정상 |

## Phase 계획

| Phase | 문서 | 내용 | 우선순위 |
|---|---|---|---|
| Phase 1 | `01_phase1_elapsed_reasoning_persistence.md` | elapsed + reasoningEffort 서버/클라이언트 영구 저장 | P1 |
| Phase 2 | `02_phase2_metadata_display.md` | metadata bar에 reasoning 표시 추가 | P1 |
| Phase 3 | `03_phase3_modal_overflow_fix.md` | 사이드바 모델 드롭다운 Portal + scroll | P1 |

## ✅ 구현 확정 (PABCD P, 2026-05-29)

인터뷰(Boss) 확정 — 본 이슈 구현의 단일 기준:

| 항목 | 확정 |
|---|---|
| 범위 | Phase 1 + 2 + 3 전부, 한 PABCD |
| 순서 | 1(영속) → 2(표시) → 3(드롭다운). Phase 2는 Phase 1 의존, Phase 3 독립 |
| 모드 | Classic + Canvas + **Node Mode 전부** (`ImageNodeData`·node mapping·recovery 포함) |
| reasoning 라벨 | `R:l` / `R:m` / `R:h` / `R:x` (단일문자). `none`/undefined → 숨김 |
| 라벨 위치 | 메타바 `[elapsed · tokens · R:x · quality · size · model · provider]` (토큰 다음, 품질 앞) |
| 헬퍼 | `ui/src/lib/reasoning.ts`에 `formatReasoningLabel` + 단일문자맵 추가 (`formatMeta.ts` 신규 X) |
| backfill | **forward-fix only.** 기존 디스크 sidecar 마이그레이션 안 함 — 고친 뒤 새로 생성하는 항목부터 메타 영속, 옛 항목은 빈칸 유지 |

> 단일문자 라벨 근거: quality가 이미 `l/m/h`를 씀(`Canvas.tsx:33-37` `formatQualityAlias`) → reasoning 순수 `lmhx`는 충돌(특히 medium=`m`, 게다가 인접 렌더). `R:` 접두사로 구분 + 폭 절감(`R:xhigh` 7자 → `R:x` 3자).

## 🔬 라이브 재현 검증 (2026-05-29, localhost:3333 CDP E2E)

> `IMA2_PORT=3333 npm run dev` → `cli-jaw browser`(CDP)로 수정 전 baseline에서 3개 증상 실제 재현 확인. 코드 변경 없음. Mac Chrome 1280px 기준.

### 요청① elapsed 사라짐 — ✅ 재현
서버 히스토리에서 로드된 이미지 메타바(`.result-meta`) 실측 — elapsed("Ns") 전무:

| 이미지 | `.result-meta` 실측값 | elapsed |
|---|---|---|
| PHASE 2 FIT | `m · 1024² · oauth` | ❌ |
| 히스토리 #3 | `16121 토큰 · m · 1024² · agent` | ❌ |
| 히스토리 #6 | `6711 토큰 · m · 1024² · agent` | ❌ |

→ 3/3 모두 elapsed 없음. `mapHistoryItem()` 미복원 + sidecar 미저장과 일치. 생성 직후 in-memory에만 존재 → 영속 안 됨.

### 요청② reasoning 미표시 — ✅ 재현
위 동일 메타바 3건 모두 reasoning(off/low/med/high/xhigh) 토큰 없음. `GenerateItem`에 필드 부재라 per-image 표시 불가.

### 요청③ 드롭다운 짤림 — ✅ 재현 (뷰포트 높이 의존)
사이드바 드롭다운(`.image-model-select__menu`, 높이 345px 고정·`max-height` 없음) 측정:

| 뷰포트 | sidebar bottom | menu bottom | 결과 |
|---|---|---|---|
| 1280×633 | 633px | 414px | 안 잘림 (여유 +218px) |
| 1280×380 | 380px | 414px | **잘림 — 하단 34px(`xhigh` 옵션) `overflow:hidden`에 절단** |

→ 가용 높이 < ~415px이면 하단 옵션 절단. 좁은/짧은 창·모바일에서 발생 (리포터 스샷 308×539 = 좁은 화면과 정합). 원인 = `.sidebar{overflow:hidden}` + 메뉴 `max-height` 부재, audit 결론과 일치.

### 검증 한계
- elapsed의 "생성 직후 표시 → 유실" 전이 중 **유실 상태만 라이브 확인**. 생성 시점 표시는 코드 경로(`useAppStore` 3631/3652/3667)로 확인, 실제 이미지 생성은 API 비용 때문에 생략.
- 리포터 실환경(Windows 11 + Edge + 고해상도 다량)이 아닌 Mac Chrome 기준. 성능 벤치마크 아님.
