import { z } from "zod"
import type {
  DirectoryChatState,
  MessagePart,
  MessageWithParts,
  SessionInfo,
} from "@/state/chat-types"
import { getTranscriptMessages } from "@/state/transcript-repository"
import { resolveServerEndpoint } from "@/lib/server-client"

type TTracePrimitive = string | number | boolean | null
type TTraceValue = TTracePrimitive | TTraceValue[] | TTraceObject
type TTraceObject = { [key: string]: TTraceValue }

type TSlimSession = {
  id: string
  permission?: { allowed: string[]; denied: string[] }
  time: SessionInfo["time"]
  title: string
}

type TPermissionEntry = {
  permission: string
  action?: string
}

const FILE_PART_TYPE = "file"
const IMAGE_MIME_PREFIX = "image/"
const TEXT_PART_TYPE = "text"
const ATTACHED_FILE_TEXT_PREFIX = "Attached file ("
const ATTACHED_FILE_TEXT_SEPARATOR = "):\n"

const stringSchema = z.string()
const permissionEntrySchema = z.object({
  permission: z.string(),
  action: z.string().optional(),
})
const traceValueSchema: z.ZodType<TTraceValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(traceValueSchema),
    z.record(z.string(), traceValueSchema),
  ]),
)
const traceObjectSchema: z.ZodType<TTraceObject> = z.record(z.string(), traceValueSchema)

function parseTString<T>(value: T): string | undefined {
  const parsed = stringSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseTTraceObject<T>(value: T): TTraceObject | undefined {
  const parsed = traceObjectSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseTPermissionEntry<T>(value: T): TPermissionEntry | undefined {
  const parsed = permissionEntrySchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function toTraceObject<T>(value: T): TTraceObject {
  const parsed = traceObjectSchema.safeParse(JSON.parse(JSON.stringify(value)))
  return parsed.success ? parsed.data : {}
}

export async function copyToClipboard(text: string) {
  if (!text) return false
  if (!("clipboard" in navigator)) return false
  await navigator.clipboard.writeText(text)
  return true
}

function slimSession(session: SessionInfo, isCurrent: boolean) {
  const result: TSlimSession = {
    id: session.id,
    title: session.title,
    time: session.time,
  }
  const source = toTraceObject(session)
  if (!isCurrent || !Array.isArray(source.permission)) return result
  const allowed: string[] = []
  const denied: string[] = []
  for (const entry of source.permission) {
    const permissionEntry = parseTPermissionEntry(entry)
    if (permissionEntry === undefined) continue
    if (permissionEntry.action === "allow") allowed.push(permissionEntry.permission)
    else denied.push(permissionEntry.permission)
  }
  result.permission = { allowed: dedupeStrings(allowed), denied: dedupeStrings(denied) }
  return result
}

const SKIP_PART_TYPES = new Set(["step-start", "step-finish"])

const PART_OMIT_KEYS = new Set(["sessionID", "messageID"])

function isImageMime<T>(value: T): boolean {
  const mime = parseTString(value)
  return mime !== undefined && mime.startsWith(IMAGE_MIME_PREFIX)
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

function omitTraceKeys(obj: TTraceObject, keys: Set<string>) {
  const result: TTraceObject = {}
  for (const [key, value] of Object.entries(obj)) {
    if (keys.has(key)) continue
    result[key] = value
  }
  return result
}

function slimPart(part: MessagePart): TTraceObject | null {
  if (SKIP_PART_TYPES.has(part.type)) return null
  const source = toTraceObject(part)
  if (part.type === "reasoning") {
    return omitTraceKeys(source, new Set([...PART_OMIT_KEYS, "time"]))
  }
  if (part.type === FILE_PART_TYPE && isImageMime(part.mime)) {
    return omitTraceKeys(source, new Set([...PART_OMIT_KEYS, "url"]))
  }
  if (part.type === "tool") {
    const state = parseTTraceObject(part.state)
    if (state === undefined) return omitTraceKeys(source, PART_OMIT_KEYS)
    const slimState = omitTraceKeys(state, new Set(["output", "metadata", "time"]))
    const rest = omitTraceKeys(source, new Set([...PART_OMIT_KEYS, "state"]))
    rest.state = slimState
    return rest
  }
  if (part.type === TEXT_PART_TYPE) {
    const result = omitTraceKeys(source, new Set([...PART_OMIT_KEYS, "time"]))
    const text = parseTString(result.text)
    if (text !== undefined) result.text = redactAttachedImageText(text)
    return result
  }
  return omitTraceKeys(source, PART_OMIT_KEYS)
}

const INFO_OMIT_KEYS = new Set(["time", "tokens", "cost", "system"])

function slimInfo<T>(info: T) {
  const source = toTraceObject(info)
  const result: TTraceObject = {}
  for (const [key, value] of Object.entries(source)) {
    if (INFO_OMIT_KEYS.has(key)) continue
    if (key === "model" && parseTString(source.role) === "user") continue
    if (key === "path") {
      const pathObject = parseTTraceObject(value)
      if (pathObject === undefined) continue
      const pathRest: TTraceObject = {}
      for (const [pathKey, pathValue] of Object.entries(pathObject)) {
        if (pathKey === "root") continue
        pathRest[pathKey] = pathValue
      }
      if ("cwd" in pathRest) result.path = pathRest
      continue
    }
    if (key === "summary") {
      const summary = parseTTraceObject(value)
      if (summary !== undefined && Array.isArray(summary.diffs) && summary.diffs.length === 0) {
        continue
      }
    }
    result[key] = value
  }
  return result
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of arr) {
    if (seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function slimMessage(msg: MessageWithParts) {
  const info = slimInfo(msg.info)
  const parts = msg.parts.map(slimPart).filter((part): part is TTraceObject => part !== null)
  return { info, parts }
}

export function buildSessionTrace(input: {
  directory: string
  directoryState?: DirectoryChatState
  sessionID?: string
  streamStatus: string
  messages?: MessageWithParts[]
}) {
  const directoryState = input.directoryState
  const sid = input.sessionID ?? directoryState?.sessionID
  const rawMessages = input.messages ?? getTranscriptMessages(input.directory, sid)

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
              messages: rawMessages.map(slimMessage),
            },
          )
        : undefined,
    },
    null,
    2,
  )
}


export type SaveSessionTraceInput = {
  trace: string
  sessionID?: string
  sessionTitle?: string
  directory?: string
  devInstanceName?: string
  devServer?: string
  repositoryRoot?: string
}

export type SaveSessionTraceResult = {
  success: boolean
  filePath: string
  relativeFilePath: string
  worktree: string
  worktreeName: string
  branch: string
  devServer: string
  devInstanceName: string
  databasePath?: string
  sessionID?: string
  sessionTitle?: string
  directory?: string
  byteCount: number
  tokenCount: number
  messageCount: number
  streamStatus?: string
  savedAt: string
}

export type SessionTraceSaveMetadata = {
  sessionID?: string
  sessionTitle?: string
  directory?: string
  databasePath?: string
  devServer?: string
  devInstanceName?: string
  worktree?: string
  worktreeName?: string
  branch?: string
  filePath?: string
  relativeFilePath?: string
  capturedAt?: string
  streamStatus?: string
  messageCount?: number
  tokenCount?: number
  byteCount?: number
}

export function formatSessionTraceSummary(meta: SessionTraceSaveMetadata): string {
  const lines: string[] = [
    `Session: ${meta.sessionTitle || "Untitled chat"}${meta.sessionID ? ` (${meta.sessionID})` : ""}`,
  ]

  if (meta.databasePath) {
    lines.push(`Session DB: ${meta.databasePath}`)
  }

  if (meta.directory) {
    lines.push(`Directory: ${meta.directory}`)
  }

  const worktreeDisplay = meta.worktree || meta.worktreeName || "unknown"
  const branchPart = meta.branch ? ` (branch: ${meta.branch})` : ""
  lines.push(`Worktree: ${worktreeDisplay}${branchPart}`)

  const serverDisplay = meta.devServer || "local dev server"
  const instancePart = meta.devInstanceName ? ` (${meta.devInstanceName})` : ""
  lines.push(`Dev Server: ${serverDisplay}${instancePart}`)

  if (meta.relativeFilePath || meta.filePath) {
    lines.push(`Saved Trace File: ${meta.relativeFilePath || meta.filePath}`)
    if (meta.filePath && meta.relativeFilePath && meta.filePath !== meta.relativeFilePath) {
      lines.push(`Full Path: ${meta.filePath}`)
    }
  }

  if (meta.capturedAt) {
    lines.push(`Captured At: ${meta.capturedAt}`)
  }

  const details: string[] = []
  if (meta.streamStatus) {
    details.push(`Status: ${meta.streamStatus}`)
  }
  if (meta.messageCount !== undefined) {
    details.push(`${meta.messageCount} messages`)
  }
  if (meta.tokenCount !== undefined) {
    details.push(`~${meta.tokenCount.toLocaleString()} tokens`)
  }
  if (meta.byteCount !== undefined) {
    details.push(`${meta.byteCount.toLocaleString()} bytes`)
  }
  if (details.length > 0) {
    lines.push(`Trace Info: ${details.join(" | ")}`)
  }

  return lines.join("\n")
}

export async function saveSessionTraceToFile(
  input: SaveSessionTraceInput,
): Promise<SaveSessionTraceResult> {
  const payload = JSON.stringify(input)
  const headers = { "Content-Type": "application/json" }

  const endpoints = [
    resolveServerEndpoint("/api/dev/session-trace"),
    "/api/dev/session-trace",
    "/__buddy_devtools/session-trace",
  ]

  let lastError: Error | undefined

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: payload,
      })

      if (response.ok) {
        // SAFETY: The trace saving endpoint returns the validated SaveSessionTraceResult payload.
        return (await response.json()) as SaveSessionTraceResult
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError ?? new Error("Failed to save session trace to file")
}
