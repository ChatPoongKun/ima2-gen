import test from "node:test";
import { strict as assert } from "node:assert";
import { buildResponsesInput } from "../lib/responsesInput.ts";

test("direct mode sends only the user input", () => {
  const input = buildResponsesInput("direct", "quality developer prompt", "user prompt");

  assert.deepEqual(input, [
    { role: "user", content: "user prompt" },
  ]);
});

test("auto mode keeps developer and user inputs", () => {
  const input = buildResponsesInput("auto", "quality developer prompt", "user prompt");

  assert.deepEqual(input, [
    { role: "developer", content: "quality developer prompt" },
    { role: "user", content: "user prompt" },
  ]);
});

test("direct mode preserves structured user content without developer input", () => {
  const content = [
    { type: "input_image", image_url: "data:image/png;base64,abc" },
    { type: "input_text", text: "edit exactly this way" },
  ];

  const input = buildResponsesInput("direct", "edit developer prompt", content);

  assert.equal(input.length, 1);
  assert.equal(input[0].role, "user");
  assert.equal(input[0].content, content);
});
