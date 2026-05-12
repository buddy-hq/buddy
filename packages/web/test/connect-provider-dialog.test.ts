import { describe, expect, test } from "bun:test"
import { providerNeedsConfigDisable } from "../src/lib/provider-connection"
import { createProviderInfo } from "./test-utils"

describe("providerNeedsConfigDisable", () => {
  test("never disables opencode via config on disconnect", () => {
    expect(
      providerNeedsConfigDisable(
        createProviderInfo({
          id: "opencode",
          source: "custom",
        }),
        {
          provider: {
            opencode: {
              npm: "@ai-sdk/openai-compatible",
              models: {
                test: {},
              },
            },
          },
        },
      ),
    ).toBe(false)
  })

  test("disables custom config-defined openai-compatible providers", () => {
    expect(
      providerNeedsConfigDisable(
        createProviderInfo({
          id: "custom-openai-compatible",
          source: "custom",
        }),
        {
          provider: {
            "custom-openai-compatible": {
              npm: "@ai-sdk/openai-compatible",
              models: {
                test: {},
              },
            },
          },
        },
      ),
    ).toBe(true)
  })

  test("does not disable normal providers just because their runtime source is custom", () => {
    expect(
      providerNeedsConfigDisable(
        createProviderInfo({
          id: "openai",
          source: "custom",
        }),
        {},
      ),
    ).toBe(false)
  })
})
