import { expect, mock, test } from "bun:test"
import { keepChatGPTRequestOnCodex } from "../src/extension/chatgpt"

test("ChatGPT sign-in routes a custom OpenAI endpoint to ChatGPT", async () => {
  const event = { baseURL: "https://proxy.example/v1" }

  await keepChatGPTRequestOnCodex(event, async () => true)

  expect(event.baseURL).toBe("https://chatgpt.com/backend-api/codex")
})

test("a custom OpenAI endpoint is preserved without ChatGPT sign-in", async () => {
  const event = { baseURL: "https://proxy.example/v1" }

  await keepChatGPTRequestOnCodex(event, async () => false)

  expect(event.baseURL).toBe("https://proxy.example/v1")
})

test("credential lookup failure routes a custom OpenAI endpoint to ChatGPT", async () => {
  const event = { baseURL: "https://proxy.example/v1" }

  await keepChatGPTRequestOnCodex(event, async () => {
    throw new Error("Credential lookup failed")
  })

  expect(event.baseURL).toBe("https://chatgpt.com/backend-api/codex")
})

test.each(["https://api.openai.com/v1", "https://chatgpt.com/backend-api/codex"])(
  "endpoint %s is preserved without credential lookup",
  async (baseURL) => {
    const event = { baseURL }
    const isChatGPT = mock(async () => true)

    await keepChatGPTRequestOnCodex(event, isChatGPT)

    expect(event.baseURL).toBe(baseURL)
    expect(isChatGPT).not.toHaveBeenCalled()
  },
)

test("an absent endpoint is preserved without credential lookup", async () => {
  const event = {}
  const isChatGPT = mock(async () => true)

  await keepChatGPTRequestOnCodex(event, isChatGPT)

  expect(event).toEqual({})
  expect(isChatGPT).not.toHaveBeenCalled()
})
