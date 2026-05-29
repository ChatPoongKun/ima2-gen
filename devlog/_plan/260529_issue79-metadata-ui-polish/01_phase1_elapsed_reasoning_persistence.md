---
created: 2026-05-29
status: plan
depends_on:
  - 00_overview.md
tags: [bug, metadata, elapsed, reasoning, server, p1]
---

# Phase 1: elapsed + reasoningEffort 영구 저장

## 확정된 원인

### A. elapsed 유실 체인 (검증 완료)

`elapsed`는 생성 직후에만 존재하고, 히스토리 새로고침 시 사라짐.

| 단계 | 파일:줄 | 상태 |
|---|---|---|
| 타입 정의 | `types.ts:60` — `GenerateItem.elapsed?: number` | ✅ 존재 |
| 생성 직후 설정 | `useAppStore.ts:2729,3649,3664` — `elapsed: res.elapsed` | ✅ 설정됨 |
| **서버 sidecar 저장** | `routes/generate.ts:223-245` — `meta` 객체 | ❌ **elapsed 미포함** |
| **서버 히스토리 반환** | `lib/historyList.ts:34-73` — `listHistoryRows()` | ❌ **elapsed 미반환** |
| **클라이언트 매핑** | `useAppStore.ts:568-612` — `mapHistoryItem()` | ❌ **elapsed 미매핑** |
| EmbeddedGenerationMetadata | `types.ts:99-128` | ❌ elapsed 필드 없음 |
| Node mode sidecar | `routes/nodes.ts:407` | ✅ elapsed 포함 (예외) |

**결론**: Classic 생성 경로에서 elapsed가 3곳에서 누락됨 (서버 저장, 히스토리 API 반환, 클라이언트 매핑).

### B. reasoningEffort 미저장 (검증 완료)

| 단계 | 파일:줄 | 상태 |
|---|---|---|
| 요청 타입 | `types.ts:175` — `GenerateRequest.reasoningEffort` | ✅ 존재 |
| **결과 타입** | `types.ts:46-95` — `GenerateItem` | ❌ **reasoningEffort 필드 없음** |
| 생성 시 전송 | `useAppStore.ts:3607` — `reasoningEffort: s.reasoningEffort` | ✅ 서버로 전송 |
| **생성 결과 저장** | `useAppStore.ts:3643-3671` — 결과 `GenerateItem` 구성 | ❌ **미포함** |
| **서버 sidecar** | `routes/generate.ts:223-245` | ❌ **미포함** |
| **EmbeddedGenerationMetadata** | `types.ts:99-128` | ❌ **미포함** |
| 서버 수신 | `routes/generate.ts:80` — `req.body.reasoningEffort` | ✅ 수신은 함 |

**결론**: reasoningEffort는 요청에만 존재하고 결과에 전혀 저장되지 않음.

## 수정 계획

### 1. 타입 변경 (`ui/src/types.ts`)

**GenerateItem에 reasoningEffort 추가:**
```diff
  export interface GenerateItem {
    // ...existing fields...
    elapsed?: number;
+   reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
    // ...
  }
```

**EmbeddedGenerationMetadata에 추가:**
```diff
  export interface EmbeddedGenerationMetadata {
    // ...existing fields...
+   elapsed?: number;
+   reasoningEffort?: string;
  }
```

### 2. 서버 sidecar 저장 (`routes/generate.ts`)

> ⚠️ **A-AUDIT 정정 (elapsed 타이밍). 아래 옛 `diff` 블록의 `+ elapsed,` 줄은 폐기 — 적용 금지.**
> `meta` 생성·embed·sidecar write는 루프 안(`:223-259`)에서 일어나는데 `elapsed`는 루프 종료 후(`:331`)에야 계산됨 → `:223` 시점엔 스코프에 `elapsed`가 없음. **확정 전략:**
> 1. `reasoningEffort`(`:80` resolve)만 `meta`(`:223`)에 직접 추가 (스코프 OK).
> 2. `elapsed`는 `:331`에서 **number**로 계산(`+((Date.now()-startTime)/1000).toFixed(1)`), 응답(`:357/:366`)도 number로 통일 (`GenerateSingleResponse.elapsed: number` `types.ts:132`와 정합).
> 3. `:331` 직후 생성 이미지들의 **sidecar JSON(`<file>.json`)을 순회 패치**해 `elapsed`(number) 주입. batch(n>1)는 총 elapsed 공유(클라 `:3631`과 일치). (`readFile` import 추가 — 현재 `writeFile`만, N5)
> 4. embed(`:247`)는 `:331` 이전이라 XMP에 elapsed 없을 수 있음 — sidecar-first + forward-fix 정책상 history reload는 sidecar가 커버하므로 허용.

⚠️ 서버 코드의 실제 변수명 주의:
- elapsed는 route 후반에서 `const elapsed = ...toFixed(1)` 로 계산됨 (`routes/generate.ts:331`)
- reasoningEffort는 `req.body.reasoningEffort` 로 수신 (`routes/generate.ts:80`)
- 응답에는 `elapsed`가 이미 포함되지만 sidecar meta에는 저장하지 않음

**meta 객체 (`routes/generate.ts:223-245`) 에 추가:**
```diff
  const meta = {
    kind: "classic",
    requestId,
    prompt,
    quality,
    size,
    model,
+   elapsed,              // ← route 후반에서 계산된 elapsed 변수
+   reasoningEffort,      // ← req.body에서 추출한 변수
    // ...other fields...
  };
```

**⚠️ 타입 불일치 주의**: `GenerateSingleResponse.elapsed`는 `number`로 정의됨 (`types.ts:130-147`), 하지만 서버는 `elapsed.toFixed(1)`로 string을 반환. sidecar 저장 시 타입을 통일할 것 (number 유지 권장, toFixed는 표시 레이어에서).

**Node mode** (`routes/nodes.ts:394-421`): elapsed는 이미 meta에 포함, reasoningEffort 추가 필요.

### 3. 서버 히스토리 반환 (`lib/historyList.ts`)

**`listHistoryRows()` (`lib/historyList.ts:34-73`) 에서 sidecar/embedded에서 elapsed, reasoningEffort 추출:**
```diff
  // sidecar 읽기 부분
  const meta = JSON.parse(sidecarContent);
  return {
    // ...existing fields...
+   elapsed: meta?.elapsed ?? null,
+   reasoningEffort: meta?.reasoningEffort ?? null,
  };
```

### 4. 클라이언트 매핑 (`useAppStore.ts`)

**`mapHistoryItem()` (~line 612):**
```diff
  function mapHistoryItem(raw: HistoryApiItem): GenerateItem {
    return {
      // ...existing mappings...
+     elapsed: raw.elapsed,
+     reasoningEffort: raw.reasoningEffort,
    };
  }
```

### 5. 생성 결과에 reasoningEffort 포함 (`useAppStore.ts`)

**Classic 생성 결과 구성 (~line 3643-3671):**
```diff
  const item: GenerateItem = {
    // ...existing fields...
    elapsed: res.elapsed,
+   reasoningEffort: s.reasoningEffort,
  };
```

### 6. HistoryItem API 타입 (`ui/src/lib/api.ts`)

`mapHistoryItem()`이 `raw.elapsed`와 `raw.reasoningEffort`를 쓰려면, 서버 응답을 받는 `HistoryItem` 타입에도 필드 필요:

```diff
  // ui/src/lib/api.ts:213-260
  export interface HistoryItem {
    // ...existing fields...
+   elapsed?: number;
+   reasoningEffort?: string;
  }
```

### 7. Node Mode 전체 경로

Node mode에서 reasoning을 표시하려면 (`ImageNode.tsx:153-161`):

- `ImageNodeData` 타입에 `reasoningEffort` 추가 (`useAppStore.ts:687-705`)
- Node 생성 success mapping에서 설정 (`useAppStore.ts:2714-2733`)
- Node recovery mapping에서도 설정 (`useAppStore.ts:4011-4025`)
- `routes/nodes.ts:394-421` sidecar에 reasoningEffort 저장
- `routes/nodes.ts:441-462` 응답에 reasoningEffort 포함
- `ui/src/lib/nodeApi.ts:23-42` — NodeResponse 타입에 reasoningEffort 추가

### 8. Canvas edit 경로 (`routes/edit.ts` + `canvasModeHelpers.ts`) — ⚠️ A-AUDIT 추가 (F2)

scope가 Classic + **Canvas** + Node이므로 Canvas mask-edit 생성 경로도 포함.
- `routes/edit.ts:209-226` meta — 현재 elapsed/reasoningEffort 둘 다 없음. elapsed는 `:204`에서 이미 계산되어 **스코프에 있음**(generate와 달리 timing 문제 없음) → meta에 `elapsed`(number) + `reasoningEffort` 직접 추가. 응답(`:240`)도 string→number 통일 (generate와 동일, N2).
- `ui/src/components/canvas-mode/canvasModeHelpers.ts:48-82` `responseToGenerateItem` — `:71` elapsed만, reasoningEffort 미포함 → 결과 GenerateItem에 `reasoningEffort` thread-through. ⚠️ 영속(sidecar)은 위 edit.ts meta로 충족; **즉시 표시**까지 원하면 edit 응답에 reasoningEffort 추가 또는 call-site(`useCanvasModeSession.ts:~222`) merge 필요 (N3).

### 9. Embedded fallback (`lib/imageMetadata.ts`) — ⚠️ A-AUDIT 추가 (F3)

`buildIma2MetadataPayload`(`:35-63`)에 `elapsed?`(number) + `reasoningEffort?`(string) 필드 추가.
이유: `historyList.ts:98-108`은 sidecar 없으면 embedded XMP로 fallback → `types.ts`만 고치면 런타임 payload builder는 필드를 안 실어 sidecar write 실패 시 영구 유실.

### 10. 범위 제외 (명시)

- `routes/multimode.ts:225-252` sidecar는 이번 범위 **제외** (Classic+Canvas+Node만). multimode parity는 후속.
- cardnews history rows(`historyList.ts:122-165`)도 범위 밖.

## 영향 범위

| 변경 파일 | 변경 유형 |
|---|---|
| `ui/src/types.ts` | GenerateItem.reasoningEffort + EmbeddedGenerationMetadata.{elapsed,reasoningEffort} |
| `ui/src/lib/api.ts` | HistoryItem에 elapsed, reasoningEffort |
| `routes/generate.ts` | meta에 reasoningEffort + `:331` 후 sidecar elapsed(number) 패치 + 응답 number 통일 |
| `routes/edit.ts` | Canvas edit meta에 elapsed(number)+reasoningEffort (A-audit F2) |
| `lib/imageMetadata.ts` | buildIma2MetadataPayload에 elapsed+reasoningEffort (A-audit F3) |
| `lib/historyList.ts` | 히스토리 반환에 2 필드 |
| `ui/src/components/canvas-mode/canvasModeHelpers.ts` | responseToGenerateItem에 reasoningEffort thread |
| `ui/src/store/useAppStore.ts` | mapHistoryItem + classic 결과 + ImageNodeData 타입 + node/recovery mapping |
| `ui/src/lib/nodeApi.ts` | NodeGenerateResponse에 reasoningEffort |
| `routes/nodes.ts` | sidecar에 reasoningEffort + 응답 포함 |

## Acceptance Criteria

1. 이미지 생성 후 elapsed가 표시됨
2. 갤러리/히스토리에서 다른 이미지 탐색 후 돌아와도 elapsed 유지
3. 브라우저 새로고침 후에도 elapsed 유지 (sidecar에서 로드)
4. reasoningEffort가 per-item으로 저장됨
5. 서버 재시작 후에도 메타데이터 유지
6. **forward-fix only**: 기존(고치기 전 생성) 디스크 항목은 elapsed/reasoning 소스가 없어 빈칸 유지 — 마이그레이션·backfill 없음. 신규 생성분부터 영속.

## Verification

```bash
npx tsc --noEmit
cd ui && npx tsc -b --noEmit
cd ui && npm run build
npm test
```

+ 직원 검증: 이미지 생성 → 갤러리 왕복 → elapsed/reasoning 유지 확인

---

## 🔍 검증 정정 (audit 2026-05-29, post-#78 커밋)

> 이 계획서는 #78 커밋(cbb18ed) 직전에 작성되어 줄 번호가 밀렸음. 아래는 현재 코드 기준 정정 + 추가 발견.

### 줄 번호 정정

| 계획 표기 | 실제 현재 위치 | 비고 |
|---|---|---|
| `routes/generate.ts:80` reasoningEffort 수신 | **`:58`** | `req.body` 디스트럭처 |
| `useAppStore.ts:3607` 요청에 reasoningEffort | **`:3610`** | |
| `useAppStore.ts:3649,3664` elapsed 결과 | **`:3631, :3652, :3667`** | 3곳 (계획은 2곳만, `:3667` 누락) |
| `lib/historyList.ts:34-73` | **`:27-83`** | 함수는 27부터 |
| `useAppStore.ts:4011-4025` node recovery | **`:4014-4028`** | |
| `routes/nodes.ts:407` elapsed in meta | `:407` ✅ | node sidecar는 **이미** elapsed 저장함 |

### ⚠️ 계획이 놓친 함정 (구현 전 필독)

1. **elapsed 타입 불일치 (string vs number)**
   - `routes/generate.ts:331` → `((Date.now()-startTime)/1000).toFixed(1)` = **string**
   - `routes/nodes.ts:393` → `+(...).toFixed(1)` = **number** (이미 올바름)
   - 클라 타입(`GenerateSingleResponse.elapsed`, `ImageNodeData.elapsed`)은 `number`
   - → sidecar 영속 저장 시 **number로 통일**. classic 경로의 string을 그대로 저장하면 타입 깨짐.

2. **reasoningEffort는 디스크 어디에도 저장 안 됨 (전 계층 누락)**
   - `EmbeddedGenerationMetadata`, classic sidecar meta(`generate.ts:223-245`, **elapsed도 누락**), node sidecar meta(`nodes.ts`), `historyList.ts` row, `HistoryItem`(`api.ts:213-261`), `mapHistoryItem`(`useAppStore.ts:568-612`)
   - → 한 군데만 고치면 계속 `undefined`. 전 계층 thread-through 필요.

3. **node recovery 경로의 타입 narrowing**
   - `recoverGraphNodesFromHistory`(`useAppStore.ts:~3977`)가 history item을 `url/createdAt/size/...`로만 좁혀서, `HistoryItem`에 elapsed를 추가해도 **이 경로에선 떨어짐**. 로컬 타입 + 매핑(`:4014-4028`)까지 같이 수정해야 노드 모드 영속 완성.
