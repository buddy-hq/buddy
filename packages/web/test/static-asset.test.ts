import { afterEach, describe, expect, test } from "bun:test"
import { resolveBuddyIconUrl } from "../src/lib/static-asset"

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
const originalLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location")

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor)
  }

  if (originalLocationDescriptor) {
    Object.defineProperty(globalThis, "location", originalLocationDescriptor)
  }
})

describe("static assets", () => {
  test("uses the public Buddy icon asset for file renderers", () => {
    const location = {
      protocol: "file:",
      href: "file:///Applications/Buddy/index.html",
    }
    const buddyWindow = {
      __BUDDY__: {
        iconUrl: "file:///Applications/Buddy/icon.png",
        assetBaseUrl: "file:///Applications/Buddy/",
      },
      location,
    }

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: buddyWindow,
    })
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      writable: true,
      value: location,
    })

    expect(resolveBuddyIconUrl()).toBe("file:///Applications/Buddy/buddy-icon.png")
  })

  test("falls back to the public Buddy icon asset for http renderers", () => {
    const location = {
      protocol: "http:",
      href: "http://localhost:5173/chat",
    }
    const buddyWindow = {
      __BUDDY__: {
        iconUrl: "file:///Applications/Buddy/icon.png",
        assetBaseUrl: "http://localhost:5173/",
      },
      location,
    }

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: buddyWindow,
    })
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      writable: true,
      value: location,
    })

    expect(resolveBuddyIconUrl()).toBe("http://localhost:5173/buddy-icon.png")
  })
})
