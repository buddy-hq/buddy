import { describe, expect, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"
import {
  formatChatGptPlan,
  formatRelativeTime,
  formatUsageWindowLabel,
  resolveUsageRemainingPercent,
  resolveAvailableProviders,
  resolveProviderListRowAction,
  resolveProviderListRowControls,
  resolveRecommendedProviderCards,
} from "../src/components/settings/settings-providers"
import { clearOpenAIUsageQuery, openAIUsageQueryKeys } from "../src/state/openai-usage-query"
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

describe("ChatGPT account formatting", () => {
  test("formats plan and usage window labels", () => {
    expect(formatChatGptPlan("team_k12")).toBe("Team K12")
    expect(formatChatGptPlan(null)).toBe("")
    expect(formatUsageWindowLabel(18_000)).toBe("5-hour limit")
    expect(formatUsageWindowLabel(604_800)).toBe("7-day limit")
    expect(resolveUsageRemainingPercent(1)).toBe(99)
    expect(resolveUsageRemainingPercent(100)).toBe(0)
  })

  test("formats reset timestamps relative to the current time", () => {
    expect(
      formatRelativeTime("2026-06-10T14:00:00.000Z", Date.parse("2026-06-10T12:00:00.000Z")),
    ).toBe("in 2 hours")
  })
})

describe("ChatGPT usage query cache", () => {
  test("clears account-scoped usage after authentication changes", () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(openAIUsageQueryKeys.current(), {
      status: "ready",
      plan: "plus",
    })

    clearOpenAIUsageQuery(queryClient)

    expect(queryClient.getQueryData(openAIUsageQueryKeys.current())).toBeUndefined()
  })
})
