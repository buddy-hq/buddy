import { Effect } from "effect"
import { AppRuntime } from "@buddy/opencode-adapter/app-runtime"
import { withCurrentInstance } from "@buddy/opencode-adapter/effect-runtime"
import { Tool, WriteTool } from "@buddy/opencode-adapter/tool"
import type { BuddyToolContext } from "../../../runtime/create-buddy-tool"

function createWriteToolDefinition() {
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const info = yield* WriteTool
      return yield* Tool.init(info)
    }),
  )
}

function createWriteToolContext(ctx: BuddyToolContext): Tool.Context {
  return Object.assign(
    {
      sessionID: ctx.sessionID,
      messageID: ctx.messageID,
      agent: ctx.agent,
      abort: ctx.abort,
      messages: ctx.messages,
      metadata(input: Parameters<BuddyToolContext["metadata"]>[0]) {
        return Effect.promise(() => ctx.metadata(input))
      },
      ask() {
        return Effect.void
      },
    },
    ctx.callID ? { callID: ctx.callID } : undefined,
    ctx.extra ? { extra: ctx.extra } : undefined,
  )
}

export async function executeWriteWithoutPrompt(
  ctx: BuddyToolContext,
  input: {
    filePath: string
    content: string
  },
) {
  const tool = await createWriteToolDefinition()
  return AppRuntime.runPromise(
    withCurrentInstance(tool.execute(input, createWriteToolContext(ctx))),
  )
}
