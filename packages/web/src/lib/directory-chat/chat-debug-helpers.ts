import type { DirectoryChatState, MessagePart, MessageWithParts } from "@/state/chat-types"
import { getTranscriptMessages } from "@/state/transcript-repository"

type SlimRecord = Record<string, unknown>
type SlimSession = {
  id: unknown
  permission?: { allowed: string[]; denied: string[] }
  time: unknown
  title: unknown
}

const FILE_PART_TYPE = "file"
const IMAGE_MIME_PREFIX = "image/"
const TEXT_PART_TYPE = "text"
const ATTACHED_FILE_TEXT_PREFIX = "Attached file ("
const ATTACHED_FILE_TEXT_SEPARATOR = "):\n"

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
  const result: SlimSession = {
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

function isImageMime(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(IMAGE_MIME_PREFIX)
}

function readAttachedFileNameFromText(text: string): string | undefined {
  if (!text.startsWith(ATTACHED_FILE_TEXT_PREFIX)) {
    return undefined
  }

  const fileNameStart = ATTACHED_FILE_TEXT_PREFIX.length
  const fileNameEnd = text.indexOf(ATTACHED_FILE_TEXT_SEPARATOR, fileNameStart)
  if (fileNameEnd === -1) {
    return undefined
  }

  const fileName = text.slice(fileNameStart, fileNameEnd).trim()
  return fileName.length > 0 ? fileName : undefined
}

function hasImageFileExtension(fileName: string): boolean {
  const normalized = fileName.toLowerCase()
  return (
    normalized.endsWith(".png") ||
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg") ||
    normalized.endsWith(".gif") ||
    normalized.endsWith(".webp") ||
    normalized.endsWith(".svg") ||
    normalized.endsWith(".avif") ||
    normalized.endsWith(".bmp") ||
    normalized.endsWith(".ico")
  )
}

function redactAttachedImageText(text: string): string {
  const fileName = readAttachedFileNameFromText(text)
  if (!fileName) {
    return text
  }

  const payloadStart =
    text.indexOf(ATTACHED_FILE_TEXT_SEPARATOR) + ATTACHED_FILE_TEXT_SEPARATOR.length
  const payload = text.slice(payloadStart).trimStart()
  if (!hasImageFileExtension(fileName) && !payload.startsWith("<svg")) {
    return text
  }

  return `Attached image (${fileName}) omitted from trace.`
}

function slimPart(part: MessagePart): SlimRecord | null {
  if (SKIP_PART_TYPES.has(part.type)) return null
  if (part.type === "reasoning") {
    const { time: _t, ...rest } = part
    return omitKeys(rest, PART_OMIT_KEYS)
  }
  if (part.type === FILE_PART_TYPE && isImageMime(part.mime)) {
    const { url: _u, ...rest } = part
    return omitKeys(rest, PART_OMIT_KEYS)
  }
  if (part.type === "tool") {
    const state = part.state
    if (!isRecord(state)) return omitKeys(part, PART_OMIT_KEYS)
    const { output: _o, metadata: _m, time: _t, ...slimState } = state
    const { state: _s, ...rest } = part
    return omitKeys({ ...rest, state: slimState }, PART_OMIT_KEYS)
  }
  if (part.type === TEXT_PART_TYPE) {
    const { time: _, ...rest } = part
    const result = omitKeys(rest, PART_OMIT_KEYS)
    if (typeof result.text === "string") {
      result.text = redactAttachedImageText(result.text)
    }
    return result
  }
  return omitKeys(part, PART_OMIT_KEYS)
}

function omitKeys<T extends SlimRecord>(obj: T, keys: Set<string>) {
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
  const sid = input.sessionID ?? directoryState?.sessionID

  return JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      directory: input.directory,
      sessionID: sid,
      streamStatus: input.streamStatus,
      directoryState: directoryState
        ? Object.assign(
            {
              sessionTitle: directoryState.sessionTitle,
              sessionStatusByID:
                sid && directoryState.sessionStatusByID[sid]
                  ? { [sid]: directoryState.sessionStatusByID[sid] }
                  : directoryState.sessionStatusByID,
              isBusy: directoryState.isBusy,
              isReady: directoryState.isReady,
            },
            directoryState.error ? { error: directoryState.error } : undefined,
            directoryState.pendingPermissions.length > 0
              ? { pendingPermissions: directoryState.pendingPermissions }
              : undefined,
            {
              sessions: directoryState.sessions
                .filter((s) => !sid || s.id === sid)
                .map((s) => slimSession(s, s.id === sid)),
              messages: getTranscriptMessages(input.directory, sid).map(slimMessage),
            },
          )
        : undefined,
    },
    null,
    2,
  )
}
