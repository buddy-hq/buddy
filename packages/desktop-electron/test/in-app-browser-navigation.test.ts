import { describe, expect, test } from "bun:test"
import { guardInAppBrowserNavigation } from "../src/main/in-app-browser-navigation"

describe("in-app Browser navigation guard", () => {
  test("allows HTTP and HTTPS navigation without intervention", () => {
    let prevented = false
    let blockedNotice = false

    expect(
      guardInAppBrowserNavigation({
        event: {
          preventDefault() {
            prevented = true
          },
        },
        url: "https://hibuddy.in/redirected",
        onBlocked() {
          blockedNotice = true
        },
      }),
    ).toBe(true)
    expect(prevented).toBe(false)
    expect(blockedNotice).toBe(false)
  })

  test.each(["mailto:hello@hibuddy.in", "file:///Users/example/secret.txt"])(
    "blocks a redirect to %s",
    (url) => {
      let prevented = false
      let blockedNotice = false

      expect(
        guardInAppBrowserNavigation({
          event: {
            preventDefault() {
              prevented = true
            },
          },
          url,
          onBlocked() {
            blockedNotice = true
          },
        }),
      ).toBe(false)
      expect(prevented).toBe(true)
      expect(blockedNotice).toBe(true)
    },
  )
})
