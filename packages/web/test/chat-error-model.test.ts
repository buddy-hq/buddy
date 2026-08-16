import { describe, expect, test } from "bun:test"
import {
  buildAssistantErrorModel,
  buildRetryStateModel,
  resolveLatestTerminalAssistantError,
  retryStage,
  type AssistantErrorCategory,
} from "../src/state/chat-error-model"
import { normalizeSessionStatusValue, sessionStatusEquals } from "../src/state/session-status"
import type { MessageError, SessionStatusInfo, TMessageErrorData } from "../src/state/chat-types"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createProviderInfo,
  createUserMessageInfo,
} from "./test-utils"

type RetryStatus = Extract<SessionStatusInfo, { type: "retry" }>

function error(name: string, data: TMessageErrorData = {}): MessageError {
  return { name, data }
}

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
  test("classifies every runtime error discriminant", () => {
    const cases: Array<[MessageError, AssistantErrorCategory]> = [
      [error("ProviderAuthError"), "auth"],
      [error("UnknownError"), "unknown"],
      [error("MessageOutputLengthError"), "output-length"],
      [error("MessageAbortedError"), "stopped"],
      [error("StructuredOutputError"), "format"],
      [error("ContextOverflowError"), "context"],
      [error("ContentFilterError"), "content"],
      [error("APIError", { statusCode: 429 }), "rate-limit"],
    ]

    for (const [value, category] of cases) {
      expect(buildAssistantErrorModel(value, { hasVisibleText: false }).category).toBe(category)
    }
  })

  test("treats output length as a caveat only when visible text exists", () => {
    const value = error("MessageOutputLengthError")
    expect(buildAssistantErrorModel(value, { hasVisibleText: true }).disposition).toBe("caveat")
    expect(buildAssistantErrorModel(value, { hasVisibleText: false }).disposition).toBe("terminal")
  })

  test("uses structured provider errors before HTTP status fallbacks", () => {
    expect(
      buildAssistantErrorModel(error("APIError", { statusCode: 401 }), {
        hasVisibleText: false,
      }).category,
    ).toBe("auth")
    expect(
      buildAssistantErrorModel(error("APIError", { statusCode: 503 }), {
        hasVisibleText: false,
      }).category,
    ).toBe("temporarily-unavailable")
    expect(
      buildAssistantErrorModel(error("APIError", { statusCode: 402 }), {
        hasVisibleText: false,
      }).category,
    ).toBe("usage-limit")
    expect(
      buildAssistantErrorModel(error("APIError", { statusCode: 403 }), {
        hasVisibleText: false,
      }).category,
    ).toBe("auth")
    expect(
      buildAssistantErrorModel(
        error("APIError", { statusCode: 403, message: "Permission denied" }),
        {
          hasVisibleText: false,
        },
      ).category,
    ).toBe("access-restricted")
    expect(
      buildAssistantErrorModel(
        error("APIError", {
          statusCode: 503,
          message: "Upstream connection timed out",
        }),
        { hasVisibleText: false },
      ).category,
    ).toBe("temporarily-unavailable")
    expect(
      buildAssistantErrorModel(error("APIError", { message: "socket connection reset" }), {
        hasVisibleText: false,
      }).category,
    ).toBe("network")
  })

  test("classifies OpenAI subscription exhaustion as a usage limit", () => {
    const model = buildAssistantErrorModel(
      error("APIError", {
        statusCode: 429,
        isRetryable: false,
        message: "The usage limit has been reached",
        responseBody: JSON.stringify({
          error: {
            type: "usage_limit_reached",
            message: "The usage limit has been reached",
          },
        }),
      }),
      { hasVisibleText: false, providerID: "openai" },
    )

    expect(model).toMatchObject({
      category: "usage-limit",
      disposition: "terminal",
      details: {
        providerError: {
          type: "usage_limit_reached",
          message: "The usage limit has been reached",
        },
      },
    })
  })

  test("classifies Zen errors without trusting their overloaded HTTP status", () => {
    function zenError(type: string, message: string) {
      return error("APIError", {
        statusCode: type === "RegionError" ? 403 : 401,
        isRetryable: false,
        responseBody: JSON.stringify({
          type: "error",
          error: { type, message },
        }),
      })
    }

    const anonymousContext = {
      hasVisibleText: false,
      providerID: "opencode",
      providerConnected: false,
    }

    expect(
      buildAssistantErrorModel(zenError("ModelError", "No provider available"), anonymousContext),
    ).toMatchObject({
      category: "temporarily-unavailable",
      details: {
        providerError: {
          type: "ModelError",
          message: "No provider available",
        },
      },
    })
    expect(
      buildAssistantErrorModel(zenError("CreditsError", "Insufficient balance"), anonymousContext)
        .category,
    ).toBe("usage-limit")
    expect(
      buildAssistantErrorModel(zenError("ModelError", "Model is disabled"), anonymousContext)
        .category,
    ).toBe("model-unavailable")
    expect(
      buildAssistantErrorModel(
        zenError("RegionError", "This model is not available in your region"),
        anonymousContext,
      ).category,
    ).toBe("access-restricted")
    expect(
      buildAssistantErrorModel(zenError("AuthError", "Invalid API key"), anonymousContext).category,
    ).toBe("model-unavailable")
    expect(
      buildAssistantErrorModel(zenError("AuthError", "Invalid API key"), {
        ...anonymousContext,
        providerConnected: true,
      }).category,
    ).toBe("auth")
    expect(
      buildAssistantErrorModel(zenError("AuthError", "Model alpha-x is not supported"), {
        ...anonymousContext,
        providerConnected: true,
      }).category,
    ).toBe("model-unavailable")
  })

  test("never turns an anonymous free-model auth status into a reconnect error", () => {
    const input = {
      hasVisibleText: false,
      providerID: "opencode",
      providerConnected: false,
    }

    expect(buildAssistantErrorModel(error("APIError", { statusCode: 401 }), input).category).toBe(
      "temporarily-unavailable",
    )
    expect(buildAssistantErrorModel(error("ProviderAuthError"), input).category).toBe(
      "model-unavailable",
    )
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
        error: error("APIError", { statusCode: 503, message: "Overloaded" }),
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

  test("uses current provider access only to guard recovery presentation", () => {
    const user = createMessageWithParts(
      createUserMessageInfo({ id: "msg_user", sessionID: "ses_free_error" }),
    )
    const failed = createMessageWithParts(
      createAssistantMessageInfo({
        id: "msg_assistant",
        sessionID: "ses_free_error",
        parentID: user.info.id,
        providerID: "opencode",
        modelID: "mimo-v2.5-free",
        error: error("APIError", { statusCode: 401 }),
      }),
    )

    expect(
      resolveLatestTerminalAssistantError(
        [user, failed],
        [createProviderInfo({ id: "opencode", connected: false })],
      ),
    ).toMatchObject({
      providerID: "opencode",
      modelID: "mimo-v2.5-free",
      model: { category: "temporarily-unavailable" },
    })
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
