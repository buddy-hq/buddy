import { describe, expect, test } from "bun:test"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { isAppDeepLink } from "../src/main/deep-link"

describe.each([
  {
    productName: "Buddy",
    distribution: BUDDY_DISTRIBUTIONS.prod,
    acceptedSchemes: ["buddy", "BUDDY", "BuDdY"],
    rejectedSchemes: ["buddy-beta", "BUDDY-BETA", "BuDdY-BeTa"],
  },
  {
    productName: "Buddy Beta",
    distribution: BUDDY_DISTRIBUTIONS.beta,
    acceptedSchemes: ["buddy-beta", "BUDDY-BETA", "BuDdY-BeTa"],
    rejectedSchemes: ["buddy", "BUDDY", "BuDdY"],
  },
])("$productName deep links", ({ distribution, acceptedSchemes, rejectedSchemes }) => {
  test.each([...acceptedSchemes])("accepts the %s scheme", (scheme) => {
    expect(isAppDeepLink(`${scheme}://chat/ses_1?message=msg_1`, distribution.protocol)).toBe(true)
  })

  test.each([...rejectedSchemes])("rejects the other distribution's %s scheme", (scheme) => {
    expect(isAppDeepLink(`${scheme}://chat/ses_1?message=msg_1`, distribution.protocol)).toBe(false)
  })

  test.each([
    "/Applications/Buddy.app",
    "--some-flag",
    "https://example.com",
    "buddy-beta-bad://chat/ses_1",
  ])("ignores an argv value or unrelated URL: %s", (value) => {
    expect(isAppDeepLink(value, distribution.protocol)).toBe(false)
  })
})
