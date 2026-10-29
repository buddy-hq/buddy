import { describe, expect, test } from "bun:test"
import { parseConfiguredModel } from "../src/lib/directory-chat/chat-prompt-helpers"

describe("parseConfiguredModel", () => {
  test("reads a saved Azure model with the current provider ID", () => {
    expect(parseConfiguredModel("azure-cognitive-services/gpt-x")).toEqual({
      providerID: "azure",
      modelID: "gpt-x",
    })
  })

  test("reads a saved Vertex Anthropic model with the current provider ID", () => {
    expect(parseConfiguredModel("google-vertex-anthropic/claude")).toEqual({
      providerID: "google-vertex",
      modelID: "claude",
    })
  })
})
