import type { Events } from "@buddy/agent-runtime/events"
import { subscribeBuddyEvents } from "../gateway/stream"
import type { OpenCodeHost } from "../host"
import { toRuntimeError } from "./errors"
import type { OpenCodeRuntimeOptions } from "./options"

export function createEvents(host: OpenCodeHost, options: OpenCodeRuntimeOptions): Events {
  return {
    async *stream(input) {
      try {
        yield* subscribeBuddyEvents(host, {
          ...input,
          presentation: options.presentation?.(input.directory),
        })
      } catch (cause) {
        throw toRuntimeError(cause)
      }
    },
    async *signals(input) {
      try {
        for await (const event of host.event.subscribe({ signal: input.signal })) {
          if (event.type === "session.execution.succeeded") {
            yield { type: "turn.finished", sessionID: event.data.sessionID, outcome: "succeeded" }
          } else if (event.type === "session.execution.failed") {
            yield { type: "turn.finished", sessionID: event.data.sessionID, outcome: "failed" }
          } else if (event.type === "session.execution.interrupted") {
            yield {
              type: "turn.finished",
              sessionID: event.data.sessionID,
              outcome: "interrupted",
              reason: event.data.reason,
            }
          } else if (event.type === "session.renamed") {
            yield {
              type: "conversation.renamed",
              sessionID: event.data.sessionID,
              title: event.data.title,
              directory: event.location?.directory,
            }
          }
        }
      } catch (cause) {
        throw toRuntimeError(cause)
      }
    },
  }
}
