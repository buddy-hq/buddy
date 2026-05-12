import { describe, expect, test } from "bun:test"
import {
  resolveAvailableProviders,
  resolveProviderListRowAction,
  resolveProviderListRowControls,
  resolveRecommendedProviderCards,
} from "../src/components/settings/settings-providers"
import { createProviderInfo } from "./test-utils"

describe("resolveRecommendedProviderCards", () => {
  test("returns only disconnected recommended providers for section headings", () => {
    const providers = resolveRecommendedProviderCards([
      createProviderInfo({ id: "openai", connected: false }),
      createProviderInfo({ id: "opencode", connected: true }),
      createProviderInfo({ id: "opencode-go", connected: false }),
      createProviderInfo({ id: "anthropic", connected: false }),
    ])

    expect(providers.map((provider) => provider.id)).toEqual(["openai", "opencode-go"])
  })
})

describe("resolveAvailableProviders", () => {
  test("returns all disconnected providers for the all providers section", () => {
    const providers = resolveAvailableProviders([
      createProviderInfo({ id: "anthropic", name: "Anthropic", connected: false }),
      createProviderInfo({ id: "openai", name: "OpenAI", connected: false }),
      createProviderInfo({ id: "opencode", name: "OpenCode Zen", connected: false }),
      createProviderInfo({ id: "opencode-go", name: "OpenCode Go", connected: false }),
      createProviderInfo({ id: "google", name: "Google", connected: false }),
      createProviderInfo({ id: "github-copilot", name: "GitHub Copilot", connected: true }),
    ])

    expect(providers.map((provider) => provider.id)).toEqual([
      "anthropic",
      "google",
      "openai",
      "opencode-go",
      "opencode",
    ])
  })
})

describe("resolveProviderListRowAction", () => {
  test("returns edit for connected providers", () => {
    expect(
      resolveProviderListRowAction(createProviderInfo({ id: "openai", source: "custom" }), true),
    ).toBe("edit")
  })

  test("still returns edit for connected env providers", () => {
    expect(
      resolveProviderListRowAction(createProviderInfo({ id: "openai", source: "env" }), true),
    ).toBe("edit")
  })

  test("returns connect for disconnected providers", () => {
    expect(
      resolveProviderListRowAction(
        createProviderInfo({ id: "openai", connected: false, source: "custom" }),
        false,
      ),
    ).toBe("connect")
  })
})

describe("resolveProviderListRowControls", () => {
  test("shows edit only for connected non-env providers", () => {
    expect(
      resolveProviderListRowControls(createProviderInfo({ id: "openai", source: "custom" }), true),
    ).toEqual({
      showConnect: false,
      showDisconnect: false,
      showEdit: true,
      showEnvNote: false,
    })
  })

  test("shows edit and env note for env-managed providers", () => {
    expect(
      resolveProviderListRowControls(createProviderInfo({ id: "openai", source: "env" }), true),
    ).toEqual({
      showConnect: false,
      showDisconnect: false,
      showEdit: true,
      showEnvNote: true,
    })
  })

  test("shows only connect for disconnected providers", () => {
    expect(
      resolveProviderListRowControls(
        createProviderInfo({ id: "openai", connected: false, source: "custom" }),
        false,
      ),
    ).toEqual({
      showConnect: true,
      showDisconnect: false,
      showEdit: false,
      showEnvNote: false,
    })
  })
})
