import { stringifyError } from "../../lib/api-client"
import type { McpStatusInfo } from "@/state/chat-types"

export type McpLocalConfig = {
  type: "local"
  command: string[]
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

export type McpRemoteConfig = {
  type: "remote"
  url: string
  enabled?: boolean
  headers?: Record<string, string>
  oauth?:
    | false
    | {
        clientId?: string
        clientSecret?: string
        scope?: string
      }
  timeout?: number
}

export type McpConfig = McpLocalConfig | McpRemoteConfig

export type McpEditorMode = "create" | "edit"

export type McpFormDraft = {
  name: string
  type: "local" | "remote"
  enabled: boolean
  timeout: string
  url: string
  command: string
  headersText: string
  environmentText: string
  oauthEnabled: boolean
  clientId: string
  clientSecret: string
  scope: string
}

export type McpFieldName = "name" | "timeout" | "url" | "headers" | "command" | "environment"

export type McpFieldError = {
  field: McpFieldName
  message: string
}

export type McpFieldErrors = Partial<Record<McpFieldName, string>>

export type McpDraftParseResult =
  | {
      fieldError: McpFieldError
    }
  | {
      name: string
      config: McpConfig
    }

export const STATUS_LABELS: Record<McpStatusInfo["status"], string> = {
  connected: "Connected",
  disabled: "Disabled",
  failed: "Failed",
  needs_auth: "Sign in required",
  needs_client_registration: "Needs setup",
}

export function getMcpStatusLabel(status: McpStatusInfo["status"]) {
  return STATUS_LABELS[status]
}

export function formatMcpError(error: unknown) {
  const message = stringifyError(error)
  const normalized = message.toLowerCase()

  if (
    normalized.includes("econnrefused") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch")
  ) {
    return "Could not connect to this MCP. Check the address and try again."
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "The connection timed out. The server may be busy or unavailable."
  }

  if (
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return "Authentication failed. Verify your credentials and try again."
  }

  return message
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).every((entry) => typeof entry === "string")
}

function createFieldError(field: McpFieldName, message: string): McpFieldError {
  return {
    field,
    message,
  }
}

export function getFieldErrorId(field: McpFieldName) {
  return `mcp-${field}-error`
}

function parseOAuthObject(value: Record<string, unknown>) {
  return {
    ...(typeof value.clientId === "string" ? { clientId: value.clientId } : {}),
    ...(typeof value.clientSecret === "string" ? { clientSecret: value.clientSecret } : {}),
    ...(typeof value.scope === "string" ? { scope: value.scope } : {}),
  }
}

export function parseMcpConfigMap(config: Record<string, unknown>) {
  const raw = config.mcp
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {} as Record<string, McpConfig>
  }

  const entries: Record<string, McpConfig> = {}

  for (const [name, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue

    const candidate = value as Record<string, unknown>

    if (
      candidate.type === "local" &&
      Array.isArray(candidate.command) &&
      candidate.command.every((item) => typeof item === "string")
    ) {
      entries[name] = {
        type: "local",
        command: candidate.command,
        ...(isStringRecord(candidate.environment) ? { environment: candidate.environment } : {}),
        ...(typeof candidate.enabled === "boolean" ? { enabled: candidate.enabled } : {}),
        ...(typeof candidate.timeout === "number" && Number.isInteger(candidate.timeout) && candidate.timeout > 0
          ? { timeout: candidate.timeout }
          : {}),
      }
      continue
    }

    if (candidate.type === "remote" && typeof candidate.url === "string") {
      const oauth =
        candidate.oauth === false
          ? false
          : candidate.oauth && typeof candidate.oauth === "object" && !Array.isArray(candidate.oauth)
            ? parseOAuthObject(candidate.oauth as Record<string, unknown>)
            : undefined

      entries[name] = {
        type: "remote",
        url: candidate.url,
        ...(isStringRecord(candidate.headers) ? { headers: candidate.headers } : {}),
        ...(typeof candidate.enabled === "boolean" ? { enabled: candidate.enabled } : {}),
        ...(oauth !== undefined ? { oauth } : {}),
        ...(typeof candidate.timeout === "number" && Number.isInteger(candidate.timeout) && candidate.timeout > 0
          ? { timeout: candidate.timeout }
          : {}),
      }
    }
  }

  return entries
}

export function emptyDraft(): McpFormDraft {
  return {
    name: "",
    type: "remote",
    enabled: true,
    timeout: "",
    url: "",
    command: "",
    headersText: "",
    environmentText: "",
    oauthEnabled: true,
    clientId: "",
    clientSecret: "",
    scope: "",
  }
}

export function buildDraft(name: string, config: McpConfig): McpFormDraft {
  if (config.type === "local") {
    return {
      name,
      type: "local",
      enabled: config.enabled !== false,
      timeout: typeof config.timeout === "number" ? String(config.timeout) : "",
      url: "",
      command: JSON.stringify(config.command, null, 2),
      headersText: "",
      environmentText: config.environment ? JSON.stringify(config.environment, null, 2) : "",
      oauthEnabled: false,
      clientId: "",
      clientSecret: "",
      scope: "",
    }
  }

  const oauthObject = config.oauth && typeof config.oauth === "object" ? config.oauth : undefined

  return {
    name,
    type: "remote",
    enabled: config.enabled !== false,
    timeout: typeof config.timeout === "number" ? String(config.timeout) : "",
    url: config.url,
    command: "",
    headersText: config.headers ? JSON.stringify(config.headers, null, 2) : "",
    environmentText: "",
    oauthEnabled: config.oauth !== false,
    clientId: oauthObject?.clientId ?? "",
    clientSecret: oauthObject?.clientSecret ?? "",
    scope: oauthObject?.scope ?? "",
  }
}

function parseOptionalStringMap(label: string, field: McpFieldName, value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return {
      value: undefined,
    } as const
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!isStringRecord(parsed)) {
      return {
        fieldError: createFieldError(field, `${label} must be a JSON object with text values.`),
      } as const
    }
    return {
      value: parsed,
    } as const
  } catch {
    return {
      fieldError: createFieldError(field, `${label} must be valid JSON.`),
    } as const
  }
}

export function buildConfigFromDraft(draft: McpFormDraft): McpDraftParseResult {
  const name = draft.name.trim()
  if (!name) {
    return {
      fieldError: createFieldError("name", "Name is required."),
    } as const
  }

  const timeoutValue = draft.timeout.trim()
  const timeout = timeoutValue.length > 0 ? Number.parseInt(timeoutValue, 10) : undefined

  if (timeoutValue.length > 0 && (!Number.isInteger(timeout) || !timeout || timeout <= 0)) {
    return {
      fieldError: createFieldError("timeout", "Timeout must be a positive whole number."),
    } as const
  }

  if (draft.type === "local") {
    const commandInput = draft.command.trim()
    if (!commandInput) {
      return {
        fieldError: createFieldError("command", "Local command is required."),
      } as const
    }

    const command = (() => {
      try {
        const parsed = JSON.parse(commandInput) as unknown
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          return {
            value: parsed,
          } as const
        }
        return {
          fieldError: createFieldError("command", "Command list must be a JSON array of text values."),
        } as const
      } catch {
        return {
          value: commandInput.split(/\s+/),
        } as const
      }
    })()

    if ("fieldError" in command && command.fieldError) {
      return {
        fieldError: command.fieldError,
      } as const
    }

    const environment = parseOptionalStringMap("Environment", "environment", draft.environmentText)
    if ("fieldError" in environment && environment.fieldError) {
      return {
        fieldError: environment.fieldError,
      } as const
    }

    return {
      name,
      config: {
        type: "local" as const,
        command: command.value,
        enabled: draft.enabled,
        ...(environment.value ? { environment: environment.value } : {}),
        ...(timeout ? { timeout } : {}),
      } satisfies McpConfig,
    } as const
  }

  const url = draft.url.trim()
  if (!url) {
    return {
      fieldError: createFieldError("url", "Remote URL is required."),
    } as const
  }

  try {
    new URL(url)
  } catch {
    return {
      fieldError: createFieldError("url", "Remote URL must be valid."),
    } as const
  }

  const headers = parseOptionalStringMap("Headers", "headers", draft.headersText)
  if ("fieldError" in headers && headers.fieldError) {
    return {
      fieldError: headers.fieldError,
    } as const
  }

  if (draft.oauthEnabled && headers.value?.Authorization) {
    return {
      fieldError: createFieldError(
        "headers",
        "Remove the Authorization header when browser sign-in is enabled. Use either browser sign-in or header-based auth, not both.",
      ),
    } as const
  }

  const oauth = draft.oauthEnabled
    ? {
        ...(draft.clientId.trim() ? { clientId: draft.clientId.trim() } : {}),
        ...(draft.clientSecret.trim() ? { clientSecret: draft.clientSecret.trim() } : {}),
        ...(draft.scope.trim() ? { scope: draft.scope.trim() } : {}),
      }
    : false

  return {
    name,
    config: {
      type: "remote" as const,
      url,
      enabled: draft.enabled,
      ...(headers.value ? { headers: headers.value } : {}),
      oauth,
      ...(timeout ? { timeout } : {}),
    } satisfies McpConfig,
  } as const
}
