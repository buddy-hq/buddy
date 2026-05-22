import type { Context } from "hono"
import type { AuthCredential } from "@earendil-works/pi-coding-agent"
import {
  BUDDY_OPENAI_PROVIDER_ID,
  PI_CODEX_PROVIDER_ID,
  piProviderCandidatesFromBuddy,
} from "./provider-aliases"
import { piRuntime } from "./runtime"

const BAD_REQUEST_STATUS = 400
const INVALID_AUTH_BODY_ERROR = "Unsupported PI auth payload"

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function readAuthCredential(value: unknown): AuthCredential | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined

  if (value.type === "api" && typeof value.key === "string") {
    return {
      type: "api_key",
      key: value.key,
    }
  }

  if (
    value.type === "oauth" &&
    typeof value.access === "string" &&
    typeof value.refresh === "string" &&
    typeof value.expires === "number"
  ) {
    return {
      type: "oauth",
      access: value.access,
      refresh: value.refresh,
      expires: value.expires,
      ...("accountId" in value && typeof value.accountId === "string"
        ? { accountId: value.accountId }
        : {}),
      ...("enterpriseUrl" in value && typeof value.enterpriseUrl === "string"
        ? { enterpriseUrl: value.enterpriseUrl }
        : {}),
    }
  }

  return undefined
}

function validatedJsonBody(c: Context): unknown {
  const request: unknown = c.req
  if (!request || typeof request !== "object" || !("valid" in request)) return undefined
  const valid = request.valid
  if (typeof valid !== "function") return undefined
  return Reflect.apply(valid, request, ["json"])
}

function piAuthWriteProviderID(providerID: string) {
  if (providerID === BUDDY_OPENAI_PROVIDER_ID) return PI_CODEX_PROVIDER_ID
  return providerID
}

export async function piSetAuth(c: Context): Promise<Response> {
  const credential = readAuthCredential(validatedJsonBody(c))
  if (!credential) {
    return c.json({ error: INVALID_AUTH_BODY_ERROR }, BAD_REQUEST_STATUS)
  }

  piRuntime.getAuthStorage().set(piAuthWriteProviderID(c.req.param("providerID")), credential)
  piRuntime.refreshModels()
  return c.json(true)
}

export async function piRemoveAuth(c: Context): Promise<Response> {
  const authStorage = piRuntime.getAuthStorage()
  for (const piProviderID of piProviderCandidatesFromBuddy(c.req.param("providerID"))) {
    authStorage.remove(piProviderID)
  }
  piRuntime.refreshModels()
  return c.json(true)
}
