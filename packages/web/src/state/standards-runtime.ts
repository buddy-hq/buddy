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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorMessage(value: unknown) {
  if (typeof value === "string" && value.length > 0) return value
  if (isRecord(value) && "error" in value) {
    const errorValue = value.error
    return errorMessage(errorValue)
  }
  return undefined
}

function parseStandardsRuntimeStatus(value: unknown): StandardsRuntimeStatus | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  if (typeof value.enabled !== "boolean") {
    return undefined
  }
  if (
    value.state !== "not_installed" &&
    value.state !== "downloading" &&
    value.state !== "installing" &&
    value.state !== "ready" &&
    value.state !== "repairing" &&
    value.state !== "removing" &&
    value.state !== "error"
  ) {
    return undefined
  }
  if (typeof value.ready !== "boolean") {
    return undefined
  }

  return {
    enabled: value.enabled,
    state: value.state,
    ready: value.ready,
    installedDatasetVersion:
      typeof value.installedDatasetVersion === "string" ? value.installedDatasetVersion : undefined,
    installedArchiveChecksum:
      typeof value.installedArchiveChecksum === "string"
        ? value.installedArchiveChecksum
        : undefined,
    databasePath: typeof value.databasePath === "string" ? value.databasePath : undefined,
    lastHealthyAt: typeof value.lastHealthyAt === "string" ? value.lastHealthyAt : undefined,
    lastError: typeof value.lastError === "string" ? value.lastError : undefined,
    progressPercent:
      typeof value.progressPercent === "number" && Number.isFinite(value.progressPercent)
        ? value.progressPercent
        : undefined,
    progressMessage: typeof value.progressMessage === "string" ? value.progressMessage : undefined,
  }
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

  const status = parseStandardsRuntimeStatus(body)
  if (!status) {
    throw new Error("Invalid standards runtime status response")
  }
  return status
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
