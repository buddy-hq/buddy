import { describe, expect, test } from "bun:test"
import {
  resolveProviderModelGroup,
  resolveVisibleModelKeys,
} from "../src/lib/directory-chat/use-directory-chat-state"
import { createProviderInfo, createProviderModelInfo } from "./test-utils"

describe("resolveVisibleModelKeys", () => {
  test("keeps every usable model visible", () => {
    const visible = resolveVisibleModelKeys({
      usableProviders: [
        createProviderInfo({
          id: "openai",
          connected: true,
          models: [
            createProviderModelInfo({
              id: "gpt-5.2",
              providerID: "openai",
              releaseDate: "2024-01-01",
            }),
            createProviderModelInfo({
              id: "gpt-5.4",
              providerID: "openai",
              releaseDate: "2024-05-01",
            }),
            createProviderModelInfo({
              id: "gpt-5.5",
              providerID: "openai",
              releaseDate: "2026-05-01",
            }),
          ],
        }),
      ],
      autoModelSelection: undefined,
      selectedModelOverrideKey: undefined,
    })

    expect(Array.from(visible)).toEqual(["openai/gpt-5.2", "openai/gpt-5.4", "openai/gpt-5.5"])
  })

  test("keeps auto and selected model keys visible", () => {
    const visible = resolveVisibleModelKeys({
      usableProviders: [
        createProviderInfo({
          id: "openai",
          connected: true,
          models: [
            createProviderModelInfo({
              id: "gpt-5.4-mini",
              providerID: "openai",
              releaseDate: "2024-01-01",
            }),
          ],
        }),
      ],
      autoModelSelection: {
        providerID: "openai",
        modelID: "gpt-5.5-pro",
      },
      selectedModelOverrideKey: "opencode/free-model",
    })

    expect(Array.from(visible)).toEqual([
      "openai/gpt-5.4-mini",
      "openai/gpt-5.5-pro",
      "opencode/free-model",
    ])
  })
})

describe("resolveProviderModelGroup", () => {
  test("labels anonymous Zen models as free models", () => {
    expect(
      resolveProviderModelGroup(
        createProviderInfo({ id: "opencode", name: "OpenCode Zen", connected: false }),
      ),
    ).toBe("Free models")
  })

  test("keeps the Zen provider name after credentials connect it", () => {
    expect(
      resolveProviderModelGroup(
        createProviderInfo({ id: "opencode", name: "OpenCode Zen", connected: true }),
      ),
    ).toBe("OpenCode Zen")
  })
})
