import type { BuddyEvent } from "@buddy/transcript-contract/event"
import type { EventClient, UpstreamMessage, OpenCodeEvent } from "./client"
import { messageSelectionBefore, previousUserMessage, type MessageContext } from "./message"
import { createEventTranslator } from "./event"
import { toBuddyPermissionEvent } from "./permission"
import { toBuddyQuestionEvent } from "./form"
import { toBuddySession } from "./session"
import { sessionErrorStatus } from "./errors"
import { readShellOutput, shellOutputTicks } from "./shell-output"
import { shellObserverFor } from "../shell-observer"

const hiddenFormsByClient = new WeakMap<EventClient, Set<string>>()

function replayAfterHydration(event: OpenCodeEvent, message: UpstreamMessage | undefined): boolean {
  if (message?.type !== "assistant") return false
  if (event.type === "session.tool.input.delta") {
    const tool = message.content.find((part) => part.type === "tool" && part.id === event.data.id)
    return (
      tool?.type === "tool" && tool.state.status === "streaming" && tool.state.input.length === 0
    )
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

export async function* subscribeBuddyEvents(
  client: EventClient,
  input: {
    readonly directory: string
    readonly signal?: AbortSignal
    readonly presentation?: MessageContext["presentation"]
  },
): AsyncGenerator<BuddyEvent> {
  const translator = createEventTranslator(input)
  const mcpInputRequests = new Set<string>()
  let hiddenForms = hiddenFormsByClient.get(client)
  if (!hiddenForms) {
    hiddenForms = new Set<string>()
    hiddenFormsByClient.set(client, hiddenForms)
  }
  const observer = shellObserverFor(client)
  const abort = new AbortController()
  const signal = input.signal ? AbortSignal.any([input.signal, abort.signal]) : abort.signal
  const upstream = shellOutputTicks(client.event.subscribe({ signal }), {
    signal,
    active: () => (observer?.running(input.directory).length ?? 0) > 0,
    stop: () => abort.abort(),
  })
  async function* hydrate(
    sessionID: string,
    message: UpstreamMessage,
    directory: string,
    selection?: MessageContext["selection"],
  ): AsyncGenerator<BuddyEvent> {
    if (message.type === "user") {
      yield* translator.seed(
        sessionID,
        message,
        directory,
        true,
        selection ?? (await messageSelectionBefore(client, sessionID, message.id, signal)),
      )
      return
    }
    if (message.type === "assistant" && !translator.knowsParent(sessionID)) {
      const parent = await previousUserMessage(client, sessionID, message.id, signal)
      if (parent) yield* hydrate(sessionID, parent, directory, selection)
    }
    yield* translator.seed(
      sessionID,
      observer?.restore(sessionID, message, directory) ?? message,
      directory,
      true,
    )
  }
  try {
    for await (const event of upstream) {
      if (event === undefined) {
        for (const shell of translator.runningShells()) {
          const output = await readShellOutput(client, { ...shell, signal })
          if (output)
            for (const mapped of translator.updateShellOutput(shell.id, output)) yield mapped
        }
        continue
      }
      if (event.location && event.location.directory !== input.directory) continue
      if (event.type === "permission.asked" || event.type === "permission.replied") {
        const payload = toBuddyPermissionEvent(event)
        if (payload) yield { directory: event.location?.directory ?? input.directory, payload }
        continue
      }
      if (
        event.type === "form.created" ||
        event.type === "form.replied" ||
        event.type === "form.cancelled"
      ) {
        const question = toBuddyQuestionEvent(
          event,
          event.location?.directory ?? input.directory,
          hiddenForms,
          mcpInputRequests,
        )
        if (question) yield question
        continue
      }
      const translation = translator.translate(event)
      for (const mapped of translation.events) yield mapped
      if (event.type === "server.connected") {
        const running = observer?.running(input.directory) ?? []
        const messages = new Map(
          running.map((shell) => [`${shell.sessionID}/${shell.messageID}`, shell]),
        )
        for (const { sessionID, messageID } of messages.values()) {
          try {
            const message = await client.session.message.get({ sessionID, messageID }, { signal })
            const parent = await previousUserMessage(client, sessionID, messageID, signal)
            if (parent) yield* hydrate(sessionID, parent, input.directory)
            yield* hydrate(sessionID, message, input.directory)
          } catch (error) {
            if (signal.aborted) return
            if (sessionErrorStatus(error) !== 404) throw error
          }
        }
      }
      const reload = translation.reload
      if (!reload) continue
      try {
        let hydrated: UpstreamMessage | undefined
        const session = await client.session.get(
          { sessionID: reload.sessionID },
          { signal: input.signal },
        )
        yield {
          directory: session.location.directory,
          payload: { type: "session.updated", properties: { info: toBuddySession(session) } },
        }
        if (reload.messageID) {
          hydrated = await client.session.message.get(
            { sessionID: reload.sessionID, messageID: reload.messageID },
            { signal: input.signal },
          )
          yield* hydrate(reload.sessionID, hydrated, session.location.directory)
        } else if (translation.events.some((mapped) => mapped.payload.type === "session.resync")) {
          const page = await client.message.list(
            { sessionID: reload.sessionID, limit: 50, order: "desc" },
            { signal: input.signal },
          )
          const messages = page.data.toReversed()
          const first = messages[0]
          let selection =
            first && messages.some((message) => message.type === "user")
              ? await messageSelectionBefore(
                  client,
                  reload.sessionID,
                  first.id,
                  signal,
                  messages.find((message) => message.type === "assistant"),
                )
              : undefined
          for (const message of messages) {
            if (message.type === "agent-switched")
              selection = Object.assign({}, selection, { agent: message.agent })
            if (message.type === "model-switched")
              selection = Object.assign({}, selection, { model: message.model })
            yield* hydrate(reload.sessionID, message, session.location.directory, selection)
          }
        }
        if (replayAfterHydration(event, hydrated) || event.type.startsWith("session.execution.")) {
          const replayed = translator.translate(event, true)
          for (const mapped of replayed.events) yield mapped
        }
      } catch (error) {
        if (input.signal?.aborted) return
        if (sessionErrorStatus(error) === 404) {
          yield {
            directory: input.directory,
            payload: { type: "session.resync", properties: { sessionID: reload.sessionID } },
          }
          continue
        }
        throw error
      }
    }
  } catch (error) {
    if (!signal.aborted) throw error
  } finally {
    abort.abort()
  }
}
