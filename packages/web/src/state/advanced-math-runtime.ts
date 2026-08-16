import {
  authorizationHeader,
  createServerFetchTransport,
  resolveServerApiBaseUrl,
} from "../lib/server-client"

export type AdvancedMathRuntimeState =
  | "not_installed"
  | "downloading"
  | "installing"
  | "ready"
  | "repairing"
  | "removing"
  | "error"

export type AdvancedMathRuntimeStatus = {
  enabled: boolean
  state: AdvancedMathRuntimeState
  ready: boolean
  installedRuntimeVersion?: string
  targetTriple: string
  executablePath?: string
  lastHealthyAt?: string
  lastError?: string
  progressPercent?: number
  progressMessage?: string
  supportedLibraries: string[]
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

function parseAdvancedMathRuntimeStatus(value: unknown): AdvancedMathRuntimeStatus | undefined {
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
  if (typeof value.ready !== "boolean" || typeof value.targetTriple !== "string") {
    return undefined
  }
  if (!Array.isArray(value.supportedLibraries)) {
    return undefined
  }
  const supportedLibraries = value.supportedLibraries.filter(
    (entry): entry is string => typeof entry === "string",
  )

  return {
    enabled: value.enabled,
    state: value.state,
    ready: value.ready,
    targetTriple: value.targetTriple,
    supportedLibraries,
    installedRuntimeVersion:
      typeof value.installedRuntimeVersion === "string" ? value.installedRuntimeVersion : undefined,
    executablePath: typeof value.executablePath === "string" ? value.executablePath : undefined,
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
): Promise<AdvancedMathRuntimeStatus> {
  const baseUrl = resolveServerApiBaseUrl()
  const transport = createServerFetchTransport(baseUrl)
  const auth = authorizationHeader()
  const response = await transport(`${baseUrl}${pathname}`, {
    ...init,
    headers: Object.assign(
      {},
      auth ? { authorization: auth } : undefined,
      init?.headers,
    ),
  })

  const body = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(errorMessage(body) ?? `Request failed (${response.status})`)
  }

  const status = parseAdvancedMathRuntimeStatus(body)
  if (!status) {
    throw new Error("Invalid advanced math runtime status response")
  }
  return status
}

export function loadAdvancedMathRuntimeStatus() {
  return requestRuntimeStatus("/local-runtimes/advanced-math")
}

export function installAdvancedMathRuntime() {
  return requestRuntimeStatus("/local-runtimes/advanced-math/install", {
    method: "POST",
  })
}

export function removeAdvancedMathRuntime() {
  return requestRuntimeStatus("/local-runtimes/advanced-math/install", {
    method: "DELETE",
  })
}
