import { describe, expect, test } from "bun:test"
import { resolveVisibleModelKeys } from "../src/lib/directory-chat/use-directory-chat-state"
import { createProviderInfo, createProviderModelInfo } from "./test-utils"

describe("resolveVisibleModelKeys", () => {
  test("keeps connected opencode models visible even when they are older than the recency window", () => {
    const visible = resolveVisibleModelKeys({
      connectedProviders: [
        createProviderInfo({
          id: "opencode",
          connected: true,
          models: [
            createProviderModelInfo({
              id: "free-model",
              providerID: "opencode",
              releaseDate: "2024-01-01",
            }),
          ],
        }),
      ],
      autoModelSelection: undefined,
      selectedModelOverrideKey: undefined,
      now: Date.parse("2026-05-12T00:00:00.000Z"),
    })

    expect(Array.from(visible)).toEqual(["opencode/free-model"])
  })

  test("still applies the recency window to non-opencode providers", () => {
    const visible = resolveVisibleModelKeys({
      connectedProviders: [
        createProviderInfo({
          id: "openai",
          connected: true,
          models: [
            createProviderModelInfo({
              id: "older-model",
              providerID: "openai",
              family: "gpt",
              releaseDate: "2024-01-01",
            }),
            createProviderModelInfo({
              id: "latest-model",
              providerID: "openai",
              family: "gpt",
              releaseDate: "2026-04-01",
            }),
          ],
        }),
      ],
      autoModelSelection: undefined,
      selectedModelOverrideKey: undefined,
      now: Date.parse("2026-05-12T00:00:00.000Z"),
    })

    expect(Array.from(visible)).toEqual(["openai/latest-model"])
  })
})
