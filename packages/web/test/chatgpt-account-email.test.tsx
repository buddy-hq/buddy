import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatGptAccountEmail } from "../src/components/usage/chatgpt-account-email"

describe("ChatGPT account email", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("starts blurred and reveals the account only when requested", async () => {
    await act(async () => root.render(<ChatGptAccountEmail email="learner@example.com" />))
    expect(container.textContent).not.toContain("learner@example.com")
    expect(container.textContent).toContain("le••••@••••")
    expect(container.textContent).not.toContain("Show email")

    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-action="toggle-chatgpt-email-blur"]',
    )
    if (!toggle) throw new Error("Expected clickable account email")

    await act(async () => toggle.click())
    expect(container.textContent).toContain("learner@example.com")
    await act(async () => toggle.click())
    expect(container.textContent).not.toContain("learner@example.com")

    await act(async () => toggle.click())
    expect(container.textContent).toContain("learner@example.com")
    await act(async () => root.unmount())
    root = createRoot(container)
    await act(async () => root.render(<ChatGptAccountEmail email="learner@example.com" />))
    expect(container.textContent).not.toContain("learner@example.com")
    expect(container.textContent).toContain("le••••@••••")
  })

  test("reveals compact email by clicking the blurred address", async () => {
    await act(async () => root.render(<ChatGptAccountEmail email="learner@example.com" compact />))
    expect(container.textContent).toBe("le••••@••••")
    expect(container.textContent).not.toContain("Show email")

    const email = container.querySelector<HTMLButtonElement>("button")
    if (!email) throw new Error("Expected clickable account email")
    expect(email.getAttribute("aria-label")).toBe("Show ChatGPT account email")

    await act(async () => email.click())
    expect(container.textContent).toBe("learner@example.com")

    await act(async () => email.click())
    expect(container.textContent).toBe("le••••@••••")
  })

  test("blurs a different account before it is rendered", async () => {
    await act(async () => root.render(<ChatGptAccountEmail email="alpha@example.com" />))
    const email = container.querySelector<HTMLButtonElement>("button")
    if (!email) throw new Error("Expected clickable account email")

    await act(async () => email.click())
    expect(container.textContent).toBe("alpha@example.com")

    await act(async () => root.render(<ChatGptAccountEmail email="beta@example.com" />))
    expect(container.textContent).toBe("be••••@••••")
    expect(container.textContent).not.toContain("beta@example.com")
  })
})
