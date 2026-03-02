import fs from "node:fs/promises"
import { EditTool, FileTime, Tool, WriteTool } from "@buddy/opencode-adapter/tool"
import { CurriculumPath } from "../path.js"
import { CurriculumService } from "../service.js"

export async function executeWriteWithoutPrompt(
  ctx: Tool.Context,
  input: {
    filePath: string
    content: string
  },
) {
  const write = await WriteTool.init()
  return write.execute(input, {
    ...ctx,
    ask: async () => {},
  })
}

export async function executeEditWithoutPrompt(
  ctx: Tool.Context,
  input: {
    filePath: string
    oldString: string
    newString: string
    replaceAll?: boolean
  },
) {
  const edit = await EditTool.init()
  return edit.execute(input, {
    ...ctx,
    ask: async () => {},
  })
}

export async function syncCurriculumMirror(ctx: Tool.Context, directory: string) {
  const current = await CurriculumService.read(directory)
  const filepath = current.path
  const existing = await fs.readFile(filepath, "utf8").catch(() => undefined)

  await fs.mkdir(CurriculumPath.directory(directory), { recursive: true })

  if (existing !== current.markdown) {
    await fs.writeFile(filepath, current.markdown, "utf8")
  }

  FileTime.read(ctx.sessionID, filepath)
  return current
}
