import { afterEach, describe, expect, test } from "bun:test"
import { readChatMessageLink } from "@buddy/citation-contract/chat-links"
import { notePlainText, renderSessionNoteEntry } from "../../src/notes/presentation"

const originalChannel = process.env.BUDDY_CHANNEL
afterEach(() => {
  if (originalChannel === undefined) delete process.env.BUDDY_CHANNEL
  else process.env.BUDDY_CHANNEL = originalChannel
})

function entry() {
  return renderSessionNoteEntry({ text: "My note", imageLinks: [], capturedAt: new Date(2026, 9, 14, 10, 30), source: { sessionID: "ses 1", messageID: "msg/1", text: "Hello" } })
}

describe("note chat-link distribution", () => {
  test("keeps prod quote output byte-identical and emits only the Beta scheme in Beta", () => {
    delete process.env.BUDDY_CHANNEL
    const prod = entry()
    expect(prod.content).toBe("**October 14, 2026**\n\n*10:30*\n\n> [!quote]- Hello\n> Hello\n>\n> [Open message](buddy://chat/ses%201?message=msg%2F1)\n\nMy note")
    process.env.BUDDY_CHANNEL = "beta"
    expect(entry().content).toBe(prod.content.replace("buddy://", "buddy-beta://"))
  })

  test.each(["buddy", "buddy-beta"])("recognizes %s quotes and keeps application links out of excerpts", (scheme) => {
    expect(readChatMessageLink(`${scheme}://chat/ses%201?message=msg%2F1`)).toEqual({ sessionID: "ses 1", messageID: "msg/1" })
    expect(notePlainText(`Hello [Open message](${scheme}://chat/ses_1?message=msg_1)`)).toBe("Hello")
  })
})
