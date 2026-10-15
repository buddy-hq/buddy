import { describe, expect, test } from "bun:test"
import { readChatMessageLink, withoutBuddyMarkdownLinks } from "./chat-links"

const schemes = ["buddy", "buddy-beta", "BuDdY", "BuDdY-BeTa", "BUDDY", "BUDDY-BETA"]

describe("Buddy chat links", () => {
  test.each(schemes)("parses %s links regardless of scheme case", (scheme) => {
    expect(readChatMessageLink(`${scheme}://chat/ses_1?message=msg_1`)).toEqual({
      sessionID: "ses_1",
      messageID: "msg_1",
    })
  })

  test.each(schemes)("strips %s Markdown links regardless of scheme case", (scheme) => {
    expect(
      withoutBuddyMarkdownLinks(`body [Open message](${scheme}://chat/ses_1?message=msg_1)`),
    ).toBe("body ")
  })

  test.each(["buddyx", "buddy-betax"])("preserves lookalike %s Markdown links", (scheme) => {
    const markdown = `body [Open message](${scheme}://chat/ses_1?message=msg_1)`
    expect(withoutBuddyMarkdownLinks(markdown)).toBe(markdown)
  })

  test.each(["buddy", "buddy-beta"])("preserves %s Markdown links without //", (scheme) => {
    const markdown = `body [Open message](${scheme}:/chat/ses_1?message=msg_1)`
    expect(withoutBuddyMarkdownLinks(markdown)).toBe(markdown)
  })
})
