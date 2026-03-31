import { useChatStore } from "@/state/chat-store"
import type { MessagePart, MessageWithParts } from "@/state/chat-types"

export async function copyToClipboard(text: string) {
  if (!text) return false
  if (!("clipboard" in navigator)) return false
  await navigator.clipboard.writeText(text)
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function slimSession(session: unknown, isCurrent: boolean) {
  if (!isRecord(session)) return {}
  const result: Record<string, unknown> = {
    id: session.id,
    title: session.title,
    time: session.time,
  }
  if (!isCurrent || !Array.isArray(session.permission)) return result
  const allowed: string[] = []
  const denied: string[] = []
  for (const entry of session.permission) {
    if (!isRecord(entry)) continue
    if (typeof entry.permission !== "string") continue
    if (entry.action === "allow") allowed.push(entry.permission)
    else denied.push(entry.permission)
  }
  result.permission = { allowed, denied }
  return result
}

function stripEncryptedFields(obj: unknown): unknown {
  if (!isRecord(obj)) return obj
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase().includes("encrypted")) continue
    result[key] = value
  }
  return result
}

function slimMetadata(metadata: unknown): unknown {
  if (!isRecord(metadata)) return metadata
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    result[key] = stripEncryptedFields(value)
  }
  return result
}

function slimPart(part: MessagePart): MessagePart {
  if (part.type === "tool") {
    const state = part.state
    if (!isRecord(state)) return part
    const { output: _o, metadata: _m, ...slimState } = state
    const { state: _s, ...rest } = part
    return { ...rest, state: slimState }
  }
  if (!isRecord(part.metadata)) return part
  const { metadata, ...rest } = part
  return { ...rest, metadata: slimMetadata(metadata) }
}

function slimMessage(msg: MessageWithParts) {
  const info = msg.info
  const parts = msg.parts.map(slimPart)
  if (info.role !== "user") return { info, parts }
  const { system: _, ...rest } = info
  return { info: rest, parts }
}

export function buildSessionTrace(input: {
  directory: string
  sessionID?: string
  streamStatus: string
}) {
  const state = useChatStore.getState()
  const directoryState = state.directories[input.directory]

  return JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      directory: input.directory,
      sessionID: input.sessionID,
      streamStatus: input.streamStatus,
      directoryState: directoryState
        ? {
            sessionTitle: directoryState.sessionTitle,
            sessionStatusByID: directoryState.sessionStatusByID,
            isBusy: directoryState.isBusy,
            isReady: directoryState.isReady,
            error: directoryState.error,
            pendingPermissions: directoryState.pendingPermissions,
            sessions: directoryState.sessions.map((s) => slimSession(s, s.id === input.sessionID)),
            messages: directoryState.messages.map(slimMessage),
          }
        : undefined,
    },
    null,
    2,
  )
}
