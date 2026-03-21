export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

export function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function readNonNegativeInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined
}

export function formatDuration(ms?: number): string {
  if (typeof ms !== "number" || ms < 0) return ""
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

export function formatTime(ms?: number): string {
  if (typeof ms !== "number") return ""
  const date = new Date(ms)
  const hours = date.getHours()
  const hour12 = hours % 12 || 12
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${hour12}:${minute} ${hours < 12 ? "AM" : "PM"}`
}

export function titleCase(value?: string): string {
  if (!value) return ""
  return value[0]?.toUpperCase() + value.slice(1)
}

export function basename(path: string): string {
  const normalized = path.replace(/\\+/g, "/")
  const segments = normalized.split("/").filter(Boolean)
  return segments.length > 0 ? segments[segments.length - 1] : path
}

export function dirname(path: string): string {
  const normalized = path.replace(/\\+/g, "/")
  const segments = normalized.split("/").filter(Boolean)
  if (segments.length <= 1) return "/"
  return segments.slice(0, -1).join("/")
}

export function stripAnsi(value: string): string {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    "",
  )
}

export function titleFromToolName(tool: string): string {
  return tool
    .split("_")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ")
}

const BUDDY_CUSTOM_TOOL_PREFIXES = [
  "teaching_",
  "goal_",
  "learner_",
  "curriculum_",
  "pedagogy_",
] as const

export function isBuddyCustomTool(tool: string): boolean {
  if (tool === "python_calculator") return true
  return BUDDY_CUSTOM_TOOL_PREFIXES.some((prefix) => tool.startsWith(prefix))
}

export function toToolStatus(value: unknown): "pending" | "running" | "completed" | "error" {
  if (value === "running") return "running"
  if (value === "completed") return "completed"
  if (value === "error") return "error"
  return "pending"
}

function parseJsonValue(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

export function unwrapError(message: string): string {
  const text = message.replace(/^Error:\s*/, "").trim()

  const read = (value: string) => {
    const first = parseJsonValue(value)
    if (typeof first !== "string") return first
    return parseJsonValue(first.trim())
  }

  let json = read(text)
  if (json === undefined) {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start !== -1 && end > start) {
      json = read(text.slice(start, end + 1))
    }
  }

  if (!isRecord(json)) return message

  const error = isRecord(json.error) ? json.error : undefined
  if (error) {
    const type = typeof error.type === "string" ? error.type : undefined
    const innerMessage = typeof error.message === "string" ? error.message : undefined
    if (type && innerMessage) return `${type}: ${innerMessage}`
    if (innerMessage) return innerMessage
    if (type) return type
    const code = typeof error.code === "string" ? error.code : undefined
    if (code) return code
  }

  const fallbackMessage = typeof json.message === "string" ? json.message : undefined
  if (fallbackMessage) return fallbackMessage

  const fallbackError = typeof json.error === "string" ? json.error : undefined
  if (fallbackError) return fallbackError

  return message
}

export function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string")
}
