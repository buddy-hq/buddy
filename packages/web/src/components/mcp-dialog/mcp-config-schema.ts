import { stringifyError } from "../../lib/api-client"
import { language } from "@/context/language"
import type { McpStatusInfo } from "@/state/chat-types"
import { parseTJsonObject, parseTString, parseTBoolean, parseTNumber } from "@/components/chat/tools/types"
import { parseStringArray } from "@/state/chat-types"

type TMcpOAuthObject = {
  clientId?: string
  clientSecret?: string
  scope?: string
}

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
  oauth?: false | TMcpOAuthObject
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

export const STATUS_LABELS = {
  connected: language.t("mcp.statusLabels.connected"),
  disabled: language.t("mcp.statusLabels.disabled"),
  failed: language.t("mcp.statusLabels.failed"),
  needs_auth: language.t("mcp.statusLabels.needsAuth"),
  needs_client_registration: language.t("mcp.statusLabels.needsClientRegistration"),
} satisfies Record<McpStatusInfo["status"], string>

export function getMcpStatusLabel(status: McpStatusInfo["status"]) {
  return STATUS_LABELS[status]
}

export function mcpNeedsAuth(status: McpStatusInfo | undefined) {
  return status?.status === "needs_auth"
}

export function mcpNeedsClientRegistration(status: McpStatusInfo | undefined) {
  return status?.status === "needs_client_registration"
}

export function formatMcpError<TError>(error: TError) {
  const message = stringifyError(error)
  const normalized = message.toLowerCase()

  if (
    normalized.includes("econnrefused") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch")
  ) {
    return language.t("mcp.errors.connectFailed")
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return language.t("mcp.errors.timeout")
  }

  if (
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return language.t("mcp.errors.authFailed")
  }

  return message
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

function parseTStringRecord<TValue>(value: TValue) {
  const record = parseTJsonObject(value)
  if (!record) return undefined
  const entries = new Map<string, string>()
  for (const [key, entry] of Object.entries(record)) {
    const text = parseTString(entry)
    if (text === undefined) return undefined
    entries.set(key, text)
  }
  return Object.fromEntries(entries)
}

function parseTPositiveInteger<TValue>(value: TValue) {
  const numeric = parseTNumber(value)
  if (numeric === undefined || !Number.isInteger(numeric) || numeric <= 0) return undefined
  return numeric
}

function parseOAuthObject<TValue>(value: TValue): TMcpOAuthObject {
  const record = parseTJsonObject(value)
  if (!record) return {}
  const clientId = parseTString(record.clientId)
  const clientSecret = parseTString(record.clientSecret)
  const scope = parseTString(record.scope)
  return Object.assign(
    Object.assign(
      {},
      clientId === undefined ? undefined : { clientId },
      clientSecret === undefined ? undefined : { clientSecret },
    ),
    scope === undefined ? undefined : { scope },
  )
}

export function parseMcpConfigMap<TConfig>(config: TConfig) {
  const record = parseTJsonObject(config)
  if (!record) return {}
  const raw = parseTJsonObject(record.mcp)
  if (!raw) return {}

  const entries = new Map<string, McpConfig>()

  for (const [name, value] of Object.entries(raw)) {
    const candidate = parseTJsonObject(value)
    if (!candidate) continue

    const command = parseStringArray(candidate.command)
    if (candidate.type === "local" && command) {
      const environment = parseTStringRecord(candidate.environment)
      const enabled = parseTBoolean(candidate.enabled)
      const timeout = parseTPositiveInteger(candidate.timeout)
      const localConfig: McpLocalConfig = Object.assign(
        Object.assign(
          {
            type: "local" as const,
            command,
          },
          environment === undefined ? undefined : { environment },
          enabled === undefined ? undefined : { enabled },
        ),
        timeout === undefined ? undefined : { timeout },
      )
      entries.set(name, localConfig)
      continue
    }

    const url = parseTString(candidate.url)
    if (candidate.type === "remote" && url !== undefined) {
      const oauth =
        candidate.oauth === false
          ? false
          : parseTJsonObject(candidate.oauth)
            ? parseOAuthObject(candidate.oauth)
            : undefined

      const headers = parseTStringRecord(candidate.headers)
      const enabled = parseTBoolean(candidate.enabled)
      const timeout = parseTPositiveInteger(candidate.timeout)
      const remoteConfig: McpRemoteConfig = Object.assign(
        Object.assign(
          {
            type: "remote" as const,
            url,
          },
          headers === undefined ? undefined : { headers },
          enabled === undefined ? undefined : { enabled },
        ),
        Object.assign(
          {},
          oauth !== undefined ? { oauth } : undefined,
          timeout === undefined ? undefined : { timeout },
        ),
      )
      entries.set(name, remoteConfig)
    }
  }

  return Object.fromEntries(entries)
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
      timeout: parseTNumber(config.timeout) === undefined ? "" : String(config.timeout),
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

  const oauthObject =
    config.oauth && config.oauth !== false && parseTJsonObject(config.oauth)
      ? config.oauth
      : undefined

  return {
    name,
    type: "remote",
    enabled: config.enabled !== false,
    timeout: parseTNumber(config.timeout) === undefined ? "" : String(config.timeout),
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
    const parsed = parseTStringRecord(JSON.parse(trimmed))
    if (!parsed) {
      return {
        fieldError: createFieldError(
          field,
          language.t("mcp.validation.jsonObjectTextValues", { label: label }),
        ),
      } as const
    }
    return {
      value: parsed,
    } as const
  } catch {
    return {
      fieldError: createFieldError(field, language.t("mcp.validation.validJson", { label: label })),
    } as const
  }
}

export function buildConfigFromDraft(draft: McpFormDraft): McpDraftParseResult {
  const name = draft.name.trim()
  if (!name) {
    return {
      fieldError: createFieldError("name", language.t("mcp.validation.nameRequired")),
    } as const
  }

  const timeoutValue = draft.timeout.trim()
  const timeout = timeoutValue.length > 0 ? Number.parseInt(timeoutValue, 10) : undefined

  if (timeoutValue.length > 0 && (!Number.isInteger(timeout) || !timeout || timeout <= 0)) {
    return {
      fieldError: createFieldError("timeout", language.t("mcp.validation.timeoutPositiveWhole")),
    } as const
  }

  if (draft.type === "local") {
    const commandInput = draft.command.trim()
    if (!commandInput) {
      return {
        fieldError: createFieldError("command", language.t("mcp.validation.localCommandRequired")),
      } as const
    }

    const command = (() => {
      try {
        const parsed = parseStringArray(JSON.parse(commandInput))
        if (parsed) {
          return {
            value: parsed,
          } as const
        }
        return {
          fieldError: createFieldError(
            "command",
            language.t("mcp.validation.commandArrayRequired"),
          ),
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

    const environment = parseOptionalStringMap(
      language.t("mcp.localFields.environmentLabel"),
      "environment",
      draft.environmentText,
    )
    if ("fieldError" in environment && environment.fieldError) {
      return {
        fieldError: environment.fieldError,
      } as const
    }

    const localConfig: McpLocalConfig = Object.assign(
      {
        type: "local" as const,
        command: command.value,
        enabled: draft.enabled,
      },
      environment.value ? { environment: environment.value } : undefined,
      timeout ? { timeout } : undefined,
    )
    return {
      name,
      config: localConfig,
    } as const
  }

  const url = draft.url.trim()
  if (!url) {
    return {
      fieldError: createFieldError("url", language.t("mcp.validation.remoteUrlRequired")),
    } as const
  }

  try {
    const parsedUrl = new URL(url)
    void parsedUrl
  } catch {
    return {
      fieldError: createFieldError("url", language.t("mcp.validation.remoteUrlValid")),
    } as const
  }

  const headers = parseOptionalStringMap(
    language.t("mcp.remoteFields.headersJson"),
    "headers",
    draft.headersText,
  )
  if ("fieldError" in headers && headers.fieldError) {
    return {
      fieldError: headers.fieldError,
    } as const
  }

  if (draft.oauthEnabled && headers.value?.Authorization) {
    return {
      fieldError: createFieldError(
        "headers",
        language.t("mcp.validation.removeAuthHeaderWithOAuth"),
      ),
    } as const
  }

  const oauthObject: TMcpOAuthObject = Object.assign(
    {},
    draft.clientId.trim() ? { clientId: draft.clientId.trim() } : undefined,
    draft.clientSecret.trim() ? { clientSecret: draft.clientSecret.trim() } : undefined,
    draft.scope.trim() ? { scope: draft.scope.trim() } : undefined,
  )
  const oauth = draft.oauthEnabled ? oauthObject : false

  const remoteConfig: McpRemoteConfig = Object.assign(
    {
      type: "remote" as const,
      url,
      enabled: draft.enabled,
      oauth,
    },
    headers.value ? { headers: headers.value } : undefined,
    timeout ? { timeout } : undefined,
  )
  return {
    name,
    config: remoteConfig,
  } as const
}
