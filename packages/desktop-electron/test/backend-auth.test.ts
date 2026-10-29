import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { shouldInjectBackendAuth } from "../src/main/backend-auth-policy"
import { createBackendAuthWindowRegistry } from "../src/main/backend-auth-window-registry"

const origin = "http://127.0.0.1:4100"
const appRequest = {
  requestUrl: `${origin}/api/images/image-1`,
  resourceType: "image",
  isAppWindow: true,
  isMainFrame: true,
  origin,
  requestHeaders: {},
}

describe("backend request authentication", () => {
  test("authenticates a registered interface window's main frame", () => {
    const registry = createBackendAuthWindowRegistry()
    const window = new EventEmitter()
    registry.register(window)

    expect(shouldInjectBackendAuth({ ...appRequest, isAppWindow: registry.has(window) })).toBe(true)
  })

  test.each(["popup", "PDF export", "loading", "sign-in"])(
    "withholds backend credentials from an unregistered %s window",
    () => {
      const registry = createBackendAuthWindowRegistry()
      registry.register(new EventEmitter())
      const unregistered = new EventEmitter()

      expect(shouldInjectBackendAuth({ ...appRequest, isAppWindow: registry.has(unregistered) })).toBe(false)
    },
  )

  test("removes a closed window without removing another interface window", () => {
    const registry = createBackendAuthWindowRegistry()
    const closed = new EventEmitter()
    const remaining = new EventEmitter()
    registry.register(closed)
    registry.register(remaining)
    expect(registry.has(closed)).toBe(true)

    closed.emit("closed")

    expect(shouldInjectBackendAuth({ ...appRequest, isAppWindow: registry.has(closed) })).toBe(false)
    expect(shouldInjectBackendAuth({ ...appRequest, isAppWindow: registry.has(remaining) })).toBe(true)
  })

  test.each(["image", "xhr", "mainFrame"])(
    "authenticates %s requests from the app window's main frame",
    (resourceType) => {
      expect(shouldInjectBackendAuth({ ...appRequest, resourceType })).toBe(true)
    },
  )

  test.each([
    { context: "a child frame", isAppWindow: true, isMainFrame: false, resourceType: "image" },
    {
      context: "a subFrame request from the app window's main frame",
      isAppWindow: true,
      isMainFrame: true,
      resourceType: "subFrame",
    },
    { context: "webview contents", isAppWindow: false, isMainFrame: true, resourceType: "image" },
    { context: "missing webContents", isAppWindow: false, isMainFrame: false, resourceType: "image" },
    { context: "a missing frame", isAppWindow: true, isMainFrame: false, resourceType: "image" },
    { context: "a destroyed frame", isAppWindow: true, isMainFrame: false, resourceType: "image" },
    {
      context: "a mainFrame request outside an app window",
      isAppWindow: false,
      isMainFrame: true,
      resourceType: "mainFrame",
    },
    {
      context: "a mainFrame request without the app window's main frame",
      isAppWindow: true,
      isMainFrame: false,
      resourceType: "mainFrame",
    },
  ])("withholds backend credentials from $context", ({ isAppWindow, isMainFrame, resourceType }) => {
    expect(shouldInjectBackendAuth({ ...appRequest, isAppWindow, isMainFrame, resourceType })).toBe(false)
  })

  test("withholds backend credentials from other origins", () => {
    expect(
      shouldInjectBackendAuth({ ...appRequest, requestUrl: "http://example.com/image.png" }),
    ).toBe(false)
  })

  test.each(["Authorization", "authorization", "AUTHORIZATION"])(
    "preserves an existing %s header",
    (header) => {
      const requestHeaders = { [header]: "Bearer existing" }
      expect(shouldInjectBackendAuth({ ...appRequest, requestHeaders })).toBe(false)
      expect(requestHeaders).toEqual({ [header]: "Bearer existing" })
    },
  )
})
