import { describe, expect, test } from "bun:test"
import type { ModelMessage } from "ai"
import type { ProviderModel } from "../../../src/provider/provider.js"
import { ProviderTransform } from "../../../src/session/provider-transform.js"

function model(input?: {
  providerID?: string
  modelID?: string
  npm?: string
  interleaved?: ProviderModel["interleaved"]
}): ProviderModel {
  return {
    providerID: input?.providerID ?? "anthropic",
    id: input?.modelID ?? "k2p5",
    name: input?.modelID ?? "k2p5",
    api: {
      id: input?.modelID ?? "k2p5",
      npm: input?.npm ?? "@ai-sdk/anthropic",
    },
    limit: {
      context: 128_000,
      output: 32_000,
    },
    reasoning: true,
    interleaved: input?.interleaved,
    options: {},
  }
}

describe("parity.session.provider-transform", () => {
  test("maps assistant reasoning parts into interleaved reasoning field", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "step one",
          },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "list",
            input: { path: "." },
          },
        ],
      },
    ]

    const transformed = ProviderTransform.message(
      messages,
      model({
        interleaved: {
          field: "reasoning_content",
        },
      }),
    )

    const assistant = transformed[0]
    expect(assistant.role).toBe("assistant")
    expect(Array.isArray(assistant.content)).toBe(true)
    if (!Array.isArray(assistant.content)) {
      throw new Error("assistant content should be an array")
    }

    expect(assistant.content.some((part) => part.type === "reasoning")).toBe(false)
    expect(
      assistant.content.some(
        (part) =>
          part.type === "tool-call" && part.toolCallId === "call_1" && part.toolName === "list",
      ),
    ).toBe(true)

    const options = assistant.providerOptions as { openaiCompatible?: { reasoning_content?: string } } | undefined
    expect(options?.openaiCompatible?.reasoning_content).toBe("step one")
  })

  test("does not rewrite reasoning parts when interleaved field is unavailable", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "leave me in place",
          },
          {
            type: "text",
            text: "hello",
          },
        ],
      },
    ]

    const transformed = ProviderTransform.message(
      messages,
      model({
        modelID: "claude-sonnet-4-5",
        interleaved: undefined,
      }),
    )

    const assistant = transformed[0]
    expect(assistant.role).toBe("assistant")
    expect(Array.isArray(assistant.content)).toBe(true)
    if (!Array.isArray(assistant.content)) {
      throw new Error("assistant content should be an array")
    }

    expect(assistant.content.some((part) => part.type === "reasoning")).toBe(true)
    const options = assistant.providerOptions as { openaiCompatible?: { reasoning_content?: string } } | undefined
    expect(options?.openaiCompatible?.reasoning_content).toBeUndefined()
  })

  test("drops empty anthropic text/reasoning parts", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "",
          },
          {
            type: "text",
            text: "",
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "ok",
          },
        ],
      },
    ]

    const transformed = ProviderTransform.message(messages, model())
    expect(transformed.length).toBe(1)
    const assistant = transformed[0]
    expect(assistant.role).toBe("assistant")
    expect(Array.isArray(assistant.content)).toBe(true)
    if (!Array.isArray(assistant.content)) {
      throw new Error("assistant content should be an array")
    }
    expect(assistant.content).toEqual([
      {
        type: "text",
        text: "ok",
      },
    ])
  })
})
