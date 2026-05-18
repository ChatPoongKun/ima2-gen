import type { AgentGenerationSettings } from "../components/agent/agentTypes";

export const DEFAULT_AGENT_GENERATION_SETTINGS: AgentGenerationSettings = {
  provider: "oauth",
  model: "gpt-5.4-mini",
  quality: "medium",
  size: "1024x1024",
  format: "png",
  moderation: "low",
  reasoningEffort: "medium",
  webSearchEnabled: true,
  generationStrategy: "auto",
  variants: 1,
  maxAutoVariants: 8,
  parallelism: 2,
};

export function withAgentGenerationDefaults(
  value: Partial<AgentGenerationSettings> | null | undefined,
): AgentGenerationSettings {
  return {
    ...DEFAULT_AGENT_GENERATION_SETTINGS,
    ...(value ?? {}),
  };
}
