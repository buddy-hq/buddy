import { describe, expect, test } from "bun:test"
import { IN_APP_BROWSER_BLANK_URL, IN_APP_BROWSER_URL_MAX_LENGTH } from "@buddy/browser-contract"
import {
  guardInAppBrowserNavigation,
  installInAppBrowserNavigationBlockedNotice,
} from "../src/main/in-app-browser-navigation"
import { installInAppBrowserPageNavigationGuard } from "../src/shared/in-app-browser-navigation"

type TGuardResult = {
  readonly allowed: boolean
  readonly prevented: boolean
  readonly blockedNotice: boolean
}

function guardResult(url: string): TGuardResult {
  let prevented = false
  let blockedNotice = false
  const allowed = guardInAppBrowserNavigation({
    event: {
      preventDefault() {
        prevented = true
      },
    },
    url,
    onBlocked() {
      blockedNotice = true
    },
  })
  return { allowed, prevented, blockedNotice }
}

describe("in-app Browser navigation guard", () => {
  test.each([
    "https://hibuddy.in/redirected",
    "http://localhost:1420/chat",
    IN_APP_BROWSER_BLANK_URL,
  ])("allows %s without intervention", (url) => {
    expect(guardResult(url)).toEqual({ allowed: true, prevented: false, blockedNotice: false })
  })

  test.each([
    "mailto:hello@hibuddy.in",
    "file:///Users/example/secret.txt",
    "javascript:alert(1)",
    "data:text/html,hello",
    "vscode://vscode-remote/ssh-remote+box/tmp",
  ])("blocks a redirect to %s", (url) => {
    expect(guardResult(url)).toEqual({ allowed: false, prevented: true, blockedNotice: true })
  })

  test.each([
    "blob:https://hibuddy.in/11111111-1111-1111-1111-111111111111",
    "blob:http://localhost:1420/11111111-1111-1111-1111-111111111111",
  ])("allows a blob URL whose embedded origin is HTTP(S): %s", (url) => {
    expect(guardResult(url)).toEqual({ allowed: true, prevented: false, blockedNotice: false })
  })

  test.each([
    "blob:file:///tmp/secret.txt",
    "blob:null/11111111-1111-1111-1111-111111111111",
    "blob:",
    "blob:https://hibuddy.in",
    "blob:javascript:alert(1)",
  ])("blocks a blob URL outside the HTTP(S) origin boundary: %s", (url) => {
    expect(guardResult(url)).toEqual({ allowed: false, prevented: true, blockedNotice: true })
  })

  test("blocks an oversize blob URL even when the embedded origin is HTTPS", () => {
    const url = `blob:https://hibuddy.in/${"a".repeat(IN_APP_BROWSER_URL_MAX_LENGTH)}`
    expect(url.length).toBeGreaterThan(IN_APP_BROWSER_URL_MAX_LENGTH)
    expect(guardResult(url)).toEqual({ allowed: false, prevented: true, blockedNotice: true })
  })

  test.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///tmp/secret.txt",
    "mailto:hello@hibuddy.in",
    "vscode://file/tmp/secret.txt",
  ])("blocks page activation before Chromium handles %s", (href) => {
    type ActivationEvent = Parameters<
      Parameters<typeof installInAppBrowserPageNavigationGuard>[0]["addEventListener"]
    >[1] extends (event: infer TEvent) => void
      ? TEvent
      : never
    let click: ((event: ActivationEvent) => void) | undefined
    let auxclick: ((event: ActivationEvent) => void) | undefined
    const removed: string[] = []
    const target: Parameters<typeof installInAppBrowserPageNavigationGuard>[0] = {
      addEventListener(type, listener) {
        if (type === "click") click = listener
        else auxclick = listener
      },
      removeEventListener(type) {
        removed.push(type)
      },
    }
    let prevented = false
    let stopped = false
    let notices = 0
    const event: ActivationEvent = {
      isTrusted: true,
      composedPath: () => [
        { localName: "span" },
        {
          baseURI: "https://fixture.test/page",
          localName: "a",
          getAttribute: () => href,
        },
      ],
      preventDefault: () => (prevented = true),
      stopImmediatePropagation: () => (stopped = true),
    }

    const dispose = installInAppBrowserPageNavigationGuard(target, () => (notices += 1))
    if (!click || !auxclick) throw new Error("Expected page activation listeners to be installed")
    click(event)

    expect({ prevented, stopped, notices }).toEqual({
      prevented: true,
      stopped: true,
      notices: 1,
    })
    dispose()
    expect(removed).toEqual(["click", "auxclick"])
  })

  test.each([
    "https://hibuddy.in/account",
    "http://localhost:60001/final",
    "blob:https://hibuddy.in/11111111-1111-1111-1111-111111111111",
  ])("allows page activation for %s", (href) => {
    type ActivationEvent = Parameters<
      Parameters<typeof installInAppBrowserPageNavigationGuard>[0]["addEventListener"]
    >[1] extends (event: infer TEvent) => void
      ? TEvent
      : never
    let click: ((event: ActivationEvent) => void) | undefined
    const target: Parameters<typeof installInAppBrowserPageNavigationGuard>[0] = {
      addEventListener(type, listener) {
        if (type === "click") click = listener
      },
      removeEventListener() {},
    }
    let prevented = false
    let notices = 0
    const event: ActivationEvent = {
      isTrusted: true,
      composedPath: () => [
        {
          baseURI: "https://fixture.test/page",
          localName: "a",
          getAttribute: () => href,
        },
      ],
      preventDefault: () => (prevented = true),
      stopImmediatePropagation() {},
    }

    installInAppBrowserPageNavigationGuard(target, () => (notices += 1))
    if (!click) throw new Error("Expected a click listener to be installed")
    click(event)

    expect({ prevented, notices }).toEqual({ prevented: false, notices: 0 })
  })

  test("forwards preload blocks only from the guest main frame", () => {
    const mainFrame = {}
    let listener: ((event: { readonly senderFrame: object | null }) => void) | undefined
    let removed = false
    let notices = 0
    const dispose = installInAppBrowserNavigationBlockedNotice(
      {
        mainFrame,
        ipc: {
          on: (_channel, next) => (listener = next),
          removeListener: () => (removed = true),
        },
      },
      () => (notices += 1),
    )
    if (!listener) throw new Error("Expected a blocked-navigation listener to be installed")

    listener({ senderFrame: {} })
    listener({ senderFrame: mainFrame })
    expect(notices).toBe(1)
    dispose()
    expect(removed).toBe(true)
  })
})
