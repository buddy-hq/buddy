import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { Tool } from "@buddy/opencode-adapter/tool"

export async function executeWriteWithoutPrompt(
  ctx: Tool.Context,
  input: {
    filePath: string
    content: string
  },
) {
  await mkdir(path.dirname(input.filePath), { recursive: true })
  await writeFile(input.filePath, input.content)
  return {
    title: "Write file",
    output: "Wrote file successfully.",
    metadata: {},
  }
}
