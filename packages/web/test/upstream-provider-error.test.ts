import { describe, expect, test } from "bun:test"
import { formatMessageError } from "../src/components/chat/utils/error"
import { t } from "../src/i18n"
import { readSessionErrorMessage } from "../src/lib/directory-chat/chat-prompt-helpers"
import { readUpstreamProviderErrorPayload } from "../src/lib/upstream-provider-error"
import { normalizeSessionStatusValue } from "../src/state/session-status"

const RAW_ZEN_IP_LIMIT_MESSAGE =
  "Failed query: select `interval`, `count` from `ip_rate_limit` where (`ip_rate_limit`.`ip` = ? and `ip_rate_limit`.`interval` in (?))"
const GENERIC_PROVIDER_ERROR_MESSAGE = "Provider returned error"

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
      message: t("errors.provider.zenNetworkRateLimit"),
      next: 1_234,
    })
  })

  test("normalizes Zen ip rate-limit assistant errors", () => {
    expect(
      formatMessageError({
        message: `500 Internal Server Error: {"type":"error","error":{"type":"error","message":"${RAW_ZEN_IP_LIMIT_MESSAGE}"}}`,
      }),
    ).toBe(t("errors.provider.zenNetworkRateLimit"))
  })

  test("normalizes generic provider assistant errors", () => {
    expect(
      formatMessageError({
        data: {
          message: GENERIC_PROVIDER_ERROR_MESSAGE,
        },
      }),
    ).toBe(t("errors.provider.genericStreamFailure"))
  })

  test("unwraps provider response body for generic assistant errors", () => {
    expect(
      formatMessageError({
        data: {
          message: GENERIC_PROVIDER_ERROR_MESSAGE,
          responseBody: JSON.stringify({
            type: "error",
            error: {
              message: "Temporary upstream capacity failure",
            },
          }),
        },
      }),
    ).toBe("Temporary upstream capacity failure")
  })

  test("preserves structured provider error evidence for classification", () => {
    expect(
      readUpstreamProviderErrorPayload(
        JSON.stringify({
          type: "error",
          error: {
            type: "ModelError",
            code: "no_provider_available",
            message: "No provider available",
          },
        }),
      ),
    ).toEqual({
      type: "ModelError",
      code: "no_provider_available",
      message: "No provider available",
    })
  })

  test("preserves OpenAI subscription reset metadata", () => {
    expect(
      readUpstreamProviderErrorPayload(
        JSON.stringify({
          error: {
            type: "usage_limit_reached",
            message: "The usage limit has been reached",
            plan_type: "plus",
            resets_at: 1_787_087_426,
            eligible_promo: null,
            resets_in_seconds: 539_958,
          },
        }),
      ),
    ).toEqual({
      type: "usage_limit_reached",
      message: "The usage limit has been reached",
      planType: "plus",
      resetsAt: 1_787_087_426,
      resetsInSeconds: 539_958,
    })
  })

  test("handles malformed and top-level response bodies", () => {
    expect(readUpstreamProviderErrorPayload("<html>gateway error</html>")).toBeUndefined()
    expect(readUpstreamProviderErrorPayload(JSON.stringify({ type: "error" }))).toEqual({
      type: "error",
    })
  })

  test("normalizes generic provider session errors", () => {
    expect(
      readSessionErrorMessage({
        data: {
          message: GENERIC_PROVIDER_ERROR_MESSAGE,
        },
      }),
    ).toBe(t("errors.provider.genericStreamFailure"))
  })
})
