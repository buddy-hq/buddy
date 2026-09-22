import { describe, expect, spyOn, test } from "bun:test"
import {
  isAppDocumentNavigation,
  openDesktopExternalLink,
  wireAppWindowExternalLinks,
  type AppWindowNavigationBoundary,
} from "../src/main/external-links"

const PACKAGED_APP_URL = "file:///Applications/Buddy.app/Contents/Resources/renderer/index.html#/"
const DEV_APP_URL = "http://localhost:5173/index.html"

type TWiredWindow = {
  openWindow(url: string): { action: "deny" }
  navigate(url: string): { prevented: boolean }
  opened: string[]
}

function wireWindow(appUrl: string): TWiredWindow {
  const opened: string[] = []
  let openHandler: ((url: string) => { action: "deny" }) | undefined
  let navigateHandler: ((event: { preventDefault(): void }, url: string) => void) | undefined
  const boundary: AppWindowNavigationBoundary = {
    currentUrl: () => appUrl,
    setWindowOpenHandler(handler) {
      openHandler = handler
    },
    onWillNavigate(handler) {
      navigateHandler = handler
    },
  }
  wireAppWindowExternalLinks(boundary, async (url) => {
    opened.push(url)
  })
  return {
    openWindow(url) {
      if (!openHandler) throw new Error("window open handler was not installed")
      return openHandler(url)
    },
    navigate(url) {
      if (!navigateHandler) throw new Error("will-navigate handler was not installed")
      let prevented = false
      navigateHandler(
        {
          preventDefault() {
            prevented = true
          },
        },
        url,
      )
      return { prevented }
    },
    opened,
  }
}

describe("app window document navigation", () => {
  test("treats the packaged renderer document as the app", () => {
    expect(
      isAppDocumentNavigation(
        PACKAGED_APP_URL,
        "file:///Applications/Buddy.app/Contents/Resources/renderer/index.html",
      ),
    ).toBe(true)
  })

  test("treats other files as leaving the app", () => {
    expect(isAppDocumentNavigation(PACKAGED_APP_URL, "file:///Users/example/notes.md")).toBe(false)
  })

  test("treats the dev server origin as the app", () => {
    expect(isAppDocumentNavigation(DEV_APP_URL, "http://localhost:5173/chat")).toBe(true)
    expect(isAppDocumentNavigation(DEV_APP_URL, "http://localhost:4096/chat")).toBe(false)
  })

  test("treats an unreadable URL as leaving the app", () => {
    expect(isAppDocumentNavigation("", "https://hibuddy.in")).toBe(false)
  })
})

describe("app window external links", () => {
  test("sends new-window web links to the default browser without opening an app window", () => {
    const appWindow = wireWindow(PACKAGED_APP_URL)

    expect(appWindow.openWindow("https://hibuddy.in/docs")).toEqual({ action: "deny" })
    expect(appWindow.opened).toEqual(["https://hibuddy.in/docs"])
  })

  test.each(["data:application/pdf;base64,AAAA", "javascript:alert(1)", "file:///etc/hosts"])(
    "denies a new window for %s without opening it anywhere",
    (url) => {
      const appWindow = wireWindow(PACKAGED_APP_URL)

      expect(appWindow.openWindow(url)).toEqual({ action: "deny" })
      expect(appWindow.opened).toEqual([])
    },
  )

  test("keeps the app window in place and opens external navigations in the default browser", () => {
    const appWindow = wireWindow(PACKAGED_APP_URL)

    expect(appWindow.navigate("mailto:hello@hibuddy.in")).toEqual({ prevented: true })
    expect(appWindow.opened).toEqual(["mailto:hello@hibuddy.in"])
  })

  test("blocks navigating the app window to a local file", () => {
    const appWindow = wireWindow(PACKAGED_APP_URL)

    expect(appWindow.navigate("file:///Users/example/notes.md")).toEqual({ prevented: true })
    expect(appWindow.opened).toEqual([])
  })

  test("allows navigation within the app document", () => {
    const appWindow = wireWindow(DEV_APP_URL)

    expect(appWindow.navigate("http://localhost:5173/index.html")).toEqual({ prevented: false })
    expect(appWindow.opened).toEqual([])
  })

  test("logs a link the system cannot open instead of leaving the failure unhandled", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => undefined)
    const failure = new Error("No application can open this link")

    openDesktopExternalLink("mailto:hello@hibuddy.in", () => Promise.reject(failure))
    await Promise.resolve()
    await Promise.resolve()

    expect(warn).toHaveBeenCalledWith("failed to open external link", failure)
    warn.mockRestore()
  })
})
