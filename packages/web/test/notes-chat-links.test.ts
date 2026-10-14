import { expect, test } from "bun:test"
import { readChatMessageLink } from "@buddy/citation-contract/chat-links"

test.each(["buddy", "buddy-beta"])(
  "reads %s note links for in-app message navigation",
  (scheme) => {
    expect(readChatMessageLink(`${scheme}://chat/ses%20one?message=msg%2Ftwo`)).toEqual({
      sessionID: "ses one",
      messageID: "msg/two",
    })
  },
)

test.each([
  "https://chat/ses_1?message=msg_1",
  "buddy-beta-other://chat/ses_1?message=msg_1",
  "buddy-beta://auth/callback",
  "buddy://chat/ses_1",
  "buddy://chat/%ZZ?message=msg_1",
])("does not navigate an invalid note source %s", (href) => {
  expect(readChatMessageLink(href)).toBeUndefined()
})
