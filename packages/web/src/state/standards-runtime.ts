import { z } from "zod"
import {
  authorizationHeader,
  createServerFetchTransport,
  resolveServerApiBaseUrl,
} from "../lib/server-client"
import { parseBuddyConfigObject, parseStringValue, parseWithSchema } from "./parse-external"

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

const standardsRuntimeStatusSchema = z.object({
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
  installedDatasetVersion: z.string().optional(),
  installedArchiveChecksum: z.string().optional(),
  databasePath: z.string().optional(),
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

function parseStandardsRuntimeStatus<TValue>(value: TValue): StandardsRuntimeStatus | undefined {
  return parseWithSchema(standardsRuntimeStatusSchema, value)
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
    headers: Object.assign({}, auth ? { authorization: auth } : undefined, init?.headers),
  })

  const body = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(parseRuntimeErrorMessage(body) ?? `Request failed (${response.status})`)
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
