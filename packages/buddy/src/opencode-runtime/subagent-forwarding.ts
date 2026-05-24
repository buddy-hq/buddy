import { Effect } from "effect"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionPrompt } from "@buddy/opencode-adapter/session-prompt"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { isPersonaDelegateId } from "../learning/shared/teaching-vocabulary"

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
type ChildSessionMetadata = {
  sessionId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function hasPromptOps(value: unknown): value is PromptOps {
  return isRecord(value) && "prompt" in value && typeof value.prompt === "function"
}

function readChildSessionMetadata(value: unknown): ChildSessionMetadata | undefined {
  if (!isRecord(value) || !isRecord(value.metadata)) {
    return undefined
  }

  const sessionId =
    typeof value.metadata.sessionId === "string" && value.metadata.sessionId.trim().length > 0
      ? value.metadata.sessionId
      : undefined
  if (!sessionId) {
    return undefined
  }

  return {
    sessionId,
  }
}

function isTaskToolArgs(value: unknown): value is { subagent_type: string } {
  return (
    isRecord(value) &&
    "subagent_type" in value &&
    typeof value.subagent_type === "string" &&
    value.subagent_type.trim().length > 0
  )
}

let promptInterceptorRegistered = false
let taskTransformerRegistered = false

/**
 * Ensures subagent forwarding is patched for both entry points:
 * 1. Direct persona delegate prompts (via SessionPrompt interceptor)
 * 2. Task tool child prompts (via ToolRegistry transformer)
 *
 * UPSTREAM HOOK NEEDED: see UPSTREAM-HOOKS.md
 */
export async function ensureSubagentForwardingPatched() {
  if (!promptInterceptorRegistered) {
    promptInterceptorRegistered = true
    SessionPrompt.registerPromptInputInterceptor(async ({ promptInput, run }) => {
      if (typeof promptInput.agent !== "string" || !isPersonaDelegateId(promptInput.agent)) {
        return run(promptInput)
      }

      const { withSubagentToolForwarding } = await import("./subagent-tool-forwarding-runtime")
      return Effect.runPromise(
        withSubagentToolForwarding({
          directory: OpenCodeInstance.directory,
          promptInput: {
            ...promptInput,
            agent: promptInput.agent,
          },
          run: (nextInput) => Effect.promise(() => run(nextInput)),
        }),
      )
    })
  }

  if (!taskTransformerRegistered) {
    taskTransformerRegistered = true
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
          const metadata = ctx.metadata

          return tool.execute(args, {
            ...ctx,
            metadata(input) {
              const childSession = readChildSessionMetadata(input)
              if (!childSession) {
                return metadata(input)
              }

              return Effect.flatMap(metadata(input), () =>
                Effect.flatMap(
                  Effect.promise(() => import("./subagent-tool-forwarding-runtime")),
                  ({ seedSubagentToolForwarding }) =>
                    seedSubagentToolForwarding({
                      directory,
                      sessionID: childSession.sessionId,
                      targetAgent: args.subagent_type,
                    }),
                ),
              )
            },
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
}
