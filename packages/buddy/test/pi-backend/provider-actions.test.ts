import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { app } from "../../src/index"
import { piRuntime } from "../../src/pi-backend/runtime"
import { readPiProviderCatalog } from "../../src/pi-backend/provider-actions"

const BUDDY_OPENAI_PROVIDER_ID = "openai"
const OPENCODE_PROVIDER_ID = "opencode"
const PI_CODEX_PROVIDER_ID = "openai-codex"
const RECOMMENDED_OPENCODE_MODEL_ID = "ring-2.6-1t-free"
const TEST_API_KEY = "test-api-key"

function clearOpenAIAuth() {
  const authStorage = piRuntime.getAuthStorage()
  authStorage.remove(BUDDY_OPENAI_PROVIDER_ID)
  authStorage.remove(PI_CODEX_PROVIDER_ID)
  piRuntime.refreshModels()
}

describe("PI provider catalog auth state", () => {
  beforeEach(() => {
    clearOpenAIAuth()
  })

  afterEach(() => {
    clearOpenAIAuth()
  })

  test("does not report model configuration as a connected credential", async () => {
    const catalog = await readPiProviderCatalog()
    const provider = catalog.all.find((item) => item.id === BUDDY_OPENAI_PROVIDER_ID)

    expect(provider).toBeDefined()
    expect(catalog.connected).not.toContain(BUDDY_OPENAI_PROVIDER_ID)
    expect(provider?.source).toBe("api")
  })

  test("exposes PI thinking levels as model variants for reasoning models", async () => {
    const catalog = await readPiProviderCatalog()
    const model = catalog.all
      .flatMap((provider) => Object.values(provider.models))
      .find((entry) => entry.capabilities.reasoning)

    expect(model).toBeDefined()
    expect(Object.keys(model?.variants ?? {})).toContain("off")
    expect(Object.keys(model?.variants ?? {})).toContain("high")
  })

  test("includes OpenCode Zen free models without requiring stored auth", async () => {
    const catalog = await readPiProviderCatalog()
    const provider = catalog.all.find((item) => item.id === OPENCODE_PROVIDER_ID)

    expect(provider).toBeDefined()
    expect(provider?.source).toBe("api")
    expect(catalog.connected).not.toContain(OPENCODE_PROVIDER_ID)
    expect(catalog.default[OPENCODE_PROVIDER_ID]).toBe(RECOMMENDED_OPENCODE_MODEL_ID)

    const models = provider?.models ?? {}
    expect(Object.keys(models).length).toBeGreaterThan(0)
    expect(Object.values(models).every((model) => model.cost.input === 0)).toBe(true)
  })

  test("stores and removes OpenAI auth using the PI openai-codex provider id", async () => {
    const setResponse = await app.request(`/api/auth/${BUDDY_OPENAI_PROVIDER_ID}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "api", key: TEST_API_KEY }),
    })
    expect(setResponse.status).toBe(200)
    expect(piRuntime.getAuthStorage().has(PI_CODEX_PROVIDER_ID)).toBe(true)

    const connectedCatalog = await readPiProviderCatalog()
    expect(connectedCatalog.connected).toContain(BUDDY_OPENAI_PROVIDER_ID)

    const deleteResponse = await app.request(`/api/auth/${BUDDY_OPENAI_PROVIDER_ID}`, {
      method: "DELETE",
    })
    expect(deleteResponse.status).toBe(200)
    expect(piRuntime.getAuthStorage().has(PI_CODEX_PROVIDER_ID)).toBe(false)
    expect(piRuntime.getAuthStorage().has(BUDDY_OPENAI_PROVIDER_ID)).toBe(false)

    const disconnectedCatalog = await readPiProviderCatalog()
    expect(disconnectedCatalog.connected).not.toContain(BUDDY_OPENAI_PROVIDER_ID)
  })
})
