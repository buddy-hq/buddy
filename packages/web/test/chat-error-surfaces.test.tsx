import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  AssistantErrorCard,
  AssistantTruncatedNote,
  createAssistantErrorCardSpec,
  type AssistantErrorActionID,
} from "../src/components/chat/assistant-error-card"
import { SessionRetryNotice, type RetryActionID } from "../src/components/chat/session-retry-notice"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

describe("locked chat error surfaces", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("renders the easel terminal companion card and keeps raw details disclosed", async () => {
    const actions: AssistantErrorActionID[] = []
    const spec = createAssistantErrorCardSpec({
      category: "temporarily-unavailable",
      disposition: "terminal",
      details: {
        name: "APIError",
        message: "Overloaded",
        statusCode: 529,
      },
    })

    await act(async () => {
      root.render(
        <AssistantErrorCard spec={spec} alert onAction={(action) => actions.push(action)} />,
      )
      await flushEffects()
    })

    const card = container.querySelector('[role="alert"]')
    expect(card?.className).toBe(
      "composer-surface composer-grain relative w-full overflow-hidden p-5",
    )
    expect(card?.textContent).toContain("This model is temporarily unavailable")
    expect(container.querySelector('img[alt="Buddy dozing"]')).not.toBeNull()

    const tryAgain = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Try again",
    )
    await act(async () => tryAgain?.click())
    expect(actions).toEqual(["try-again"])

    const details = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Details",
    )
    await act(async () => details?.click())
    expect(card?.textContent).toContain("APIError · statusCode 529")
    expect(card?.textContent).toContain("Overloaded")
    expect(card?.textContent).toContain("Copy")
  })

  test("uses the owning assistant provider for authentication recovery copy", () => {
    const spec = createAssistantErrorCardSpec(
      {
        category: "auth",
        disposition: "terminal",
        details: {
          name: "APIError",
          statusCode: 401,
          message: "Unauthorized",
        },
      },
      "OpenAI",
    )

    expect(spec).toMatchObject({
      headline: "OpenAI disconnected",
      detail: "Your OpenAI sign-in expired or was revoked.",
      primary: { label: "Reconnect OpenAI" },
      secondary: { label: "Switch model" },
    })
  })

  test("keeps provider branding out of free-model availability errors", () => {
    const spec = createAssistantErrorCardSpec(
      {
        category: "temporarily-unavailable",
        disposition: "terminal",
        details: {
          name: "APIError",
          statusCode: 401,
          responseBody:
            '{"type":"error","error":{"type":"ModelError","message":"No provider available"}}',
        },
      },
      "OpenCode Zen",
    )

    expect(spec).toMatchObject({
      headline: "This model is temporarily unavailable",
      primary: { id: "try-again", label: "Try again" },
      secondary: { id: "switch-model", label: "Switch model" },
    })
    expect(JSON.stringify(spec)).not.toContain("OpenCode Zen")
    expect(JSON.stringify(spec)).not.toContain("Reconnect")
  })

  test("uses the locked copy and actions for new terminal categories", () => {
    expect(
      createAssistantErrorCardSpec({
        category: "usage-limit",
        disposition: "terminal",
        details: { name: "APIError" },
      }),
    ).toMatchObject({
      headline: "You've reached this model's usage limit",
      detail: "Switch models to keep going.",
      primary: { id: "switch-model", label: "Switch model" },
    })

    expect(
      createAssistantErrorCardSpec({
        category: "model-unavailable",
        disposition: "terminal",
        details: { name: "APIError" },
      }),
    ).toMatchObject({
      headline: "This model isn't available",
      detail: "Choose another model to keep going.",
      primary: { id: "switch-model", label: "Switch model" },
    })

    expect(
      createAssistantErrorCardSpec({
        category: "access-restricted",
        disposition: "terminal",
        details: {
          name: "APIError",
          providerError: {
            type: "RegionError",
            message: "This model is not available in your region",
          },
        },
      }),
    ).toMatchObject({
      headline: "This model isn't available in your region",
      detail: "Choose another model to keep going.",
      primary: { id: "switch-model", label: "Switch model" },
    })
  })

  test("renders category-specific retry actions without announcing countdown ticks", async () => {
    const actions: RetryActionID[] = []
    await act(async () => {
      root.render(
        <SessionRetryNotice
          model={{
            stage: "persistent",
            category: "network",
            attempt: 5,
            next: Date.now() + 5_000,
            rawMessage: "Connection reset by peer",
            action: undefined,
          }}
          onAction={(action) => actions.push(action)}
        />,
      )
      await flushEffects()
    })

    const ticker = container.querySelector('[role="status"]')
    expect(ticker?.textContent).toContain("Still trying to reconnect")
    expect(ticker?.textContent).toContain("Retry attempt 5.")
    expect(ticker?.textContent).not.toContain("Trying again in")
    expect(container.textContent).toContain("attempt 5")

    const switchModel = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Switch model",
    )
    await act(async () => switchModel?.click())
    expect(actions).toEqual(["switch-model"])
  })

  test("renders the structured retry action copy and link label", async () => {
    const actions: RetryActionID[] = []
    await act(async () => {
      root.render(
        <SessionRetryNotice
          model={{
            stage: "actionable",
            category: "rate-limit",
            attempt: 1,
            next: Date.now() + 5_000,
            rawMessage: "Usage limit reached",
            action: {
              reason: "account_rate_limit",
              provider: "opencode",
              title: "Go limit reached",
              message: "Enable usage from your available balance to continue.",
              label: "Open settings",
              link: "https://example.test/settings",
            },
          }}
          onAction={(action) => actions.push(action)}
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Go limit reached")
    expect(container.textContent).toContain("Enable usage from your available balance to continue.")
    expect(container.textContent).toContain("Open settings")
    expect(container.textContent).not.toContain("free model")

    const openSettings = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Open settings",
    )
    await act(async () => openSettings?.click())
    expect(actions).toEqual(["open-action"])
  })

  test("renders the easel truncation note inline", async () => {
    let continued = false
    await act(async () => {
      root.render(<AssistantTruncatedNote onContinue={() => (continued = true)} />)
      await flushEffects()
    })

    const note = container.firstElementChild
    expect(note?.className).toBe(
      "flex items-center gap-2.5 rounded-lg border border-border-weaker-base bg-surface-raised-base/60 px-3 py-2 text-[13px] text-text-weak",
    )
    expect(note?.textContent).toContain("Response was cut off at the model’s length limit.")

    await act(async () => container.querySelector("button")?.click())
    expect(continued).toBe(true)
  })
})
