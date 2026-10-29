import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import z from "zod"
import { createConfigConformanceHarness, type ConfigConformanceHarness } from "./harness-config"

let harness: ConfigConformanceHarness
const catalogSchema = z.object({ all: z.array(z.object({ id: z.string(), models: z.record(z.string(), z.json()) })), connected: z.array(z.string()), default: z.record(z.string(), z.string()) })

describe("Providers and auth port conformance", () => {
  beforeAll(async () => { harness = await createConfigConformanceHarness() })
  afterAll(async () => { await harness?.[Symbol.asyncDispose]() })

  test("the model catalog exposes capabilities, selectable variants, and token limits", async () => {
    const notebook = await harness.notebook("model-catalog")
    const catalog = await notebook.json("/provider", catalogSchema)
    const model = catalog.all.find((provider) => provider.id === "scripted")?.models.chat
    expect(model).toMatchObject({
      id: "chat", providerID: "scripted", name: "Conformance Chat", enabled: true,
      capabilities: { toolcall: true, reasoning: true, attachment: true, input: { text: true, image: true, audio: false }, output: { text: true, image: false } },
      limit: { context: 100_000, input: 90_000, output: 1_000 }, variants: { thoughtful: {} },
    })
    expect(catalog.connected).toContain("scripted")
    expect(catalog.default.scripted).toBe("chat")
  })

  test("saving and removing an API key changes provider connectivity without exposing the key", async () => {
    const notebook = await harness.notebook("api-credential")
    expect((await notebook.json("/provider", catalogSchema)).connected).not.toContain("openai")
    expect(await notebook.json("/auth/openai", z.boolean(), { method: "PUT", body: { type: "api", key: "conformance-private-key" } })).toBe(true)
    const connected = await notebook.json("/provider", catalogSchema)
    expect(connected.connected).toContain("openai")
    expect(JSON.stringify(connected)).not.toContain("conformance-private-key")
    const methods = await notebook.json("/provider/auth", z.json())
    expect(JSON.stringify(methods)).not.toContain("conformance-private-key")
    expect(await notebook.json("/auth/openai", z.boolean(), { method: "DELETE" })).toBe(true)
    expect((await notebook.json("/provider", catalogSchema)).connected).not.toContain("openai")
  })

  test("OAuth attempts have distinct handles and cancellation prevents completion", async () => {
    const notebook = await harness.notebook("oauth-cancel")
    const methods = await notebook.json("/provider/auth", z.record(z.string(), z.array(z.object({ id: z.string(), type: z.string() }))))
    expect(methods.openai).toContainEqual(expect.objectContaining({ id: "conformance-code", type: "oauth" }))
    const authorization = z.object({ attemptID: z.string(), methodID: z.string(), url: z.string() })
    const first = await notebook.json("/provider/openai/oauth/authorize", authorization, { body: { methodID: "conformance-code" } })
    const second = await notebook.json("/provider/openai/oauth/authorize", authorization, { body: { methodID: "conformance-code" } })
    expect(first.attemptID).not.toBe(second.attemptID)
    expect(new URL(first.url).protocol).toBe("https:")
    for (const attempt of [first, second]) {
      expect(await notebook.json("/provider/openai/oauth/cancel", z.boolean(), { body: { attemptID: attempt.attemptID } })).toBe(true)
      const completed = await notebook.request("/provider/openai/oauth/callback", { body: { attemptID: attempt.attemptID, methodID: attempt.methodID, code: "cancelled-fixture-code" } })
      expect(completed.status).toBe(404)
    }
    expect((await notebook.json("/provider", catalogSchema)).connected).not.toContain("openai")
  })
})
