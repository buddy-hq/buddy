import { z } from "zod"
import {
  authorizationHeader,
  createServerFetchTransport,
  resolveServerApiBaseUrl,
} from "../lib/server-client"
import { parseBuddyConfigObject, parseStringValue, parseWithSchema } from "./parse-external"

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

const advancedMathRuntimeStatusSchema = z.object({
  enabled: z.boolean(),
  state: z.enum([
    "not_installed",
    "downloading",
    "installing",
    "ready",
    "repairing",
    "removing",
    "error",
  ]),
  ready: z.boolean(),
  targetTriple: z.string(),
  supportedLibraries: z.array(z.string()),
  installedRuntimeVersion: z.string().optional(),
  executablePath: z.string().optional(),
  lastHealthyAt: z.string().optional(),
  lastError: z.string().optional(),
  progressPercent: z.number().finite().optional(),
  progressMessage: z.string().optional(),
})

function parseRuntimeErrorMessage<TValue>(value: TValue): string | undefined {
  const text = parseStringValue(value)
  if (text !== undefined && text.length > 0) return text
  const record = parseBuddyConfigObject(value)
  if (!record) return undefined
  return parseRuntimeErrorMessage(record.error)
}

function parseAdvancedMathRuntimeStatus<TValue>(
  value: TValue,
): AdvancedMathRuntimeStatus | undefined {
  return parseWithSchema(advancedMathRuntimeStatusSchema, value)
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
    headers: Object.assign({}, auth ? { authorization: auth } : undefined, init?.headers),
  })

  const body = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(parseRuntimeErrorMessage(body) ?? `Request failed (${response.status})`)
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
