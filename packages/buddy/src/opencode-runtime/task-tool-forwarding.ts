import { Effect } from "effect"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"

const TASK_TOOL_ID = "task" as const

type ToolOverrides = Record<string, boolean>
type PromptInput = {
  agent: string
  model?: Parameters<typeof ToolRegistry.tools>[0]
  sessionID: string
  tools?: ToolOverrides
}

type PromptOps = {
  prompt: (input: PromptInput) => Effect.Effect<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function hasPromptOps(value: unknown): value is PromptOps {
  return isRecord(value) && "prompt" in value && typeof value.prompt === "function"
}

function isTaskToolArgs(value: unknown): value is { subagent_type: string } {
  return (
    isRecord(value) &&
    "subagent_type" in value &&
    typeof value.subagent_type === "string" &&
    value.subagent_type.trim().length > 0
  )
}

let registered = false

export function ensureTaskToolForwardingPatched() {
  if (registered) {
    return
  }
  registered = true

  ToolRegistry.registerToolDefTransformer(({ directory, tool }) => {
    if (tool.id !== TASK_TOOL_ID) {
      return tool
    }

    return {
      ...tool,
      execute(args, ctx) {
        if (!isTaskToolArgs(args) || !hasPromptOps(ctx.extra?.promptOps)) {
          return tool.execute(args, ctx)
        }

        const promptOps = ctx.extra.promptOps

        return tool.execute(args, {
          ...ctx,
          extra: {
            ...ctx.extra,
            promptOps: {
              ...promptOps,
              prompt(input: PromptInput) {
                return Effect.flatMap(
                  Effect.promise(() => import("./subagent-tool-forwarding-runtime")),
                  ({ withSubagentToolForwarding }) =>
                    withSubagentToolForwarding({
                      directory,
                      promptInput: input,
                      run: (nextInput) => promptOps.prompt(nextInput),
                    }),
                )
              },
            },
          },
        })
      },
    }
  })
}
