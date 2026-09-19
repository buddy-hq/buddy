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
      root?.render(<BrowserNewTabPage directory={DIRECTORY} onOpen={() => undefined} />)
    })

    const icons = [...(container.querySelectorAll("img") ?? [])].map((image) =>
      image.getAttribute("src"),
    )
    expect(icons).toEqual(["https://hibuddy.in/favicon.ico", "https://mail.google.com/favicon.ico"])
  })
})
