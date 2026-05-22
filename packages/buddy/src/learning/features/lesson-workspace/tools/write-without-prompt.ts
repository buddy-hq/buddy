import fs from "node:fs/promises"
import path from "node:path"
import type { BuddyToolContext } from "../../../runtime/create-buddy-tool"

export async function executeWriteWithoutPrompt(
  ctx: BuddyToolContext,
  input: {
    filePath: string
    content: string
  },
) {
  ctx.abort.throwIfAborted()
  await fs.mkdir(path.dirname(input.filePath), { recursive: true })
  ctx.abort.throwIfAborted()
  await fs.writeFile(input.filePath, input.content)
  return {
    title: "File written",
    output: "Wrote file successfully.",
    metadata: {
      filePath: input.filePath,
    },
  }
}
