import { appendFile } from "node:fs/promises"

export async function appendGithubOutputs(
  environment: NodeJS.ProcessEnv,
  outputs: readonly string[],
): Promise<void> {
  const outputPath = environment.GITHUB_OUTPUT?.trim()
  if (!outputPath || outputs.length === 0) return
  await appendFile(outputPath, `${outputs.join("\n")}\n`)
}
