import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BrowserNewTabPage } from "../src/components/bench/surfaces/browser/browser-new-tab-page"
import { useInAppBrowserHistoryStore } from "../src/state/in-app-browser-history-store"

const DIRECTORY = "/workspace"

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  root = undefined
  container = undefined
  useInAppBrowserHistoryStore.setState({ byDirectory: {} })
})

describe("Browser new tab page", () => {
  test("shows a same-origin favicon for a recently visited page", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    useInAppBrowserHistoryStore.setState({
      byDirectory: {
        [DIRECTORY]: [
          { url: "https://hibuddy.in/docs", title: "Buddy docs", visitedAt: 2 },
          {
            url: "https://mail.google.com/mail/u/0/",
            title: "Inbox",
            visitedAt: 1,
          },
        ],
      },
    })

    await act(async () => {
      root?.render(
        <BrowserNewTabPage
          directory={DIRECTORY}
          searchEngineLabel="DuckDuckGo"
          onSubmitInput={() => true}
          onOpenUrl={() => undefined}
        />,
      )
    })

    const icons = [...(container.querySelectorAll("img") ?? [])].map((image) =>
      image.getAttribute("src"),
    )
    expect(icons).toEqual(["https://hibuddy.in/favicon.ico", "https://mail.google.com/favicon.ico"])
  })

  test("submits native new-tab searches through the selected provider surface", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const submissions: string[] = []

    await act(async () => {
      root?.render(
        <BrowserNewTabPage
          directory={DIRECTORY}
          searchEngineLabel="Google"
          onSubmitInput={(value) => {
            submissions.push(value)
            return true
          }}
          onOpenUrl={() => undefined}
        />,
      )
    })

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search with Google"]',
    )
    const form = input?.closest("form")
    const submitButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Submit search"]',
    )
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    if (!input || !form || !submitButton || !valueSetter) {
      throw new Error("Expected the new-tab search form.")
    }

    expect(document.activeElement).toBe(input)
    expect(submitButton.disabled).toBe(true)

    await act(async () => {
      valueSetter.call(input, "weather today")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })

    expect(submissions).toEqual(["weather today"])
    expect(input.value).toBe("")
  })

  test("keeps rejected input available for correction", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <BrowserNewTabPage
          directory={DIRECTORY}
          searchEngineLabel="DuckDuckGo"
          onSubmitInput={() => false}
          onOpenUrl={() => undefined}
        />,
      )
    })

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search with DuckDuckGo"]',
    )
    const form = input?.closest("form")
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    if (!input || !form || !valueSetter) throw new Error("Expected the new-tab search form.")

    await act(async () => {
      valueSetter.call(input, "javascript:alert(1)")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })

    expect(input.value).toBe("javascript:alert(1)")
  })
})
