import {
  authorizationHeader,
  createServerFetchTransport,
  resolveServerApiBaseUrl,
} from "../lib/server-client"

export type StandardsRuntimeState =
  | "not_installed"
  | "downloading"
  | "installing"
  | "ready"
  | "repairing"
  | "removing"
  | "error"

export type StandardsRuntimeStatus = {
  enabled: boolean
  state: StandardsRuntimeState
  ready: boolean
  installedDatasetVersion?: string
  installedArchiveChecksum?: string
  databasePath?: string
  lastHealthyAt?: string
  lastError?: string
  progressPercent?: number
  progressMessage?: string
}

type RuntimeErrorBody = {
  error?: unknown
}

function errorMessage(value: unknown) {
  if (typeof value === "string" && value.length > 0) return value
  if (value && typeof value === "object" && "error" in value) {
    return errorMessage((value as RuntimeErrorBody).error)
  }
  return undefined
}

async function requestRuntimeStatus(
  pathname: string,
  init?: RequestInit,
): Promise<StandardsRuntimeStatus> {
  const baseUrl = resolveServerApiBaseUrl()
  const transport = createServerFetchTransport(baseUrl)
  const auth = authorizationHeader()
  const response = await transport(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      ...(auth ? { authorization: auth } : {}),
      ...init?.headers,
    },
  })

  const body = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(errorMessage(body) ?? `Request failed (${response.status})`)
  }

  return body as StandardsRuntimeStatus
}

export function loadStandardsRuntimeStatus() {
  return requestRuntimeStatus("/local-runtimes/standards")
}

export function installStandardsRuntime() {
  return requestRuntimeStatus("/local-runtimes/standards/install", {
    method: "POST",
  })
}

export function removeStandardsRuntime() {
  return requestRuntimeStatus("/local-runtimes/standards/install", {
    method: "DELETE",
  })
}
