import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { SessionContextUsage } from "../src/components/directory-chat/session-context-usage"

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

  async function renderUsage() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SessionContextUsage
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

  test("keeps default Popover autofocus for an explicit trigger open", async () => {
    const trigger = await renderUsage()
    trigger.focus()

    await act(async () => trigger.click())

    const content = document.querySelector<HTMLElement>('[data-slot="popover-content"]')
    expect(content).not.toBeNull()
    expect(document.activeElement).toBe(content)
  })
})
