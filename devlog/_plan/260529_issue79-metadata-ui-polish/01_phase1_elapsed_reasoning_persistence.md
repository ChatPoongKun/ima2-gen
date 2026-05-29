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
+   elapsed: meta.elapsed ?? embedded?.elapsed,
+   reasoningEffort: meta.reasoningEffort ?? embedded?.reasoningEffort,
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

## 영향 범위

| 변경 파일 | 변경 유형 |
|---|---|
| `ui/src/types.ts` | 타입 추가 (GenerateItem, EmbeddedGenerationMetadata) |
| `ui/src/lib/api.ts` | HistoryItem 타입에 elapsed, reasoningEffort 추가 |
| `routes/generate.ts` | sidecar meta에 2 필드 추가 + elapsed 타입 통일 |
| `lib/historyList.ts` | 히스토리 반환에 2 필드 추가 |
| `ui/src/store/useAppStore.ts` | mapHistoryItem + 생성 결과 + ImageNodeData 타입 + node mapping |
| `ui/src/lib/nodeApi.ts` | NodeResponse 타입에 reasoningEffort 추가 |
| `routes/nodes.ts` | sidecar에 reasoningEffort 추가 + 응답에 포함 |

## Acceptance Criteria

1. 이미지 생성 후 elapsed가 표시됨
2. 갤러리/히스토리에서 다른 이미지 탐색 후 돌아와도 elapsed 유지
3. 브라우저 새로고침 후에도 elapsed 유지 (sidecar에서 로드)
4. reasoningEffort가 per-item으로 저장됨
5. 서버 재시작 후에도 메타데이터 유지

## Verification

```bash
npx tsc --noEmit
cd ui && npx tsc -b --noEmit
cd ui && npm run build
npm test
```

+ 직원 검증: 이미지 생성 → 갤러리 왕복 → elapsed/reasoning 유지 확인
