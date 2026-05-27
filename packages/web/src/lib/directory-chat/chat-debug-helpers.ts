import type { DirectoryChatState, MessagePart, MessageWithParts } from "@/state/chat-types"

type SlimRecord = Record<string, unknown>

export async function copyToClipboard(text: string) {
  if (!text) return false
  if (!("clipboard" in navigator)) return false
  await navigator.clipboard.writeText(text)
  return true
}

function isRecord(value: unknown): value is SlimRecord {
  return typeof value === "object" && value !== null
}

function slimSession(session: unknown, isCurrent: boolean) {
  if (!isRecord(session)) return {}
  const result: SlimRecord = {
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
  result.permission = { allowed: dedupeStrings(allowed), denied: dedupeStrings(denied) }
  return result
}

const SKIP_PART_TYPES = new Set(["step-start", "step-finish"])

const PART_OMIT_KEYS = new Set(["sessionID", "messageID"])

function slimPart(part: MessagePart): SlimRecord | null {
  if (SKIP_PART_TYPES.has(part.type)) return null
  if (part.type === "reasoning") {
    const { text: _, time: _t, ...rest } = part
    return omitKeys(rest, PART_OMIT_KEYS)
  }
  if (part.type === "tool") {
    const state = part.state
    if (!isRecord(state)) return omitKeys(part, PART_OMIT_KEYS)
    const { output: _o, metadata: _m, time: _t, ...slimState } = state
    const { state: _s, ...rest } = part
    return omitKeys({ ...rest, state: slimState }, PART_OMIT_KEYS)
  }
  if (part.type === "text") {
    const { time: _, ...rest } = part
    return omitKeys(rest, PART_OMIT_KEYS)
  }
  return omitKeys(part, PART_OMIT_KEYS)
}

function omitKeys<T extends SlimRecord>(obj: T, keys: Set<string>): SlimRecord {
  const result: SlimRecord = {}
  for (const [key, value] of Object.entries(obj)) {
    if (keys.has(key)) continue
    result[key] = value
  }
  return result
}

const INFO_OMIT_KEYS = new Set(["time", "tokens", "cost", "system"])

function slimInfo<T extends object>(info: T) {
  const result: SlimRecord = {}
  for (const [key, value] of Object.entries(info)) {
    if (INFO_OMIT_KEYS.has(key)) continue
    if (key === "model" && "role" in info && info.role === "user") continue
    if (key === "path" && isRecord(value)) {
      const { root: _, ...pathRest } = value
      if ("cwd" in pathRest) result.path = pathRest
      continue
    }
    if (key === "summary" && isRecord(value)) {
      const diffs = value.diffs
      if (Array.isArray(diffs) && diffs.length === 0) continue
    }
    result[key] = value
  }
  return result
}

function dedupeStrings(arr: unknown[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of arr) {
    if (typeof item !== "string") continue
    if (seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function slimMessage(msg: MessageWithParts) {
  const info = isRecord(msg.info) ? slimInfo(msg.info) : msg.info
  const parts = msg.parts.map(slimPart).filter((part): part is SlimRecord => part !== null)
  return { info, parts }
}

export function buildSessionTrace(input: {
  directory: string
  directoryState?: DirectoryChatState
  sessionID?: string
  streamStatus: string
}) {
  const directoryState = input.directoryState
  const sid = input.sessionID

  return JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      directory: input.directory,
      sessionID: sid,
      streamStatus: input.streamStatus,
      directoryState: directoryState
        ? {
            sessionTitle: directoryState.sessionTitle,
            ...(sid && directoryState.sessionStatusByID[sid]
              ? { sessionStatusByID: { [sid]: directoryState.sessionStatusByID[sid] } }
              : { sessionStatusByID: directoryState.sessionStatusByID }),
            isBusy: directoryState.isBusy,
            isReady: directoryState.isReady,
            ...(directoryState.error ? { error: directoryState.error } : {}),
            ...(directoryState.pendingPermissions.length > 0
              ? { pendingPermissions: directoryState.pendingPermissions }
              : {}),
            sessions: directoryState.sessions
              .filter((s) => !sid || s.id === sid)
              .map((s) => slimSession(s, s.id === sid)),
            messages: directoryState.messages.map(slimMessage),
          }
        : undefined,
    },
    null,
    2,
  )
}
