import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AGENT_GENERATION_SETTINGS } from "../lib/agentSettings.ts";
import { parseAgentSlashCommand } from "../lib/agentCommandParser.ts";
import { deriveAgentGenerationPlan } from "../lib/agentGenerationPlanner.ts";

describe("Agent Mode auto generation planner contract", () => {
  it("defaults to one image while allowing the prompt to request bounded fanout", () => {
    const single = deriveAgentGenerationPlan({
      prompt: "make a quiet editorial poster",
      settings: DEFAULT_AGENT_GENERATION_SETTINGS,
    });
    assert.equal(single.mode, "single");
    assert.equal(single.plannedVariants, 1);
    assert.equal(single.plannedParallelism, 1);
    assert.equal(single.source, "auto-default");

    const fanout = deriveAgentGenerationPlan({
      prompt: "make three distinct poster variants",
      settings: DEFAULT_AGENT_GENERATION_SETTINGS,
    });
    assert.equal(fanout.mode, "fanout");
    assert.equal(fanout.requestedVariants, 3);
    assert.equal(fanout.plannedVariants, 3);
    assert.equal(fanout.plannedParallelism, 2);
    assert.equal(fanout.source, "auto-request");
  });

  it("lets slash commands override variant count and per-turn parallelism", () => {
    const variants = parseAgentSlashCommand("/variants 4 neon product shot");
    assert.equal(variants?.name, "variants");
    assert.equal(variants?.value, 4);
    assert.equal(variants?.prompt, "neon product shot");

    const plan = deriveAgentGenerationPlan({
      prompt: variants?.prompt ?? "",
      settings: { ...DEFAULT_AGENT_GENERATION_SETTINGS, provider: "api", parallelism: 8 },
      command: variants,
    });
    assert.equal(plan.mode, "fanout");
    assert.equal(plan.plannedVariants, 4);
    assert.equal(plan.plannedParallelism, 4);
    assert.equal(plan.source, "slash-command");

    const parallel = parseAgentSlashCommand("/parallelism 1 make three options");
    const capped = deriveAgentGenerationPlan({
      prompt: parallel?.prompt ?? "",
      settings: { ...DEFAULT_AGENT_GENERATION_SETTINGS, provider: "api", parallelism: 8 },
      command: parallel,
    });
    assert.equal(capped.plannedVariants, 3);
    assert.equal(capped.plannedParallelism, 1);

    const noCount = parseAgentSlashCommand("/variants neon product shot");
    const noCountPlan = deriveAgentGenerationPlan({
      prompt: noCount?.prompt ?? "",
      settings: { ...DEFAULT_AGENT_GENERATION_SETTINGS, provider: "api" },
      command: noCount,
    });
    assert.equal(noCountPlan.plannedVariants, 3);

    const overLimit = parseAgentSlashCommand("/generate 9 neon product shot");
    assert.equal(overLimit?.value, 8);
  });

  it("keeps manual settings as an explicit fixed-count mode", () => {
    const plan = deriveAgentGenerationPlan({
      prompt: "make a poster",
      settings: {
        ...DEFAULT_AGENT_GENERATION_SETTINGS,
        generationStrategy: "manual",
        variants: 5,
        provider: "api",
        parallelism: 3,
      },
    });
    assert.equal(plan.mode, "fanout");
    assert.equal(plan.plannedVariants, 5);
    assert.equal(plan.plannedParallelism, 3);
    assert.equal(plan.source, "manual-settings");
  });
});
