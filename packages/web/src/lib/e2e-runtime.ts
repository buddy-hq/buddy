import { resolveServerApiBaseUrl } from "./server-client"
import { authorizationHeader } from "./server-client"

const E2E_STATE_ENDPOINT = "/e2e/state" as const
const E2E_PROVIDERS_ENDPOINT = "/e2e/providers" as const

type E2ERuntimeState = {
  mode: "enabled"
  runtime: {
    providers: {
      openAIConnected: boolean
    }
  }
}

function hasE2ERuntimeState(value: unknown): value is E2ERuntimeState {
  if (!value || typeof value !== "object") {
    return false
  }

  if (!("runtime" in value)) {
    return false
  }

  const runtime = value.runtime
  if (!runtime || typeof runtime !== "object") {
    return false
  }

  if (!("providers" in runtime)) {
    return false
  }

  const providers = runtime.providers
  if (!providers || typeof providers !== "object") {
    return false
  }

  return "openAIConnected" in providers && typeof providers.openAIConnected === "boolean"
}

function resolveE2EApiUrl(endpoint: string) {
  const baseUrl = `${resolveServerApiBaseUrl().replace(/\/+$/, "")}/`
  return new URL(endpoint.replace(/^\/+/, ""), baseUrl)
}

function buildE2ERequestHeaders() {
  const auth = authorizationHeader()
  return auth
    ? {
        authorization: auth,
      }
    : undefined
}

export async function loadE2EOpenAIConnectedState() {
  try {
    const response = await fetch(resolveE2EApiUrl(E2E_STATE_ENDPOINT), {
      headers: buildE2ERequestHeaders(),
    })
    if (!response.ok) {
      return undefined
    }

    const payload: unknown = await response.json()
    if (!hasE2ERuntimeState(payload)) {
      return undefined
    }

    const connected = payload.runtime.providers.openAIConnected
    return typeof connected === "boolean" ? connected : undefined
  } catch {
    return undefined
  }
}

export async function setE2EOpenAIConnectedState(openAIConnected: boolean) {
  const response = await fetch(resolveE2EApiUrl(E2E_PROVIDERS_ENDPOINT), {
    method: "PUT",
    headers: {
      ...buildE2ERequestHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      openAIConnected,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to update E2E providers (${response.status})`)
  }
}
