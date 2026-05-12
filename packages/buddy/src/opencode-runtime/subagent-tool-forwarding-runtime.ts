import { Effect, Exit } from "effect"
import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session } from "@buddy/opencode-adapter/session"
import { readProjectConfig } from "../config/runtime/opencode-sync"
import { resolveSubagentToolForwarding } from "../learning/agent-execution/transforms/subagent-tool-forwarding"
import {
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../learning/agent-execution/state/session-state"
import { restoreTeachingSessionState } from "../learning/agent-execution/state/transform-state"

type ToolOverrides = Record<string, boolean>

type PromptInputLike = {
  agent: string
  model?: Parameters<typeof import("@buddy/opencode-adapter/registry").ToolRegistry.tools>[0]
  sessionID: string
  tools?: ToolOverrides
}

export function withSubagentToolForwarding<TPromptInput extends PromptInputLike, TResult>(input: {
  directory: string
  promptInput: TPromptInput
  run: (nextInput: TPromptInput) => Effect.Effect<TResult>
}) {
  return Effect.gen(function* () {
    const projectConfig = yield* Effect.promise(() => readProjectConfig(input.directory))
    const previousState = readTeachingSessionState(input.directory, input.promptInput.sessionID)
    const forwarding = yield* Effect.promise(() =>
      resolveSubagentToolForwarding({
        currentTools: input.promptInput.tools,
        directory: input.directory,
        model: input.promptInput.model,
        previousState,
        projectConfig,
        sessionID: input.promptInput.sessionID,
        targetAgent: input.promptInput.agent,
      }),
    )

    if (forwarding.stateSeed && !previousState) {
      writeTeachingSessionState(input.directory, forwarding.stateSeed)
    }

    const sessionPermission = forwarding.sessionPermission
    if (sessionPermission) {
      yield* Effect.promise(() =>
        OpenCodeInstance.provide({
          directory: input.directory,
          fn: () =>
            Session.setPermission({
              sessionID: SessionID.make(input.promptInput.sessionID),
              permission: sessionPermission,
            }),
        }),
      )
    }

    const nextInput = forwarding.toolOverrides
      ? {
          ...input.promptInput,
          tools: forwarding.toolOverrides,
        }
      : input.promptInput
    const exit = yield* Effect.exit(input.run(nextInput))

    if (Exit.isFailure(exit) && forwarding.stateSeed && !previousState) {
      restoreTeachingSessionState({
        directory: input.directory,
        sessionID: input.promptInput.sessionID,
        previousState,
      })
    }

    if (Exit.isFailure(exit)) {
      return yield* Effect.failCause(exit.cause)
    }

    return exit.value
  })
}
