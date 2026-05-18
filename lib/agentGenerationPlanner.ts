import type {
  AgentGenerationPlan,
  AgentGenerationPlanSource,
  AgentGenerationSettings,
  AgentSlashCommand,
} from "./agentTypes.js";

const HARD_MAX_VARIANTS = 8;
const AMBIGUOUS_MULTI_VARIANTS = 3;
const KOREAN_COUNT_WORDS: Array<[RegExp, number]> = [
  [/(?:한|하나|1)\s*(?:장|개|가지|컷|시안|버전)/u, 1],
  [/(?:두|둘|2)\s*(?:장|개|가지|컷|시안|버전)/u, 2],
  [/(?:세|셋|3)\s*(?:장|개|가지|컷|시안|버전)/u, 3],
  [/(?:네|넷|4)\s*(?:장|개|가지|컷|시안|버전)/u, 4],
  [/(?:다섯|5)\s*(?:장|개|가지|컷|시안|버전)/u, 5],
  [/(?:여섯|6)\s*(?:장|개|가지|컷|시안|버전)/u, 6],
  [/(?:일곱|7)\s*(?:장|개|가지|컷|시안|버전)/u, 7],
  [/(?:여덟|8)\s*(?:장|개|가지|컷|시안|버전)/u, 8],
];
const ENGLISH_COUNT_WORDS: Array<[RegExp, number]> = [
  [/\b(?:one|1)\s*(?:image|variant|version|option|candidate|shot|render)?s?\b/iu, 1],
  [/\b(?:two|2)\s*(?:image|variant|version|option|candidate|shot|render)?s?\b/iu, 2],
  [/\b(?:three|3)\s*(?:image|variant|version|option|candidate|shot|render)?s?\b/iu, 3],
  [/\b(?:four|4)\s*(?:image|variant|version|option|candidate|shot|render)?s?\b/iu, 4],
  [/\b(?:five|5)\s*(?:image|variant|version|option|candidate|shot|render)?s?\b/iu, 5],
  [/\b(?:six|6)\s*(?:image|variant|version|option|candidate|shot|render)?s?\b/iu, 6],
  [/\b(?:seven|7)\s*(?:image|variant|version|option|candidate|shot|render)?s?\b/iu, 7],
  [/\b(?:eight|8)\s*(?:image|variant|version|option|candidate|shot|render)?s?\b/iu, 8],
];

type PlanningInput = {
  prompt: string;
  settings: AgentGenerationSettings;
  command?: AgentSlashCommand | null;
};

type VariantDecision = {
  count: number;
  requested: number;
  source: AgentGenerationPlanSource;
  reason: string;
};

export function deriveAgentGenerationPlan({ prompt, settings, command = null }: PlanningInput): AgentGenerationPlan {
  if (command?.name === "question" || command?.name === "help") {
    return {
      mode: "question",
      prompts: [],
      requestedVariants: 0,
      plannedVariants: 0,
      plannedParallelism: 0,
      source: "question-command",
      reason: command.name === "help" ? "Slash help answered without image generation." : "Question command answered without image generation.",
      command: command.name,
      assistantText: null,
    };
  }

  const variantDecision = decideVariantCount(prompt, settings, command);
  const plannedParallelism = resolvePlannedParallelism(settings, variantDecision.count, command);
  const prompts = buildGenerationPrompts(prompt, variantDecision.count);
  return {
    mode: prompts.length > 1 ? "fanout" : "single",
    prompts,
    requestedVariants: variantDecision.requested,
    plannedVariants: prompts.length,
    plannedParallelism,
    source: variantDecision.source,
    reason: variantDecision.reason,
    command: command?.name ?? null,
    assistantText: null,
  };
}

export function normalizeAgentGenerationPlan(
  prompt: string,
  value: unknown,
  settings: AgentGenerationSettings,
): AgentGenerationPlan {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const prompts = cleanPromptArray(input.prompts);
  if (prompts.length === 0) return deriveAgentGenerationPlan({ prompt, settings, command: cleanCommand(input.command) });

  const plannedVariants = cleanCount(input.plannedVariants, prompts.length, 0, HARD_MAX_VARIANTS);
  const requestedParallelism = cleanCount(input.plannedParallelism, settings.parallelism, 1, HARD_MAX_VARIANTS);
  const plannedParallelism = resolvePlannedParallelism({ ...settings, parallelism: requestedParallelism }, plannedVariants, null);
  return {
    mode: input.mode === "question" ? "question" : prompts.length > 1 ? "fanout" : "single",
    prompts,
    requestedVariants: cleanCount(input.requestedVariants, plannedVariants, 0, HARD_MAX_VARIANTS),
    plannedVariants,
    plannedParallelism,
    source: cleanPlanSource(input.source),
    reason: cleanReason(input.reason, prompts.length > 1 ? "Stored fanout plan." : "Stored single-image plan."),
    command: cleanCommandName(input.command),
    assistantText: typeof input.assistantText === "string" ? input.assistantText : null,
  };
}

function decideVariantCount(
  prompt: string,
  settings: AgentGenerationSettings,
  command: AgentSlashCommand | null,
): VariantDecision {
  if (command?.name === "variants" || command?.name === "generate") {
    const count = clampCount(command.value ?? AMBIGUOUS_MULTI_VARIANTS, HARD_MAX_VARIANTS);
    return {
      count,
      requested: count,
      source: "slash-command",
      reason: `Slash command requested ${count} variant${count === 1 ? "" : "s"}.`,
    };
  }

  if (settings.generationStrategy === "manual") {
    const count = clampCount(settings.variants, HARD_MAX_VARIANTS);
    return {
      count,
      requested: count,
      source: "manual-settings",
      reason: `Manual settings requested ${count} variant${count === 1 ? "" : "s"}.`,
    };
  }

  const inferred = inferRequestedVariantCount(prompt);
  const capped = Math.min(inferred.count, clampCount(settings.maxAutoVariants, HARD_MAX_VARIANTS));
  return {
    count: capped,
    requested: inferred.count,
    source: inferred.count > 1 ? "auto-request" : "auto-default",
    reason: capped < inferred.count
      ? `User request implied ${inferred.count} variants; capped at ${capped}.`
      : inferred.reason,
  };
}

function inferRequestedVariantCount(prompt: string): { count: number; reason: string } {
  const text = prompt.trim();
  for (const [pattern, count] of [...KOREAN_COUNT_WORDS, ...ENGLISH_COUNT_WORDS]) {
    if (pattern.test(text)) {
      return { count, reason: `User request explicitly implies ${count} variant${count === 1 ? "" : "s"}.` };
    }
  }
  if (/(?:여러|몇\s*가지|시안|후보|버전|다양하게|several|multiple|options|variants|versions|candidates|alternatives)/iu.test(text)) {
    return { count: AMBIGUOUS_MULTI_VARIANTS, reason: `User request asks for multiple options; planning ${AMBIGUOUS_MULTI_VARIANTS} variants.` };
  }
  if (/(?:비교|대안|a\/b|compare|comparison)/iu.test(text)) {
    return { count: 2, reason: "User request implies comparison; planning 2 variants." };
  }
  return { count: 1, reason: "Defaulting to one image because the request did not ask for multiple variants." };
}

function resolvePlannedParallelism(
  settings: AgentGenerationSettings,
  plannedVariants: number,
  command: AgentSlashCommand | null,
): number {
  if (plannedVariants <= 0) return 0;
  const requested = command?.name === "parallelism" && command.value ? command.value : settings.parallelism;
  const providerCap = settings.provider === "oauth" ? 2 : HARD_MAX_VARIANTS;
  const qualityCap = settings.quality === "high" ? 2 : HARD_MAX_VARIANTS;
  return Math.max(1, Math.min(plannedVariants, clampCount(requested, HARD_MAX_VARIANTS), providerCap, qualityCap));
}

function buildGenerationPrompts(prompt: string, count: number): string[] {
  if (count <= 1) return [prompt];
  return Array.from({ length: count }, (_, index) => [
    prompt,
    "",
    `Variant ${index + 1}/${count}: explore a distinct composition while preserving the request.`,
  ].join("\n"));
}

function cleanPromptArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, HARD_MAX_VARIANTS)
    .map((item) => item.trim());
}

function cleanPlanSource(value: unknown): AgentGenerationPlanSource {
  if (
    value === "auto-default" ||
    value === "auto-request" ||
    value === "manual-settings" ||
    value === "slash-command" ||
    value === "question-command"
  ) return value;
  return "auto-default";
}

function cleanCommandName(value: unknown): AgentGenerationPlan["command"] {
  if (
    value === "question" ||
    value === "help" ||
    value === "variants" ||
    value === "generate" ||
    value === "parallelism"
  ) return value;
  return null;
}

function cleanCommand(value: unknown): AgentSlashCommand | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const name = cleanCommandName(input.name);
  if (!name) return null;
  return {
    name,
    rawName: typeof input.rawName === "string" ? input.rawName : name,
    raw: typeof input.raw === "string" ? input.raw : "",
    prompt: typeof input.prompt === "string" ? input.prompt : "",
    ...(typeof input.value === "number" ? { value: input.value } : {}),
  };
}

function cleanReason(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : fallback;
}

function cleanCount(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function clampCount(value: number, max: number): number {
  return Math.max(1, Math.min(max, Math.round(value)));
}
