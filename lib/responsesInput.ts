export function buildResponsesInput(
  mode: string,
  developerContent: string,
  userContent: unknown,
) {
  const userInput = { role: "user", content: userContent };
  if (mode === "direct") return [userInput];
  return [
    { role: "developer", content: developerContent },
    userInput,
  ];
}
