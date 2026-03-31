export interface ToolState {
  status: "pending" | "running" | "completed" | "error"
  input: Record<string, unknown>
  metadata: Record<string, unknown>
  attachments: ToolAttachment[]
  start?: number
  end?: number
  output?: string
  error?: string
  title?: string
}

export interface ToolAttachment {
  id: string
  mime: string
  url: string
  filename?: string
}

export interface ToolInfo {
  title: string
  subtitle?: string
  detail?: string
  summary?: string
  args?: string[]
}

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

