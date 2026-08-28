import { BuddyClient, createBuddyClient } from "@buddy/sdk"
import { parseTJsonObject, parseTString } from "@/components/chat/tools/types"
import {
  authorizationHeader,
  createServerFetchTransport,
  resolveServerApiBaseUrl,
} from "./server-client"

export function getBuddyClient(directory?: string): BuddyClient {
  const auth = authorizationHeader()
  const baseUrl = resolveServerApiBaseUrl()
  const transport = createServerFetchTransport(baseUrl)

  return createBuddyClient({
    baseUrl,
    directory,
    headers: auth
      ? {
          authorization: auth,
        }
      : undefined,
    fetch: transport,
  })
}

type TBuddyResult<TData> = {
  data: TData | undefined
  error: unknown
  response: Response | undefined
}

function errorMessage<TError>(value: TError): string | undefined {
  const text = parseTString(value)
  if (text) return text
  const record = parseTJsonObject(value)
  if (!record) return undefined
  const nested = errorMessage(record.error)
  if (nested) return nested
  const message = parseTString(record.message)
  if (message) return message
  return undefined
}

export function requireBuddyData<TData>(result: TBuddyResult<TData>): TData {
  if (!result.response) {
    throw new Error(errorMessage(result.error) ?? "Request failed (no response)")
  }
  if (!result.response.ok || result.error !== undefined) {
    throw new Error(errorMessage(result.error) ?? `Request failed (${result.response.status})`)
  }
  if (result.data === undefined) {
    throw new Error(`Request failed (${result.response.status})`)
  }
  return result.data
}

export function buddyResultMessage(result: { error: unknown; response: Response | undefined }) {
  return (
    errorMessage(result.error) ?? `Request failed (${result.response?.status ?? "no response"})`
  )
}
