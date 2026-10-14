import type { BuddyEvent } from "@buddy/transcript-contract/event"
import type { EventClient, UpstreamMessage, OpenCodeEvent } from "./client"
import type { MessageContext } from "./message"
import { createEventTranslator } from "./event"
import { toBuddyPermissionEvent } from "./permission"
import { toBuddyQuestionEvent } from "./form"
import { toBuddySession } from "./session"
import { sessionErrorStatus } from "./errors"

function replayAfterHydration(event: OpenCodeEvent, message: UpstreamMessage | undefined): boolean {
  if (message?.type !== "assistant") return false
  if (event.type === "session.tool.input.delta") {
    const tool = message.content.find((part) => part.type === "tool" && part.id === event.data.id)
    return tool?.type === "tool" && tool.state.status === "streaming" && tool.state.input.length === 0
  }
  if (event.type === "session.tool.progress") {
    const tool = message.content.find((part) => part.type === "tool" && part.id === event.data.id)
    return tool?.type === "tool" && tool.state.status === "running"
  }
  if (event.type === "session.text.delta" || event.type === "session.reasoning.delta") {
    const kind = event.type === "session.text.delta" ? "text" : "reasoning"
    const part = message.content.filter((content) => content.type === kind)[event.data.ordinal]
    return part?.type === kind && part.text.length === 0
  }
  return false
}

export async function* subscribeBuddyEvents(client: EventClient, input: {
  readonly directory: string
  readonly signal?: AbortSignal
  readonly presentation?: MessageContext["presentation"]
}): AsyncGenerator<BuddyEvent> {
  const translator = createEventTranslator(input)
  for await (const event of client.event.subscribe({ signal: input.signal })) {
    if (event.location && event.location.directory !== input.directory) continue
    if (event.type === "permission.asked" || event.type === "permission.replied") {
      const payload = toBuddyPermissionEvent(event)
      if (payload) yield { directory: event.location?.directory ?? input.directory, payload }
      continue
    }
    if (event.type === "form.created" || event.type === "form.replied" || event.type === "form.cancelled") {
      const question = toBuddyQuestionEvent(event, event.location?.directory ?? input.directory)
      if (question) yield question
      continue
    }
    const translation = translator.translate(event)
    for (const mapped of translation.events) yield mapped
    const reload = translation.reload
    if (!reload) continue
    try {
      let hydrated: UpstreamMessage | undefined
      const session = await client.session.get({ sessionID: reload.sessionID }, { signal: input.signal })
      yield { directory: session.location.directory, payload: { type: reload.created ? "session.created" : "session.updated", properties: { info: toBuddySession(session) } } }
      if (reload.messageID) {
        hydrated = await client.session.message.get({ sessionID: reload.sessionID, messageID: reload.messageID }, { signal: input.signal })
        for (const mapped of translator.seed(reload.sessionID, hydrated, session.location.directory, true)) yield mapped
      } else if (translation.events.some((mapped) => mapped.payload.type === "session.resync")) {
        const page = await client.message.list({ sessionID: reload.sessionID, limit: 50, order: "desc" }, { signal: input.signal })
        for (const message of page.data.toReversed()) {
          for (const mapped of translator.seed(reload.sessionID, message, session.location.directory, true)) yield mapped
        }
      }
      if (replayAfterHydration(event, hydrated) || event.type.startsWith("session.execution.")) {
        const replayed = translator.translate(event, true)
        for (const mapped of replayed.events) yield mapped
      }
    } catch (error) {
      if (input.signal?.aborted) return
      if (sessionErrorStatus(error) === 404) {
        yield { directory: input.directory, payload: { type: "session.resync", properties: { sessionID: reload.sessionID } } }
        continue
      }
      throw error
    }
  }
}
