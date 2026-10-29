import { expect, test } from "bun:test"
import { Schema } from "effect"
import { OpenCode, type ModelInfo, type SessionMessageAssistant, type SessionStructuredError } from "@opencode/client"
import { providerListSchema, type ProviderInfo } from "@buddy/agent-runtime/providers"
import { MessageError } from "@buddy/transcript-contract/message"
import { listProviderCatalog } from "../src/gateway/provider"
import { toBuddyMessage, toBuddyMessageError } from "../src/gateway/message"
import { createEventTranslator } from "../src/gateway/event"

const directory = "/workspace"
const sessionID = "ses_provider_errors"

const modelCases: readonly { providerID: string; cost: ModelInfo["cost"]; free: boolean; bundled: boolean }[] = [
  { providerID: "opencode", cost: [{ input: 0, output: 2, cache: { read: 0, write: 0 } }], free: true, bundled: true },
  { providerID: "opencode", cost: [{ input: 3, output: 4, cache: { read: 0, write: 0 } }], free: false, bundled: true },
  { providerID: "openai", cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 } }], free: true, bundled: false },
  { providerID: "custom", cost: [{ input: 3, output: 4, cache: { read: 0, write: 0 }, tier: { type: "context", size: 1000 } }], free: true, bundled: false },
]

test.each([...modelCases])("projects provider/model flags for $providerID with $cost", async ({ providerID, cost, free, bundled }) => {
  const model: ModelInfo = {
    id: "model", providerID, modelID: "model", name: "Model", enabled: true, status: "active",
    capabilities: { input: ["text"], output: ["text"], tools: true }, variants: [], time: { released: 0 },
    cost, limit: { context: 1000, output: 100 },
  }
  let definitions: ProviderInfo[] = [{ id: providerID, name: "Provider", source: "api", env: [], options: {}, models: {} }]
  let available = true
  const runtimeFetch: typeof fetch = Object.assign(async (request: RequestInfo | URL) => {
    const url = new URL(request instanceof Request ? request.url : String(request))
    switch (url.pathname) {
      case "/api/rpc/buddy.providers/catalog": return Response.json({ output: { providers: definitions } })
      case "/api/provider": return Response.json({ data: available ? [{ id: providerID, name: "Provider", activation: "auto", package: "test" }] : [] })
      case "/api/model": return Response.json({ data: available ? [model] : [] })
      case "/api/model/default": return Response.json({ data: null })
      case "/api/integration": return Response.json({ data: [] })
      default: return new Response(null, { status: 404 })
    }
  }, { preconnect: fetch.preconnect })
  const client = OpenCode.make({ baseUrl: "http://provider.test", fetch: runtimeFetch })
  const catalog = providerListSchema.parse(await listProviderCatalog(client, directory))
  expect(catalog.all[0]).toMatchObject({ bundled, models: { model: { free } } })
  definitions = catalog.all
  available = false
  const offlineCatalog = await listProviderCatalog(client, directory)
  expect(offlineCatalog.all[0]).toMatchObject({ bundled, models: { model: { free } } })
})

function api(payload: { type?: string; code?: string; message?: string }, status = 401): SessionStructuredError {
  return { type: "APIError", message: "Provider returned error", status, response: { body: JSON.stringify({ error: payload }) } }
}

const errorCases: readonly {
  family: string
  errors: readonly SessionStructuredError[]
  code: MessageError["code"]
  anonymousCode?: MessageError["anonymousCode"]
}[] = [
  { family: "auth", errors: [{ type: "ProviderAuthError", message: "Sign in" }, { type: "provider.auth", message: "Sign in" }, api({ type: "AuthError", message: "Sign in" })], code: "auth", anonymousCode: "model_unavailable" },
  { family: "generic auth", errors: [api({ type: "authentication_error" })], code: "auth" },
  { family: "bare unauthorized response", errors: [{ type: "APIError", message: "Request failed", status: 401 }], code: "auth", anonymousCode: "temporarily_unavailable" },
  { family: "credits", errors: [api({ type: "CreditsError" }), api({ code: "insufficient_credits" })], code: "credits_exhausted" },
  { family: "quota", errors: [api({ type: "MonthlyLimitError" }), api({ type: "UserLimitError" }), api({ code: "usage_limit_reached" })], code: "quota_exceeded" },
  { family: "rate limit", errors: [api({ type: "RateLimitError" }), api({ type: "FreeUsageLimitError" }), api({ type: "GoUsageLimitError" }), api({ type: "BlackUsageLimitError" }), { type: "provider.rate-limit", message: "Slow down" }, { type: "provider.quota", message: "Limit reached", status: 429 }], code: "rate_limited" },
  { family: "model unavailable", errors: [api({ type: "ModelError" }), api({ type: "AuthError", message: "Model is not supported" }), { type: "provider.no-route", message: "No route" }], code: "model_unavailable" },
  { family: "capacity", errors: [api({ type: "ModelError", message: "No provider available" }), { type: "provider.internal", message: "Failed" }], code: "temporarily_unavailable" },
  { family: "overload text before native model fallback", errors: [{ type: "provider.unknown", message: "No provider available" }], code: "temporarily_unavailable" },
  { family: "usage text before native rate limit", errors: [{ type: "provider.rate-limit", message: "Request failed", status: 429, response: { body: "insufficient credits" } }], code: "quota_exceeded" },
  { family: "region", errors: [api({ type: "RegionError" }), api({ code: "region_not_allowed" })], code: "region_blocked" },
  { family: "access", errors: [api({ code: "permission_denied" }, 403)], code: "access_denied" },
  { family: "network", errors: [{ type: "provider.transport", message: "Offline" }, { type: "provider.timeout", message: "Deadline passed" }], code: "network" },
  { family: "context", errors: [{ type: "ContextOverflowError", message: "Too long" }, api({ code: "context_length_exceeded" })], code: "context_limit" },
  { family: "content", errors: [{ type: "ContentFilterError", message: "Blocked" }], code: "content_blocked" },
  { family: "forbidden response before native content filter", errors: [{ type: "provider.content-filter", message: "Blocked", status: 403 }], code: "auth" },
  { family: "format", errors: [{ type: "StructuredOutputError", message: "Invalid result" }, { type: "provider.invalid-output", message: "Invalid result" }], code: "invalid_output" },
  { family: "output length", errors: [{ type: "MessageOutputLengthError", message: "Cut off" }], code: "output_limit" },
  { family: "stopped", errors: [{ type: "aborted", message: "Cancelled" }, { type: "MessageAbortedError", message: "Cancelled" }], code: "stopped" },
  { family: "unknown", errors: [{ type: "UnknownError", message: "Unexpected" }, { type: "APIError", message: "Unexpected", response: { body: "not json" } }], code: "unknown" },
]

test.each([...errorCases])("normalizes the $family error family through the message contract", ({ errors, code, anonymousCode }) => {
  for (const error of errors) {
    const projected = Schema.decodeUnknownSync(MessageError)(toBuddyMessageError(error, "opencode"))
    expect(projected.code).toBe(code)
    expect(projected.anonymousCode).toBe(anonymousCode)
    expect(projected.name).toBe(error.type === "aborted" ? "MessageAbortedError" : error.type)
    expect(projected.data).toEqual({ message: error.message, statusCode: error.status, responseBody: error.response?.body })
  }
})

test.each([
  { providerID: "opencode", code: "model_unavailable" },
  { providerID: "openai", code: "quota_exceeded" },
])("keeps provider-gated errors and limit details identical live, in history and hydrated for $providerID", ({ providerID, code }) => {
  const error: SessionStructuredError = {
    type: "provider.quota", message: "Usage limit reached", status: 429,
    response: { body: JSON.stringify({ error: JSON.stringify({ type: "ModelError", code: "usage_limit_reached", plan_type: "plus", resets_at: 1_800_000_000, resets_in_seconds: 0 }) }) },
  }
  const message: SessionMessageAssistant = {
    id: "msg_error", type: "assistant", agent: "buddy", model: { id: "model", providerID },
    content: [], error, time: { created: 1, completed: 2 },
  }
  const translator = createEventTranslator({ directory })
  translator.translate({ id: "evt_step", created: 1, durable: { aggregateID: sessionID, seq: 1, version: 1 }, type: "session.step.started", data: { sessionID, assistantMessageID: message.id, started: 1, agent: message.agent, model: message.model } })
  const live = translator.translate({ id: "evt_error", created: 2, durable: { aggregateID: sessionID, seq: 2, version: 1 }, type: "session.execution.failed", data: { sessionID, error } }).events
    .find((event) => event.payload.type === "session.error")?.payload.properties.error
  const history = toBuddyMessage(message, { directory, sessionID })
  const historicalError = history?.info.role === "assistant" ? history.info.error : undefined
  expect(historicalError).toMatchObject({ code, limit: { plan: "plus", resetsAt: 1_800_000_000, resetsInSeconds: 0 } })
  expect(live).toEqual(historicalError)
  const hydrated = translator.seed(sessionID, message, directory, true).find((event) => event.payload.type === "message.updated")?.payload.properties.info
  expect(hydrated).toMatchObject({ error: historicalError })
})
