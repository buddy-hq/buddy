import type { OpenCodeEvent, SessionMessageInfo, SessionMessageAssistant, SessionMessageAssistantTool } from "@opencode/client"
import { Buffer } from "node:buffer"
import { parseJsonObjectFromText, parseStringValue } from "@buddy/transcript-contract/parse-external"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import { partID, toBuddyMessage, toBuddyMessageError, toBuddyAssistantPart, type MessageContext } from "./message"
import { toBuddySession } from "./session"
import { subagentInboxMessage } from "./subagent"
import { MaxLiveShells, runningShellID, type LiveShellOutput } from "./shell-output"

const MaxSessions = 128
const MaxMessages = 32
const MaxMessageBytes = 1024 * 1024
const MaxPendingToolInputs = 64
const MaxPendingToolInputBytes = 1024 * 1024

type SessionState = { directory: string; workspaceID?: string; seq?: number; parentID?: string; providerID?: string; status?: "idle" | "busy" | "retry"; selection?: MessageContext["selection"] }
type Coverage = "fragment" | SessionMessageAssistantTool["state"]["status"]
type MessageState = { sessionID: string; workspaceID?: string; message: SessionMessageInfo; context: MessageContext; covered: Map<number, Coverage>; inputEnded: Set<number>; completed: boolean }

export type EventTranslation = {
  readonly events: readonly BuddyEvent[]
  readonly reload?: { readonly sessionID: string; readonly messageID?: string }
}

function messageIDFromEvent(id: string) {
  return id.replace(/^evt_/u, "msg_")
}

function emit(directory: string, type: string, properties: BuddyEvent["payload"]["properties"]): BuddyEvent {
  return { directory, payload: { type, properties } }
}

function messageKey(sessionID: string, messageID: string) {
  return `${sessionID}/${messageID}`
}

function toolInputKey(directory: string, workspaceID: string | undefined, sessionID: string, callID: string) {
  return JSON.stringify([directory, workspaceID, sessionID, callID])
}

export function createEventTranslator(input: { readonly directory: string; readonly presentation?: MessageContext["presentation"] }) {
  const sessions = new Map<string, SessionState>()
  const messages = new Map<string, MessageState>()
  const shellOutput = new Map<string, LiveShellOutput>()
  const pendingToolInputs = new Map<string, { value: string; bytes: number }>()
  let pendingToolInputBytes = 0

  function takeToolInput(key: string) {
    const pending = pendingToolInputs.get(key)
    if (!pending) return undefined
    pendingToolInputs.delete(key)
    pendingToolInputBytes -= pending.bytes
    return pending.value
  }

  function bufferToolInput(key: string, delta: string) {
    const previous = pendingToolInputs.get(key)
    const bytes = Buffer.byteLength(delta)
    pendingToolInputs.set(key, { value: (previous?.value ?? "") + delta, bytes: (previous?.bytes ?? 0) + bytes })
    pendingToolInputBytes += bytes
    while (pendingToolInputs.size > MaxPendingToolInputs || pendingToolInputBytes > MaxPendingToolInputBytes) {
      const first = pendingToolInputs.keys().next().value
      if (first === undefined) break
      takeToolInput(first)
    }
  }

  function runningShells() {
    const shells = new Map<string, { id: string; directory: string; previous?: LiveShellOutput }>()
    for (const state of messages.values()) {
      if (state.message.type !== "assistant" || state.completed) continue
      for (const part of state.message.content) {
        if (part.type !== "tool") continue
        const id = runningShellID(part)
        if (id && shells.size < MaxLiveShells) shells.set(id, { id, directory: state.context.directory, previous: shellOutput.get(id) })
      }
    }
    for (const id of shellOutput.keys()) if (!shells.has(id)) shellOutput.delete(id)
    return [...shells.values()]
  }

  function updateShellOutput(id: string, output: LiveShellOutput): BuddyEvent[] {
    if (shellOutput.get(id)?.output === output.output) {
      shellOutput.set(id, output)
      return []
    }
    const events: BuddyEvent[] = []
    for (const state of messages.values()) {
      if (state.message.type !== "assistant" || state.completed) continue
      for (const [index, part] of state.message.content.entries()) {
        if (part.type !== "tool" || runningShellID(part) !== id) continue
        shellOutput.set(id, output)
        events.push(emit(state.context.directory, "message.part.updated", { part: toBuddyAssistantPart(part, index, state.message, state.context) }))
      }
    }
    return events
  }

  function resync(sessionID: string, directory: string, messageID?: string): EventTranslation {
    return { events: [emit(directory, "session.resync", { sessionID })], reload: { sessionID, messageID } }
  }

  function remember(sessionID: string, message: SessionMessageInfo, context: MessageContext, hydrated = false) {
    if (Buffer.byteLength(JSON.stringify(message)) > MaxMessageBytes) {
      messages.delete(messageKey(sessionID, message.id))
      return false
    }
    const key = messageKey(sessionID, message.id)
    const previous = messages.get(key)
    const covered = hydrated && message.type === "assistant"
      ? new Map<number, Coverage>(message.content.flatMap((part, index): [number, Coverage][] => part.type === "tool" ? (part.state.status === "streaming" && part.state.input === "" ? [] : [[index, part.state.status]]) : part.text.length > 0 ? [[index, "fragment"]] : []))
      : previous?.covered ?? new Map<number, Coverage>()
    const completed = hydrated && message.type === "assistant" && message.time.completed !== undefined
    const workspaceID = sessions.get(sessionID)?.workspaceID
    if (hydrated && message.type === "assistant") {
      for (const part of message.content) {
        if (part.type === "tool") takeToolInput(toolInputKey(context.directory, workspaceID, sessionID, part.id))
      }
    }
    messages.delete(key)
    messages.set(key, { sessionID, workspaceID, message, context, covered, inputEnded: previous?.inputEnded ?? new Set<number>(), completed: completed || previous?.completed === true })
    while (messages.size > MaxMessages) {
      const first = messages.keys().next().value
      if (first === undefined) break
      messages.delete(first)
    }
    return true
  }

  function snapshot(message: SessionMessageInfo, context: MessageContext): BuddyEvent[] {
    const mapped = toBuddyMessage(message, context)
    if (!mapped) return []
    const info = mapped.info.role === "user" ? { ...mapped.info, sourceText: undefined } : mapped.info
    return [emit(context.directory, "message.updated", { info }), ...mapped.parts.map((part) => emit(context.directory, "message.part.updated", { part }))]
  }

  function seed(sessionID: string, message: SessionMessageInfo, directory = input.directory, hydrated = false, selection?: MessageContext["selection"]): BuddyEvent[] {
    const session = sessions.get(sessionID) ?? { directory }
    sessions.set(sessionID, session)
    if (selection) session.selection = selection
    if (message.type === "agent-switched") session.selection = { ...session.selection, agent: message.agent }
    if (message.type === "model-switched") session.selection = { ...session.selection, model: message.model }
    const context = { sessionID, directory, parentID: session?.parentID, presentation: input.presentation, shellOutput, selection: session.selection }
    if (message.type === "user" && session) session.parentID = message.id
    if (message.type === "assistant") session.providerID = message.model.providerID
    remember(sessionID, structuredClone(message), context, hydrated)
    return snapshot(message, context)
  }

  function translate(event: OpenCodeEvent, replay = false): EventTranslation {
    const directory = event.location?.directory ?? input.directory
    const workspaceID = event.location && "workspaceID" in event.location ? parseStringValue(event.location.workspaceID) : undefined
    if (event.type === "server.connected") {
      sessions.clear()
      messages.clear()
      shellOutput.clear()
      pendingToolInputs.clear()
      pendingToolInputBytes = 0
      return { events: [emit(input.directory, "server.connected", {})] }
    }
    if (event.type === "rpc.buddy.runtime.toolInputDelta") {
      const sessionID = parseStringValue(event.data.sessionID)
      const callID = parseStringValue(event.data.callID)
      const delta = parseStringValue(event.data.delta)
      if (!sessionID || !callID || !delta) return { events: [] }
      const matches = [...messages.values()].filter((state) => state.sessionID === sessionID && state.context.directory === directory && state.workspaceID === workspaceID && state.message.type === "assistant" && state.message.content.some((part) => part.type === "tool" && part.id === callID))
      const streaming = matches.filter((state) => !state.completed && state.message.type === "assistant" && state.message.content.some((part) => part.type === "tool" && part.id === callID && part.state.status === "streaming"))
      const state = streaming.length === 1 ? streaming[0] : undefined
      if (state) {
        return translate({ id: event.id, created: event.created, location: event.location, type: "session.tool.input.delta", data: { sessionID: state.sessionID, assistantMessageID: state.message.id, id: callID, delta } }, replay)
      }
      if (streaming.length === 0) bufferToolInput(toolInputKey(directory, workspaceID, sessionID, callID), delta)
      return { events: [] }
    }
    if (event.type === "filesystem.changed") {
      return { events: [emit(directory, "file.watcher.updated", event.data)] }
    }
    if (event.type === "reference.updated") return { events: [emit(directory, event.type, event.data)] }
    if (event.type === "mcp.status.changed") return { events: [emit(directory, event.type, event.data)] }
    if (event.type === "location.shutdown") return { events: [emit(directory, "server.instance.disposed", {})] }
    if (!("sessionID" in event.data)) return { events: [] }
    const sessionID = parseStringValue(event.data.sessionID)
    if (!sessionID) return { events: [] }
    let session = sessions.get(sessionID)
    if (!session) {
      session = { directory, workspaceID }
      sessions.set(sessionID, session)
      while (sessions.size > MaxSessions) {
        const first = sessions.keys().next().value
        if (first === undefined) break
        sessions.delete(first)
        for (const [key, value] of messages) if (value.sessionID === first) messages.delete(key)
      }
    } else {
      session.directory = directory
      if (event.location) session.workspaceID = workspaceID
      sessions.delete(sessionID)
      sessions.set(sessionID, session)
    }
    if ("durable" in event && !replay) {
      const previous = session.seq
      if (previous !== undefined && event.durable.seq <= previous) return { events: [] }
      session.seq = event.durable.seq
    }
    const status = (type: "idle" | "busy") => {
      session.status = type
      return { events: [emit(directory, "session.status", { sessionID, status: { type } })] }
    }

    switch (event.type) {
      case "session.created": {
        session.selection = { agent: event.data.agent, model: event.data.model }
        const info = toBuddySession({
          id: sessionID, projectID: event.data.projectID, location: event.data.location,
          parentID: event.data.parentID, title: event.data.title, metadata: event.data.metadata,
          time: { created: event.created, updated: event.created },
          cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        })
        return { events: [emit(directory, "session.created", { info })] }
      }
      case "session.deleted":
        sessions.delete(sessionID)
        for (const [key, value] of messages) if (value.sessionID === sessionID) messages.delete(key)
        return { events: [emit(directory, "session.deleted", { sessionID })] }
      case "session.renamed":
      case "session.metadata.updated":
      case "session.moved":
      case "session.revert.staged":
      case "session.revert.cleared":
        return { events: [], reload: { sessionID } }
      case "session.agent.selected":
        session.selection = { ...session.selection, agent: event.data.agent }
        return { events: [], reload: { sessionID } }
      case "session.model.selected":
        session.selection = { ...session.selection, model: event.data.model }
        return { events: [], reload: { sessionID } }
      case "session.revert.committed":
      case "session.forked":
        return resync(sessionID, directory)
      case "session.execution.started": return status("busy")
      case "session.execution.succeeded":
        return { events: [...status("idle").events, emit(directory, "session.resync", { sessionID })] }
      case "session.execution.interrupted":
        return { events: [
          ...(event.data.reason === "inactivity" ? [emit(directory, "session.stopped", { sessionID, reason: "inactivity" })] : []),
          ...status("idle").events,
          emit(directory, "session.resync", { sessionID }),
        ] }
      case "session.execution.failed":
        return { events: [emit(directory, "session.error", { sessionID, error: toBuddyMessageError(event.data.error, session.providerID) }), ...status("idle").events, emit(directory, "session.resync", { sessionID })] }
      case "session.retry.scheduled":
        session.status = "retry"
        return { events: [emit(directory, "session.status", { sessionID, status: { type: "retry", attempt: event.data.attempt, next: event.data.at, message: event.data.error.message } })] }
      case "session.inbox.delivered":
        return resync(sessionID, directory, event.data.inboxID)
      case "session.inbox.enqueued": {
        const message = subagentInboxMessage(event)
        return { events: message ? seed(sessionID, message, directory) : [] }
      }
      case "session.inbox.cancelled": {
        const key = messageKey(sessionID, event.data.inboxID)
        if (messages.get(key)?.message.type !== "synthetic") return { events: [] }
        messages.delete(key)
        return { events: [emit(directory, "message.removed", { sessionID, messageID: event.data.inboxID })] }
      }
      case "session.synthetic": {
        const message: SessionMessageInfo = { type: "synthetic", id: messageIDFromEvent(event.id), time: { created: event.created }, text: event.data.text, description: event.data.description, metadata: event.data.metadata }
        return { events: seed(sessionID, message, directory) }
      }
      case "session.skill.activated": {
        const message: SessionMessageInfo = { type: "skill", id: messageIDFromEvent(event.id), time: { created: event.created }, skill: event.data.id, name: event.data.name, text: event.data.text, metadata: event.metadata }
        return { events: seed(sessionID, message, directory) }
      }
      case "session.shell.started": {
        const metadata = event.data.shell.metadata.background === true ? { ...event.metadata, background: true } : event.metadata
        const message: SessionMessageInfo = { type: "shell", id: messageIDFromEvent(event.id), time: { created: event.created }, shellID: event.data.shell.id, command: event.data.shell.command, status: event.data.shell.status, metadata }
        return { events: seed(sessionID, message, directory) }
      }
      case "session.shell.ended": {
        const shell = [...messages.values()].find((value) => value.sessionID === sessionID && value.message.type === "shell" && value.message.shellID === event.data.shell.id)
        if (!shell || shell.message.type !== "shell") return resync(sessionID, directory)
        shell.message.status = event.data.shell.status
        shell.message.output = event.data.output
        shell.message.time.completed = event.created
        if (!remember(sessionID, shell.message, shell.context)) return resync(sessionID, directory)
        return { events: snapshot(shell.message, shell.context) }
      }
      case "session.compaction.started": {
        const message: SessionMessageInfo = { type: "compaction", id: event.data.inputID ?? messageIDFromEvent(event.id), status: "running", reason: event.data.reason, recent: event.data.recent, summary: "", time: { created: event.created }, metadata: event.metadata }
        return { events: seed(sessionID, message, directory) }
      }
      case "session.compaction.ended":
      case "session.compaction.failed":
        return resync(sessionID, directory)
      case "session.step.started": {
        const events = session.status === "retry" ? status("busy").events : []
        const previousState = messages.get(messageKey(sessionID, event.data.assistantMessageID))
        if (previousState) return { events }
        const message: SessionMessageAssistant = {
          type: "assistant", id: event.data.assistantMessageID,
          time: { created: event.data.started }, agent: event.data.agent, model: event.data.model,
          content: [], metadata: event.metadata,
        }
        return { events: [...events, ...seed(sessionID, message, directory)] }
      }
    }

    if (!("assistantMessageID" in event.data)) return { events: [] }
    const state = messages.get(messageKey(sessionID, event.data.assistantMessageID))
    if (!state || state.sessionID !== sessionID || state.message.type !== "assistant") return resync(sessionID, directory, event.data.assistantMessageID)
    if (state.completed) return { events: [] }
    const message = state.message
    let changedIndex: number | undefined
    let delta: { index: number; field: string; value: string } | undefined
    const fragmentIndex = (type: "text" | "reasoning", ordinal: number) => {
      let count = 0
      return message.content.findIndex((content) => content.type === type && count++ === ordinal)
    }
    const toolIndex = (id: string) => message.content.findIndex((content) => content.type === "tool" && content.id === id)
    const updateTool = (id: string, update: (part: SessionMessageAssistantTool) => void) => {
      const index = toolIndex(id)
      const part = message.content[index]
      if (part?.type !== "tool") return false
      update(part)
      changedIndex = index
      return true
    }

    switch (event.type) {
      case "session.text.started":
      case "session.reasoning.started": {
        const kind = event.type === "session.text.started" ? "text" : "reasoning"
        const count = message.content.filter((part) => part.type === kind).length
        if (event.data.ordinal < count) return { events: [] }
        if (event.data.ordinal !== count) return resync(sessionID, directory, message.id)
        changedIndex = message.content.length
        message.content.push(kind === "text" ? { type: "text", text: "" } : { type: "reasoning", text: "", state: "state" in event.data ? event.data.state : undefined, time: { created: event.created } })
        break
      }
      case "session.text.delta":
      case "session.reasoning.delta":
      case "session.text.ended":
      case "session.reasoning.ended": {
        const kind = event.type.startsWith("session.text.") ? "text" : "reasoning"
        const index = fragmentIndex(kind, event.data.ordinal)
        const part = message.content[index]
        if (!part || part.type !== kind) return resync(sessionID, directory, message.id)
        if ("delta" in event.data) {
          if (state.covered.has(index)) return { events: [] }
          part.text += event.data.delta
          delta = { index, field: "text", value: event.data.delta }
        } else {
          part.text = event.data.text
          part.state = event.data.state
          if (part.type === "reasoning") part.time = { created: part.time?.created ?? event.created, completed: event.created }
          changedIndex = index
          state.covered.delete(index)
        }
        break
      }
      case "session.tool.input.started":
        if (toolIndex(event.data.id) >= 0) return { events: [] }
        changedIndex = message.content.length
        message.content.push({ type: "tool", id: event.data.id, name: event.data.name, state: { status: "streaming", input: "" }, time: { created: event.created } })
        break
      case "session.tool.input.delta":
      case "session.tool.input.ended": {
        const index = toolIndex(event.data.id)
        const part = message.content[index]
        if (event.type === "session.tool.input.delta" && state.inputEnded.has(index)) return { events: [] }
        if (state.covered.has(index)) {
          if (event.type !== "session.tool.input.ended" || part?.type !== "tool" || part.state.status !== "streaming") return { events: [] }
          state.covered.delete(index)
        }
        if (part?.type === "tool" && part.state.status !== "streaming") return { events: [] }
        if (part?.type !== "tool" || part.state.status !== "streaming") return resync(sessionID, directory, message.id)
        if ("delta" in event.data) {
          part.state.input += event.data.delta
          delta = { index, field: "state.raw", value: event.data.delta }
        } else {
          part.state.input = event.data.text
          state.inputEnded.add(index)
          changedIndex = index
        }
        break
      }
      case "session.tool.called":
        if (message.content[toolIndex(event.data.id)]?.type === "tool") {
          const part = message.content[toolIndex(event.data.id)]
          if (part?.type === "tool" && part.state.status !== "streaming") return { events: [] }
        }
        state.covered.delete(toolIndex(event.data.id))
        if (!updateTool(event.data.id, (part) => {
          part.executed = event.data.executed
          part.providerState = event.data.state
          part.time.ran = event.created
          part.state = { status: "running", input: event.data.input, metadata: {} }
        })) return resync(sessionID, directory, message.id)
        break
      case "session.tool.progress":
        if (state.covered.get(toolIndex(event.data.id)) === "completed" || state.covered.get(toolIndex(event.data.id)) === "error") return { events: [] }
        if (!updateTool(event.data.id, (part) => {
          if (part.state.status === "running") part.state.metadata = event.data.metadata
        })) return resync(sessionID, directory, message.id)
        break
      case "session.tool.success":
        state.covered.delete(toolIndex(event.data.id))
        if (!updateTool(event.data.id, (part) => {
          part.time.completed = event.created
          part.executed = event.data.executed || part.executed === true
          part.state = { status: "completed", input: part.state.status === "streaming" ? {} : part.state.input, content: event.data.content, metadata: event.data.metadata }
        })) return resync(sessionID, directory, message.id)
        break
      case "session.tool.failed":
        state.covered.delete(toolIndex(event.data.id))
        if (!updateTool(event.data.id, (part) => {
          part.time.completed = event.created
          part.executed = event.data.executed || part.executed === true
          part.state = { status: "error", input: part.state.status === "streaming" ? {} : part.state.input, error: event.data.error, content: event.data.content, metadata: event.data.metadata }
        })) return resync(sessionID, directory, message.id)
        break
      case "session.step.streamed": message.time.streamed = event.created; break
      case "session.step.ended":
      case "session.step.failed":
        message.time.completed = event.created
        message.finish = event.data.finish ?? "error"
        message.cost = event.data.cost
        message.tokens = event.data.tokens
        if ("error" in event.data) message.error = event.data.error
        if (!remember(sessionID, message, state.context)) return resync(sessionID, directory, message.id)
        return { events: snapshot(message, state.context) }
      default: return { events: [] }
    }
    if (!remember(sessionID, message, state.context)) return resync(sessionID, directory, message.id)
    if (delta) {
      const part = message.content[delta.index]
      if (!part) return resync(sessionID, directory, message.id)
      const id = partID(message.id, delta.index, part.type === "tool" ? `tool:${part.id}` : part.type)
      const events = [emit(directory, "message.part.delta", { sessionID, messageID: message.id, partID: id, field: delta.field, delta: delta.value })]
      if (part.type === "tool" && part.state.status === "streaming" && part.state.input.trimEnd().endsWith("}") && parseJsonObjectFromText(part.state.input) !== undefined) {
        events.push(emit(directory, "message.part.updated", { part: toBuddyAssistantPart(part, delta.index, message, state.context) }))
      }
      return { events }
    }
    if (changedIndex !== undefined) {
      const part = message.content[changedIndex]
      if (part) {
        const events = [emit(directory, "message.part.updated", { part: toBuddyAssistantPart(part, changedIndex, message, state.context) })]
        if (event.type === "session.tool.input.started") {
          const pending = takeToolInput(toolInputKey(directory, workspaceID, sessionID, event.data.id))
          if (pending) {
            const flushed = translate({ id: event.id, created: event.created, location: event.location, type: "session.tool.input.delta", data: { sessionID, assistantMessageID: message.id, id: event.data.id, delta: pending } }, replay)
            return { events: [...events, ...flushed.events], reload: flushed.reload }
          }
        }
        return { events }
      }
    }
    return { events: [] }
  }

  function knowsParent(sessionID: string) {
    return sessions.get(sessionID)?.parentID !== undefined
  }

  return { translate, seed, knowsParent, runningShells, updateShellOutput }
}
