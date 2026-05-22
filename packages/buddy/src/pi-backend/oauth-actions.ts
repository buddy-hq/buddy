import type { Context } from "hono"
import { BUDDY_OPENAI_PROVIDER_ID, PI_CODEX_PROVIDER_ID } from "./provider-aliases"
import { piRuntime } from "./runtime"

const BAD_REQUEST_STATUS = 400
const CALLBACK_METHOD = "auto"
const DEFAULT_OAUTH_INSTRUCTIONS =
  "Complete authorization in the browser to finish linking this provider."
const OAUTH_FLOW_NOT_FOUND_ERROR = "No pending PI OAuth flow for this provider."
const OAUTH_PROVIDER_NOT_FOUND_ERROR = "PI OAuth is not available for this provider."

type PendingOAuthFlow = {
  login: Promise<void>
  submitCode: (code: string) => void
  failCode: (error: Error) => void
}

const pendingFlows = new Map<string, PendingOAuthFlow>()

function ignoreSubmittedCode(_code: string) {
  return undefined
}

function ignoreCodeFailure(_error: Error) {
  return undefined
}

function piOAuthProviderID(providerID: string) {
  if (providerID === BUDDY_OPENAI_PROVIDER_ID) return PI_CODEX_PROVIDER_ID
  return providerID
}

function pendingKey(providerID: string) {
  return piOAuthProviderID(providerID)
}

function hasOAuthProvider(providerID: string) {
  return piRuntime
    .getAuthStorage()
    .getOAuthProviders()
    .some((provider) => provider.id === piOAuthProviderID(providerID))
}

function validatedJsonBody(c: Context): unknown {
  const request: unknown = c.req
  if (!request || typeof request !== "object" || !("valid" in request)) return undefined
  const valid = request.valid
  if (typeof valid !== "function") return undefined
  return Reflect.apply(valid, request, ["json"])
}

function readCallbackCode(c: Context) {
  const body = validatedJsonBody(c)
  return body && typeof body === "object" && "code" in body && typeof body.code === "string"
    ? body.code
    : undefined
}

export async function piAuthorizeProviderOAuth(c: Context): Promise<Response> {
  const providerID = c.req.param("providerID")
  const piProviderID = piOAuthProviderID(providerID)
  if (!hasOAuthProvider(providerID)) {
    return c.json({ error: OAUTH_PROVIDER_NOT_FOUND_ERROR }, BAD_REQUEST_STATUS)
  }

  const key = pendingKey(providerID)
  pendingFlows.get(key)?.failCode(new Error("OAuth flow replaced by a newer request."))

  let submitCode: (code: string) => void = ignoreSubmittedCode
  let failCode: (error: Error) => void = ignoreCodeFailure
  const manualCode = new Promise<string>((resolve, reject) => {
    submitCode = resolve
    failCode = reject
  })
  void manualCode.catch(() => undefined)
  let flow: PendingOAuthFlow | undefined

  const authorization = new Promise<{
    url: string
    method: typeof CALLBACK_METHOD
    instructions: string
  }>((resolve, reject) => {
    const login = piRuntime
      .getAuthStorage()
      .login(piProviderID, {
        onAuth(info) {
          resolve({
            url: info.url,
            method: CALLBACK_METHOD,
            instructions: info.instructions ?? DEFAULT_OAUTH_INSTRUCTIONS,
          })
        },
        onPrompt() {
          return manualCode
        },
        onManualCodeInput() {
          return manualCode
        },
        onProgress() {
          return undefined
        },
      })
      .then(() => {
        piRuntime.refreshModels()
      })
      .catch((error) => {
        reject(error)
        throw error
      })
      .finally(() => {
        if (flow && pendingFlows.get(key) === flow) {
          pendingFlows.delete(key)
        }
      })

    flow = {
      login,
      submitCode,
      failCode,
    }
    pendingFlows.set(key, flow)
  })

  return c.json(await authorization)
}

export async function piCompleteProviderOAuth(c: Context): Promise<Response> {
  const providerID = c.req.param("providerID")
  try {
    await completePendingPiOAuthFlow({
      providerID,
      code: readCallbackCode(c),
    })
  } catch (error) {
    if (error instanceof Error && error.message === OAUTH_FLOW_NOT_FOUND_ERROR) {
      return c.json({ error: OAUTH_FLOW_NOT_FOUND_ERROR }, BAD_REQUEST_STATUS)
    }

    throw error
  }

  return c.json(true)
}

export async function completePendingPiOAuthFlow(input: { providerID: string; code?: string }) {
  const flow = pendingFlows.get(pendingKey(input.providerID))
  if (!flow) {
    throw new Error(OAUTH_FLOW_NOT_FOUND_ERROR)
  }

  if (input.code) {
    flow.submitCode(input.code)
  }

  await flow.login
}
