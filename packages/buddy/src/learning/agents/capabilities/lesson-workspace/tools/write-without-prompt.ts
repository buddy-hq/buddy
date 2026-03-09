import { Tool, WriteTool } from "@buddy/opencode-adapter/tool"

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
