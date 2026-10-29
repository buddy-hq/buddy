import { describe, expect, test } from "bun:test"
import {
  buildAssistantErrorModel,
  buildRetryStateModel,
  resolveLatestTerminalAssistantError,
  retryStage,
} from "../src/state/chat-error-model"
import { parseSessionMessagesPayload } from "../src/state/session-messages"
import { normalizeSessionStatusValue, sessionStatusEquals } from "../src/state/session-status"
import type { MessageError, SessionStatusInfo } from "../src/state/chat-types"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createProviderInfo,
  createUserMessageInfo,
} from "./test-utils"

type RetryStatus = Extract<SessionStatusInfo, { type: "retry" }>

function retryStatus(attempt: number): RetryStatus {
  return {
    type: "retry",
    attempt,
    message: "Provider is busy",
    next: 1_000,
  }
}

describe("retry state model", () => {
  test("uses attempt-only stages and promotes structured actions immediately", () => {
    expect(retryStage(retryStatus(1))).toBe("quiet")
    expect(retryStage(retryStatus(2))).toBe("quiet")
    expect(retryStage(retryStatus(3))).toBe("notice")
    expect(retryStage(retryStatus(5))).toBe("persistent")
    expect(
      retryStage({
        ...retryStatus(1),
        action: {
          reason: "free-usage-limit",
          provider: "opencode",
          title: "Usage limit reached",
          message: "Choose another model to continue.",
          label: "View limits",
          link: "https://example.test/limits",
        },
      }),
    ).toBe("actionable")
  })

  test("classifies retry messages without exposing classification as certainty", () => {
    expect(
      buildRetryStateModel({
        type: "retry",
        attempt: 3,
        message: "Provider rate limit exceeded",
        next: 1_000,
      }).category,
    ).toBe("rate-limit")
    expect(
      buildRetryStateModel({
        type: "retry",
        attempt: 3,
        message: "Connection reset by peer",
        next: 1_000,
      }).category,
    ).toBe("network")
    expect(
      buildRetryStateModel({
        type: "retry",
        attempt: 3,
        message: "Unrecognized provider response",
        next: 1_000,
      }).category,
    ).toBe("unknown")
  })
})

describe("assistant error model", () => {
  test("treats output length as a caveat only when visible text exists", () => {
    const value: MessageError = { name: "MessageOutputLengthError", code: "output_limit" }
    expect(buildAssistantErrorModel(value, { hasVisibleText: true }).disposition).toBe("caveat")
    expect(buildAssistantErrorModel(value, { hasVisibleText: false }).disposition).toBe("terminal")
  })

  test("classifies OpenAI subscription exhaustion with the transcript's limit details", () => {
    const user = createMessageWithParts(
      createUserMessageInfo({ id: "msg_user", sessionID: "ses_limit" }),
    )
    const failed = createMessageWithParts(
      createAssistantMessageInfo({
        id: "msg_assistant",
        sessionID: "ses_limit",
        parentID: user.info.id,
        providerID: "openai",
        error: {
          name: "APIError",
          message: "The usage limit has been reached",
          code: "quota_exceeded",
          limit: { plan: "plus", resetsAt: 1_787_087_426, resetsInSeconds: 0 },
          data: {
            message: "The usage limit has been reached",
            statusCode: 429,
            isRetryable: false,
            responseBody: JSON.stringify({
              error: {
                type: "usage_limit_reached",
                message: "The usage limit has been reached",
              },
            }),
          },
        },
      }),
    )

    expect(
      resolveLatestTerminalAssistantError(parseSessionMessagesPayload([user, failed]))?.model,
    ).toMatchObject({
      category: "usage-limit",
      disposition: "terminal",
      details: { limit: { plan: "plus", resetsAt: 1_787_087_426, resetsInSeconds: 0 } },
    })
  })

  test("resolves only a terminal error belonging to the latest user turn", () => {
    const user = createMessageWithParts(
      createUserMessageInfo({ id: "msg_user", sessionID: "ses_error" }),
    )
    const failed = createMessageWithParts(
      createAssistantMessageInfo({
        id: "msg_assistant",
        sessionID: "ses_error",
        parentID: user.info.id,
        error: {
          name: "APIError",
          code: "temporarily_unavailable",
          data: { statusCode: 503, message: "Overloaded" },
        },
      }),
    )

    expect(resolveLatestTerminalAssistantError([user, failed])).toMatchObject({
      assistantMessageID: "msg_assistant",
      userMessageID: "msg_user",
      providerID: "test",
      modelID: "test-model",
      model: { category: "temporarily-unavailable", disposition: "terminal" },
    })

    const nextUser = createMessageWithParts(
      createUserMessageInfo({ id: "msg_user_2", sessionID: "ses_error" }),
    )
    expect(resolveLatestTerminalAssistantError([user, failed, nextUser])).toBeUndefined()

    const recovered = createMessageWithParts(
      createAssistantMessageInfo({
        id: "msg_assistant_2",
        sessionID: "ses_error",
        parentID: user.info.id,
      }),
    )
    expect(resolveLatestTerminalAssistantError([user, failed, recovered])).toBeUndefined()
  })

  test("uses the anonymous code only while the bundled provider is disconnected", () => {
    const user = createMessageWithParts(
      createUserMessageInfo({ id: "msg_user", sessionID: "ses_free_error" }),
    )
    const failed = createMessageWithParts(
      createAssistantMessageInfo({
        id: "msg_assistant",
        sessionID: "ses_free_error",
        parentID: user.info.id,
        providerID: "hosted",
        modelID: "free-model",
        error: {
          name: "APIError",
          code: "auth",
          anonymousCode: "temporarily_unavailable",
          data: { message: "Request failed", statusCode: 401 },
        },
      }),
    )
    const messages = parseSessionMessagesPayload([user, failed])
    const categoryWhen = (connected: boolean) =>
      resolveLatestTerminalAssistantError(messages, [
        createProviderInfo({ id: "hosted", bundled: true, connected }),
      ])?.model.category

    expect(categoryWhen(false)).toBe("temporarily-unavailable")
    expect(categoryWhen(true)).toBe("auth")
  })
})

describe("retry status normalization", () => {
  test("preserves a complete structured retry action", () => {
    const normalized = normalizeSessionStatusValue({
      type: "retry",
      attempt: 1,
      message: "limit",
      next: 10,
      action: {
        reason: "free-usage-limit",
        provider: "opencode",
        title: "Usage limit reached",
        message: "Choose another model.",
        label: "View limits",
        link: "https://example.test/limits",
      },
    })

    expect(normalized).toMatchObject({
      type: "retry",
      action: {
        reason: "free-usage-limit",
        provider: "opencode",
        title: "Usage limit reached",
        message: "Choose another model.",
        label: "View limits",
        link: "https://example.test/limits",
      },
    })
  })

  test("drops incomplete actions and compares action changes", () => {
    const withoutAction = normalizeSessionStatusValue({
      type: "retry",
      attempt: 1,
      message: "limit",
      next: 10,
      action: { title: "Missing required fields" },
    })
    expect(withoutAction).toEqual({ type: "retry", attempt: 1, message: "limit", next: 10 })

    const left: RetryStatus = {
      type: "retry",
      attempt: 1,
      message: "limit",
      next: 10,
      action: {
        reason: "limit",
        provider: "opencode",
        title: "Limit",
        message: "Wait",
        label: "View",
      },
    }
    const right: RetryStatus = {
      ...left,
      action: left.action ? { ...left.action, label: "Open" } : undefined,
    }
    expect(sessionStatusEquals(left, right)).toBe(false)
  })
})
