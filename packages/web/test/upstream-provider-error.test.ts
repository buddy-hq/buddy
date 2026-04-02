import { describe, expect, test } from "bun:test"
import { formatMessageError } from "../src/components/chat/utils/error"
import { normalizeSessionStatusValue } from "../src/state/session-status"

const RAW_ZEN_IP_LIMIT_MESSAGE =
  "Failed query: select `interval`, `count` from `ip_rate_limit` where (`ip_rate_limit`.`ip` = ? and `ip_rate_limit`.`interval` in (?))"
const FRIENDLY_ZEN_IP_LIMIT_MESSAGE =
  "OpenCode Zen temporarily rate limited this network for the selected free model. Try again later, switch networks, or use another model."

describe("upstream provider error normalization", () => {
  test("normalizes Zen ip rate-limit retry messages", () => {
    expect(
      normalizeSessionStatusValue({
        type: "retry",
        attempt: 2,
        message: RAW_ZEN_IP_LIMIT_MESSAGE,
        next: 1_234,
      }),
    ).toEqual({
      type: "retry",
      attempt: 2,
      message: FRIENDLY_ZEN_IP_LIMIT_MESSAGE,
      next: 1_234,
    })
  })

  test("normalizes Zen ip rate-limit assistant errors", () => {
    expect(
      formatMessageError({
        message: `500 Internal Server Error: {"type":"error","error":{"type":"error","message":"${RAW_ZEN_IP_LIMIT_MESSAGE}"}}`,
      }),
    ).toBe(FRIENDLY_ZEN_IP_LIMIT_MESSAGE)
  })
})
