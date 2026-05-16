import type { GenerateItem } from "../types";
import type {
  AgentImageHandle,
  AgentSessionSummary,
  AgentTurn,
  AgentWorkspaceSeed,
} from "../components/agent/agentTypes";

function nowMinus(minutes: number): number {
  return Date.now() - minutes * 60_000;
}

function imageHandleFromCurrent(item: GenerateItem): AgentImageHandle {
  return {
    id: `current-${item.filename ?? "image"}`,
    filename: item.filename ?? "current-image.png",
    url: item.image,
    thumbUrl: item.thumb ?? item.image,
    prompt: item.prompt ?? item.userPrompt ?? null,
    revisedPrompt: item.revisedPrompt ?? null,
    createdAt: item.createdAt ?? Date.now(),
  };
}

function seedTurns(sessionId: string, imageId: string | null): AgentTurn[] {
  const imageText = imageId
    ? "현재 이미지를 기준으로 다음 변형을 준비합니다."
    : "새 이미지를 만들 준비가 됐습니다.";
  return [
    {
      id: `${sessionId}-turn-1`,
      role: "assistant",
      text: imageText,
      imageIds: imageId ? [imageId] : [],
      status: "complete",
    },
    {
      id: `${sessionId}-turn-2`,
      role: "tool",
      text: "ima2.get_image_context",
      status: "complete",
    },
  ];
}

export function createAgentWorkspaceSeed(currentImage: GenerateItem | null): AgentWorkspaceSeed {
  const handle = currentImage ? imageHandleFromCurrent(currentImage) : null;
  const primary: AgentSessionSummary = {
    id: "agent-session-current",
    title: "새 이미지 에이전트",
    codexThreadId: null,
    lastImageId: handle?.id ?? null,
    imageCount: handle ? 1 : 0,
    compacted: false,
    webSearchEnabled: true,
    updatedAt: nowMinus(3),
  };
  const draft: AgentSessionSummary = {
    id: "agent-session-style",
    title: "스타일 탐색",
    codexThreadId: null,
    lastImageId: null,
    imageCount: 0,
    compacted: true,
    webSearchEnabled: false,
    updatedAt: nowMinus(46),
  };
  return {
    sessions: [primary, draft],
    turnsBySession: {
      [primary.id]: seedTurns(primary.id, handle?.id ?? null),
      [draft.id]: [
        {
          id: `${draft.id}-turn-1`,
          role: "assistant",
          text: "레퍼런스와 웹 근거를 묶어 이미지 방향을 정리합니다.",
          status: "complete",
        },
      ],
    },
    imagesById: handle ? { [handle.id]: handle } : {},
    selectedSessionId: primary.id,
    currentImageId: handle?.id ?? null,
  };
}
