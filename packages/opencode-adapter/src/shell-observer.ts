import path from "node:path"
import { parseStringValue } from "@buddy/transcript-contract/parse-external"
import type { OpenCodeClient, OpenCodeEvent, SessionMessageInfo } from "@opencode/client"
import type { OpenCodeHost } from "./host"

type Capture = { readonly id: string; readonly file: string; readonly sessionID: string; readonly directory: string }
type Tool = { readonly sessionID: string; readonly messageID: string; readonly toolID: string; readonly directory: string }
type RunningShell = Capture & Tool

const MaxShells = 32
const observers = new WeakMap<OpenCodeClient["event"], ReturnType<typeof createObserver>>()

function createObserver() {
  const captures = new Map<string, Capture>()
  const tools = new Map<string, Tool>()

  function prune<T>(entries: Map<string, T>) {
    while (entries.size > MaxShells) {
      const first = entries.keys().next().value
      if (first === undefined) break
      entries.delete(first)
    }
  }

  function running(directory: string): RunningShell[] {
    const result: RunningShell[] = []
    for (const [id, capture] of captures) {
      const tool = tools.get(id)
      if (tool && capture.directory === directory && tool.directory === directory && capture.sessionID === tool.sessionID) result.push({ ...capture, ...tool })
    }
    return result
  }

  function observe(event: OpenCodeEvent) {
    const directory = event.location?.directory
    if (event.type === "shell.created") {
      const sessionID = parseStringValue(event.data.info.metadata.sessionID)
      if (!directory || !sessionID || event.data.info.status !== "running" || !path.isAbsolute(event.data.info.file)) return
      captures.set(event.data.info.id, { id: event.data.info.id, file: event.data.info.file, sessionID, directory })
      prune(captures)
    } else if (event.type === "session.tool.progress") {
      const id = parseStringValue(event.data.metadata.shellID)
      if (!directory || !id) return
      tools.set(id, { sessionID: event.data.sessionID, messageID: event.data.assistantMessageID, toolID: event.data.id, directory })
      prune(tools)
    } else if (event.type === "shell.exited" || event.type === "shell.deleted") {
      captures.delete(event.data.id)
      tools.delete(event.data.id)
    } else if (event.type === "session.tool.success" || event.type === "session.tool.failed") {
      for (const [id, tool] of tools) {
        if (tool.sessionID !== event.data.sessionID || tool.messageID !== event.data.assistantMessageID || tool.toolID !== event.data.id) continue
        captures.delete(id)
        tools.delete(id)
      }
    } else if (event.type === "session.deleted" || event.type === "location.shutdown") {
      for (const [id, capture] of captures) {
        if (event.type === "session.deleted" ? capture.sessionID === event.data.sessionID : capture.directory === directory) captures.delete(id)
      }
      for (const [id, tool] of tools) {
        if (event.type === "session.deleted" ? tool.sessionID === event.data.sessionID : tool.directory === directory) tools.delete(id)
      }
    }
  }

  function restore(sessionID: string, message: SessionMessageInfo, directory: string): SessionMessageInfo {
    if (message.type !== "assistant" || message.time.completed !== undefined) return message
    const shells = running(directory).filter((shell) => shell.sessionID === sessionID && shell.messageID === message.id)
    if (shells.length === 0) return message
    return { ...message, content: message.content.map((part) => {
      if (part.type !== "tool" || part.state.status !== "running" || (part.name !== "shell" && part.name !== "bash")) return part
      const shell = shells.find((entry) => entry.toolID === part.id)
      return shell ? { ...part, state: { ...part.state, metadata: { ...part.state.metadata, shellID: shell.id } } } : part
    }) }
  }

  return { observe, running, restore, clear: () => { captures.clear(); tools.clear() } }
}

export function shellObserverFor(client: Pick<OpenCodeClient, "event">) {
  return observers.get(client.event)
}

export async function observeHostShells(host: OpenCodeHost): Promise<OpenCodeHost> {
  const observer = createObserver()
  const controller = new AbortController()
  const iterator = host.event.subscribe({ signal: controller.signal })[Symbol.asyncIterator]()
  try {
    const connected = await iterator.next()
    if (connected.done || connected.value.type !== "server.connected") throw new Error("Shell observer could not subscribe to the host")
  } catch (cause) {
    controller.abort()
    await iterator.return?.()
    await host.close()
    throw cause
  }
  observers.set(host.event, observer)
  const events = (async () => {
    while (!controller.signal.aborted) {
      const event = await iterator.next()
      if (event.done) return
      observer.observe(event.value)
    }
  })().catch((cause) => {
    if (!controller.signal.aborted) console.error("Buddy shell observation failed", cause instanceof Error ? cause.name : "UnknownError")
  }).finally(() => observer.clear())
  async function close() {
    controller.abort()
    observers.delete(host.event)
    try {
      await events
      await iterator.return?.()
    } finally {
      await host.close()
    }
  }
  return { ...host, close, [Symbol.asyncDispose]: close }
}
