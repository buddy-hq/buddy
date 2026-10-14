import { expect, test } from "bun:test"
import { createAnthropic } from "@ai-sdk/anthropic"

async function generate(modelID: string) {
  let request: unknown
  const mockFetch = Object.assign(
    async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      request = JSON.parse(String(init?.body))
      return Response.json({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: modelID,
        content: [{ type: "text", text: "Hello" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      })
    },
    { preconnect: fetch.preconnect },
  )
  const model = createAnthropic({ apiKey: "test", fetch: mockFetch })(modelID)

  const result = await model.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    temperature: 0.3,
    topP: 0.8,
  })

  return { request, result }
}

test("Anthropic-compatible models retain both sampling parameters", async () => {
  const { request, result } = await generate("kimi-k2.5")
  expect(request).toMatchObject({ temperature: 0.3, top_p: 0.8 })
  expect(result.warnings).not.toContainEqual(expect.objectContaining({ feature: "topP" }))
})

test("Claude requests omit topP when temperature is set", async () => {
  const { request, result } = await generate("claude-sonnet-4-6")
  expect(request).toMatchObject({ temperature: 0.3 })
  expect(request).not.toHaveProperty("top_p")
  expect(result.warnings).toContainEqual(expect.objectContaining({ feature: "topP" }))
})
