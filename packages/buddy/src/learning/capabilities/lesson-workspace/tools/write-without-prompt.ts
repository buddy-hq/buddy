import { Effect } from "effect"
import { AppRuntime } from "@buddy/opencode-adapter/app-runtime"
import { Tool, WriteTool } from "@buddy/opencode-adapter/tool"
import type { BuddyToolContext } from "../../../tools/create-buddy-tool"

function createWriteToolDefinition() {
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const info = yield* WriteTool
      return yield* Tool.init(info)
    }),
  )
}

function createWriteToolContext(ctx: BuddyToolContext): Tool.Context {
  return {
    sessionID: ctx.sessionID,
    messageID: ctx.messageID,
    agent: ctx.agent,
    abort: ctx.abort,
    ...(ctx.callID ? { callID: ctx.callID } : {}),
    ...(ctx.extra ? { extra: ctx.extra } : {}),
    messages: ctx.messages,
    metadata(input) {
      return Effect.promise(() => ctx.metadata(input))
    },
    ask() {
      return Effect.void
    },
  }
}

export async function executeWriteWithoutPrompt(
  ctx: BuddyToolContext,
  input: {
    filePath: string
    content: string
  },
) {
  const tool = await createWriteToolDefinition()
  return AppRuntime.runPromise(tool.execute(input, createWriteToolContext(ctx)))
}
