import { authorizationHeader, createServerFetchTransport, resolveServerApiBaseUrl } from "../lib/server-client"

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
  installedVersion?: string
  targetTriple: string
  executablePath?: string
  lastHealthyAt?: string
  lastError?: string
  progressPercent?: number
  progressMessage?: string
  supportedLibraries: string[]
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

async function requestRuntimeStatus(pathname: string, init?: RequestInit): Promise<AdvancedMathRuntimeStatus> {
  const baseUrl = resolveServerApiBaseUrl()
  const transport = createServerFetchTransport(baseUrl)
  const auth = authorizationHeader()
  const response = await transport(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      ...(auth ? { authorization: auth } : {}),
      ...(init?.headers ?? {}),
    },
  })

  const body = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(errorMessage(body) ?? `Request failed (${response.status})`)
  }

  return body as AdvancedMathRuntimeStatus
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
