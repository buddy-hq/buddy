import { Effect } from "effect"
import z from "zod"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionPrompt } from "@buddy/opencode-adapter/session-prompt"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Tool } from "@buddy/opencode-adapter/tool"
import { isPersonaDelegateId } from "../learning/shared/teaching-vocabulary"

const TASK_TOOL_ID = "task" as const

type TToolOverrides = Record<string, boolean>
type TPromptInput = {
  agent: string
  model?: Parameters<typeof ToolRegistry.tools>[0]
  sessionID: string
  tools?: TToolOverrides
}

type TPromptOps = {
  prompt: (input: TPromptInput) => Effect.Effect<unknown>
}
type TChildSessionMetadata = {
  sessionId: string
}

type TTaskToolArgs = {
  subagent_type: string
}

const promptOpsSchema = z.object({
  prompt: z.function({
    input: [z.custom<TPromptInput>()],
    output: z.custom<Effect.Effect<unknown>>(),
  }),
})

const childSessionMetadataSchema = z.object({
  metadata: z.object({
    sessionId: z.string().refine((value) => value.trim().length > 0),
  }),
})

const taskToolArgsSchema = z
  .object({
    subagent_type: z.string().refine((value) => value.trim().length > 0),
  })
  .passthrough()

function parseTPromptOps(extra: Tool.Context["extra"]): TPromptOps | undefined {
  const parsed = promptOpsSchema.safeParse(extra?.promptOps)
  return parsed.success ? parsed.data : undefined
}

function parseTChildSessionMetadata(
  input: Parameters<Tool.Context["metadata"]>[0],
): TChildSessionMetadata | undefined {
  const parsed = childSessionMetadataSchema.safeParse(input)
  if (!parsed.success) return undefined
  return {
    sessionId: parsed.data.metadata.sessionId,
  }
}

type TToolExecuteArgs = Parameters<Tool.Def["execute"]>[0]

function parseTTaskToolArgs(args: TToolExecuteArgs): TTaskToolArgs | undefined {
  const parsed = taskToolArgsSchema.safeParse(args)
  return parsed.success ? parsed.data : undefined
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
      const agent = promptInput.agent
      if (agent === undefined || !isPersonaDelegateId(agent)) {
        return run(promptInput)
      }

      const { withSubagentToolForwarding } = await import("./subagent-tool-forwarding-runtime")
      return Effect.runPromise(
        withSubagentToolForwarding({
          directory: OpenCodeInstance.directory,
          promptInput: {
            ...promptInput,
            agent,
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
          const taskArgs = parseTTaskToolArgs(args)
          const promptOps = parseTPromptOps(ctx.extra)
          if (!taskArgs || !promptOps) {
            return tool.execute(args, ctx)
          }

          const metadata = ctx.metadata

          return tool.execute(args, {
            ...ctx,
            metadata(input) {
              const childSession = parseTChildSessionMetadata(input)
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
                      targetAgent: taskArgs.subagent_type,
                    }),
                ),
              )
            },
            extra: {
              ...ctx.extra,
              promptOps: {
                ...promptOps,
                prompt(input: TPromptInput) {
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
