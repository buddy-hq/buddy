import { describe, expect, test } from "bun:test"
import { filterProvidersByQuery, resolveProviderSearchResults } from "../src/lib/provider-search"
import { createProviderInfo } from "./test-utils"

describe("filterProvidersByQuery", () => {
  test("returns all providers when query is empty", () => {
    const providers = [
      createProviderInfo({ id: "openai", name: "OpenAI" }),
      createProviderInfo({ id: "anthropic", name: "Anthropic" }),
    ]

    expect(filterProvidersByQuery(providers, "")).toEqual(providers)
    expect(filterProvidersByQuery(providers, "   ")).toEqual(providers)
  })

  test("matches provider name and id", () => {
    const providers = [
      createProviderInfo({ id: "openai", name: "OpenAI" }),
      createProviderInfo({ id: "anthropic", name: "Anthropic" }),
      createProviderInfo({ id: "github-copilot", name: "GitHub Copilot" }),
    ]

    expect(filterProvidersByQuery(providers, "open").map((provider) => provider.id)).toEqual([
      "openai",
    ])
    expect(filterProvidersByQuery(providers, "copilot").map((provider) => provider.id)).toEqual([
      "github-copilot",
    ])
  })

  test("fuzzy matches minor typos in provider name", () => {
    const providers = [createProviderInfo({ id: "anthropic", name: "Anthropic" })]

    expect(filterProvidersByQuery(providers, "anthopic").map((provider) => provider.id)).toEqual([
      "anthropic",
    ])
  })

  test("matches extra labels such as recommended titles", () => {
    const providers = [createProviderInfo({ id: "openai", name: "OpenAI" })]
    const extraLabelsByID = new Map([["openai", ["ChatGPT", "Use your active ChatGPT subscription."]]])

    expect(
      filterProvidersByQuery(providers, "chatgpt", extraLabelsByID).map((provider) => provider.id),
    ).toEqual(["openai"])
  })
})

describe("resolveProviderSearchResults", () => {
  test("filters the catalog once and partitions connected and available lists", () => {
    const allProviders = [
      createProviderInfo({ id: "openai", name: "OpenAI", connected: true }),
      createProviderInfo({ id: "anthropic", name: "Anthropic", connected: false }),
      createProviderInfo({ id: "google", name: "Google", connected: false }),
    ]
    const connectedProviders = allProviders.filter((provider) => provider.connected)
    const availableProviders = allProviders.filter((provider) => !provider.connected)

    const results = resolveProviderSearchResults({
      allProviders,
      connectedProviders,
      availableProviders,
      query: "open",
    })

    expect(results.connected.map((provider) => provider.id)).toEqual(["openai"])
    expect(results.available.map((provider) => provider.id)).toEqual([])
    expect(results.matchedIDs).toEqual(new Set(["openai"]))
  })

  test("returns original lists when query is empty", () => {
    const allProviders = [createProviderInfo({ id: "openai", name: "OpenAI", connected: true })]
    const connectedProviders = allProviders
    const availableProviders: typeof allProviders = []

    const results = resolveProviderSearchResults({
      allProviders,
      connectedProviders,
      availableProviders,
      query: "",
    })

    expect(results.connected).toBe(connectedProviders)
    expect(results.available).toBe(availableProviders)
    expect(results.matchedIDs).toBeUndefined()
  })
})
