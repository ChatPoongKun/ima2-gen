import type { AgentSlashCommand, AgentSlashCommandName } from "./agentTypes.js";

const COMMAND_ALIASES: Record<string, AgentSlashCommandName> = {
  ask: "question",
  q: "question",
  question: "question",
  help: "help",
  h: "help",
  variants: "variants",
  variant: "variants",
  v: "variants",
  n: "variants",
  generate: "generate",
  gen: "generate",
  g: "generate",
  parallel: "parallelism",
  parallelism: "parallelism",
  p: "parallelism",
};

export function parseAgentSlashCommand(input: string): AgentSlashCommand | null {
  const raw = input.trim();
  if (!raw.startsWith("/")) return null;

  const match = /^\/([a-z][\w-]*)(?:\s+([\s\S]*))?$/i.exec(raw);
  if (!match) return null;

  const rawName = match[1].toLowerCase();
  const name = COMMAND_ALIASES[rawName];
  if (!name) return null;

  const rest = (match[2] ?? "").trim();
  const parsed = parseLeadingCount(rest);
  return {
    name,
    rawName,
    raw,
    prompt: parsed.prompt,
    ...(parsed.value ? { value: parsed.value } : {}),
  };
}

export function formatAgentSlashHelp(): string {
  return [
    "Available Agent commands:",
    "/question <topic> - ask a planning question without generating images.",
    "/variants <1-8> <prompt> - force that many image variants.",
    "/generate <1-8> <prompt> - generate a bounded fanout from one request.",
    "/parallelism <1-8> <prompt> - cap concurrent tool calls for this turn.",
  ].join("\n");
}

export function formatAgentQuestionReply(prompt: string): string {
  const topic = prompt.trim();
  if (!topic) {
    return "Question mode is active. Ask what should be clarified before image generation.";
  }
  return `Question mode is active. Clarify this before generation: ${topic}`;
}

function parseLeadingCount(value: string): { value?: number; prompt: string } {
  const match = /^(\d+)(?:\s+([\s\S]*))?$/.exec(value);
  if (!match) return { prompt: value };
  return {
    value: Math.max(1, Math.min(8, Number(match[1]))),
    prompt: (match[2] ?? "").trim(),
  };
}
