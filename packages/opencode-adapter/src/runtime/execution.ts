import { RuntimeError, type RuntimeResult } from "@buddy/agent-runtime/errors"
import type { Execution, PromptInput, TurnSelection } from "@buddy/agent-runtime/execution"
import { observeSessionExecution, withdrawUndeliveredInput, type ExecutionResult } from "../gateway/execution"
import type { TurnOutcome } from "@buddy/agent-runtime/execution"
import { backgroundSession, interruptSession, sessionStatuses, upstreamJson } from "../gateway/session"
import { admitSessionPrompt, commandSession, compactSession, promptSession } from "../gateway/write"
import type { OpenCodeHost } from "../host"
import { runtimeFailure, toRuntimeError } from "./errors"
import type { OpenCodeRuntimeOptions } from "./options"

function selection(input: TurnSelection) {
  return {
    agent: input.agent,
    model: input.model ? { id: input.model.modelID, providerID: input.model.providerID, variant: input.model.variant } : undefined,
  }
}

function promptInput(input: PromptInput) {
  return {
    ...selection(input),
    sessionID: input.sessionID,
    id: input.messageID,
    text: input.text,
    files: input.files,
    agents: input.agents,
    skills: input.skills,
    metadata: input.metadata ? Object.fromEntries(Object.entries(input.metadata).map(([key, value]) => [key, upstreamJson(value)])) : undefined,
    delivery: input.delivery,
    resume: input.noReply === undefined ? undefined : !input.noReply,
  }
}

function invalidMessageID(input: PromptInput): RuntimeResult<never> | undefined {
  if (input.messageID !== undefined && !input.messageID.startsWith("msg_")) {
    return { ok: false, error: new RuntimeError("invalid", "Message ID must start with msg_", { subject: "message" }) }
  }
  return undefined
}

function admissionFailure<TCause>(cause: TCause): RuntimeResult<never> {
  const error = toRuntimeError(cause)
  return {
    ok: false,
    error: /busy/i.test(error.message) ? new RuntimeError("busy", "Session is already running", { subject: "session", cause: error }) : error,
  }
}

async function request<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (cause) {
    throw toRuntimeError(cause)
  }
}

function observedOutcome(result: ExecutionResult): RuntimeResult<TurnOutcome> {
  return result.ok ? { ok: true, value: result.value.type } : runtimeFailure(result.error)
}

export function createExecution(host: OpenCodeHost, options: OpenCodeRuntimeOptions): Execution {
  return {
    observe(input) {
      const observation = observeSessionExecution(host, { sessionID: input.sessionID, promptID: input.messageID, signal: input.signal })
      return {
        ready: observation.ready.then((result) => result && observedOutcome(result)),
        result: observation.result.then(async (result) => {
          if (result.ok) {
            try {
              await withdrawUndeliveredInput(host, { sessionID: input.sessionID, promptID: input.messageID }, result.value)
            } catch (cause) {
              console.warn("Could not withdraw undelivered session input:", cause)
            }
          }
          return observedOutcome(result)
        }),
        close: () => observation.close(),
      }
    },
    async admit(input) {
      const invalid = invalidMessageID(input)
      if (invalid) return invalid
      try {
        const result = await admitSessionPrompt(host, promptInput(input))
        return result.ok ? { ok: true, value: { messageID: result.value.id } } : admissionFailure(result.error)
      } catch (cause) {
        return admissionFailure(cause)
      }
    },
    async prompt(input, turn) {
      const invalid = invalidMessageID(input)
      if (invalid) return invalid
      try {
        const result = await promptSession(host, promptInput(input), {
          directory: turn.directory,
          presentation: options.presentation?.(turn.directory),
        }, turn.signal, turn.onAccepted)
        return result.ok ? result : runtimeFailure(result.error)
      } catch (cause) {
        return runtimeFailure(cause)
      }
    },
    async command(input, turn) {
      try {
        const result = await commandSession(host, {
          ...selection(input),
          sessionID: input.sessionID,
          name: input.name,
          text: input.arguments,
          files: input.files,
          agents: input.agents,
          skills: input.skills,
          delivery: input.delivery,
        }, {
          directory: turn.directory,
          presentation: options.presentation?.(turn.directory),
        }, turn.signal, turn.onAccepted)
        return result.ok ? result : runtimeFailure(result.error)
      } catch (cause) {
        return runtimeFailure(cause)
      }
    },
    async compact(input, signal) {
      try {
        const result = await compactSession(host, { ...selection(input), sessionID: input.sessionID }, signal)
        return result.ok ? { ok: true, value: true } : runtimeFailure(result.error)
      } catch (cause) {
        return runtimeFailure(cause)
      }
    },
    interrupt(sessionID) {
      return request(() => interruptSession(host, sessionID))
    },
    background(sessionID) {
      return request(() => backgroundSession(host, sessionID))
    },
    statuses() {
      return request(() => sessionStatuses(host))
    },
    wait(sessionID) {
      return request(async () => {
        await host.session.wait({ sessionID })
        return (await host.session.get({ sessionID })).outcome
      })
    },
    generate(input) {
      return request(async () => (await host.session.generate({ sessionID: input.sessionID, prompt: input.prompt }, { signal: input.signal })).text)
    },
  }
}
