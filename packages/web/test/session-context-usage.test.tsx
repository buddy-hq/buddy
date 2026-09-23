import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { SessionContextUsage } from "../src/components/directory-chat/session-context-usage"
import { openAIUsageQueryKeys } from "../src/state/openai-usage-query"

describe("SessionContextUsage", () => {
  let container: HTMLDivElement
  let composerInput: HTMLInputElement
  let queryClient: QueryClient
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    composerInput = document.createElement("input")
    container = document.createElement("div")
    document.body.append(composerInput, container)
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    composerInput.remove()
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function renderUsage(chatGptAvailable = false) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SessionContextUsage
            directory="/tmp/buddy-session-context-usage-test"
            chatGptAvailable={chatGptAvailable}
            messages={[]}
            providers={[]}
            selectedModel={{
              name: "Claude",
              providerID: "anthropic",
              contextLimit: 200_000,
            }}
          />
        </QueryClientProvider>,
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>("button")
    if (!trigger) throw new Error("Expected the session context usage trigger")
    return trigger
  }

  test("does not open the usage popover or move composer focus on hover", async () => {
    const trigger = await renderUsage()
    composerInput.focus()

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    })

    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull()
    expect(document.activeElement).toBe(composerInput)

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))
    })

    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull()
    expect(document.activeElement).toBe(composerInput)
  })

  test("offers ChatGPT connection at the bottom of the usage card when signed out", async () => {
    queryClient.setQueryData(openAIUsageQueryKeys.current(), { status: "not_connected" })
    const trigger = await renderUsage(true)

    await act(async () => trigger.click())

    const popover = document.querySelector('[data-slot="popover-content"]')
    expect(popover).not.toBeNull()
    expect(popover?.textContent).toContain("ChatGPT")
    expect(popover?.querySelector("button")?.textContent).toContain("Connect")
    const content = popover?.textContent ?? ""
    expect(content.indexOf("ChatGPT")).toBeGreaterThan(content.indexOf("Session Cost"))

    await act(async () => {
      queryClient.setQueryData(openAIUsageQueryKeys.current(), {
        status: "ready",
        plan: "plus",
        rateLimit: { primary: null, secondary: null },
        additionalRateLimits: [],
        credits: null,
        fetchedAt: "2026-09-23T00:00:00.000Z",
      })
    })
    await renderUsage(true)
    expect(popover?.textContent).not.toContain("Connect")
  })
})
