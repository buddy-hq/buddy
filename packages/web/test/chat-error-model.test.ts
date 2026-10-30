import { describe, expect, test } from "bun:test"
import {
  buildAssistantErrorModel,
  buildRetryStateModel,
  resolveDockedTerminalAssistantError,
  resolveLatestTerminalAssistantError,
  retryStage,
} from "../src/state/chat-error-model"
import { parseSessionMessagesPayload } from "../src/state/session-messages"
import { normalizeSessionStatusValue, sessionStatusEquals } from "../src/state/session-status"
import type { MessageError, SessionStatusInfo } from "../src/state/chat-types"
import type { OpenAIUsageSnapshot } from "../src/state/openai-usage-query"
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
  test.each([
    { type: "provider.rate-limit", status: 429, category: "rate-limit" },
    { type: "provider.quota", status: 429, category: "rate-limit" },
    { type: "provider.internal", status: 503, category: "overloaded" },
    { type: "provider.transport", status: undefined, category: "network" },
    { type: "APIError", status: 503, category: "overloaded" },
  ])("classifies normalized $type retries with neutral text", ({ type, status, category }) => {
    const normalized = normalizeSessionStatusValue({
      ...retryStatus(3),
      message: "Request failed",
      error: { type, status },
    })
    if (normalized.type !== "retry") throw new Error("Expected retry status")
    expect(buildRetryStateModel(normalized).category).toBe(category)
    expect(normalized.error).toEqual({ type, status })
  })

  test.each([
    { type: "provider.internal", status: 429, category: "overloaded" },
    { type: "provider.auth", status: 401, category: "unknown" },
    { type: "APIError", status: 503, category: "overloaded" },
    { type: "APIError", status: 401, category: "unknown" },
  ])("keeps $type/$status ahead of rate limit text", ({ type, status, category }) => {
    expect(buildRetryStateModel({
      ...retryStatus(3),
      message: "Provider rate limit exceeded",
      error: { type, status },
    }).category).toBe(category)
  })

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

const NOW = Date.parse("2026-10-02T12:00:00.000Z")
const RESET = Date.parse("2026-10-02T13:00:00.000Z")

function limitTranscript(providerID: string, limit?: MessageError["limit"]) {
  const user = createMessageWithParts(createUserMessageInfo({ id: "msg_limit_user", sessionID: "ses_limit_banner" }))
  const assistant = createMessageWithParts(createAssistantMessageInfo({
    id: "msg_limit",
    sessionID: "ses_limit_banner",
    parentID: user.info.id,
    providerID,
    error: { name: "provider.quota", code: "quota_exceeded", limit },
  }))
  return [user, assistant]
}

function successfulTurn(providerID: string) {
  const user = createMessageWithParts(createUserMessageInfo({ id: "msg_success_user", sessionID: "ses_limit_banner" }))
  return [user, createMessageWithParts(createAssistantMessageInfo({
    id: "msg_success",
    sessionID: "ses_limit_banner",
    parentID: user.info.id,
    providerID,
  }))]
}

function planUsage(usedPercent: number): Extract<OpenAIUsageSnapshot, { status: "ready" }> {
  return {
    status: "ready",
    plan: "plus",
    rateLimit: {
      primary: { usedPercent, resetsAt: "2026-10-02T13:00:00.000Z", windowSeconds: 18_000 },
      secondary: null,
    },
    additionalRateLimits: [],
    credits: null,
    fetchedAt: "2026-10-02T12:00:00.000Z",
  }
}

describe("docked limit banner", () => {
  test("hides on another provider and reappears on the still-limited provider", () => {
    const messages = limitTranscript("openai")
    const input = { providers: [], usage: planUsage(100), now: NOW }
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, selectedProviderID: "openai",
    })).toMatchObject({ assistantMessageID: "msg_limit", expiresAt: RESET })
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, selectedProviderID: "anthropic",
    })).toBeUndefined()
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, selectedProviderID: "openai",
    })?.assistantMessageID).toBe("msg_limit")
  })

  test("finds the selected provider's limit past a successful turn on another provider", () => {
    const messages = [
      ...limitTranscript("anthropic", { resetsAt: RESET / 1_000 }),
      ...successfulTurn("openai"),
    ]
    expect(resolveLatestTerminalAssistantError(messages)).toBeUndefined()
    expect(resolveDockedTerminalAssistantError(messages, {
      providers: [], selectedProviderID: "anthropic", usage: undefined, now: NOW,
    })).toMatchObject({ assistantMessageID: "msg_limit", expiresAt: RESET })
  })

  test("follows live ChatGPT account usage across account switches and successful turns", () => {
    const messages = [
      ...limitTranscript("openai", { resetsAt: RESET / 1_000 }),
      ...successfulTurn("anthropic"),
    ]
    const input = { providers: [], selectedProviderID: "openai", now: NOW }
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, usage: planUsage(100),
    })?.assistantMessageID).toBe("msg_limit")
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, usage: planUsage(20),
    })).toBeUndefined()
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, usage: planUsage(100),
    })?.assistantMessageID).toBe("msg_limit")
  })

  test("finds a selected provider's active limit past another provider's terminal error", () => {
    const user = createMessageWithParts(createUserMessageInfo({
      id: "msg_auth_user", sessionID: "ses_limit_banner",
    }))
    const failed = createMessageWithParts(createAssistantMessageInfo({
      id: "msg_auth", sessionID: "ses_limit_banner", parentID: user.info.id,
      providerID: "anthropic", error: { name: "provider.auth", code: "auth" },
    }))
    const messages = [...limitTranscript("openai"), user, failed]
    const input = { providers: [], selectedProviderID: "openai", now: NOW }
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, usage: planUsage(100),
    })?.assistantMessageID).toBe("msg_limit")
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, usage: planUsage(20),
    })?.assistantMessageID).toBe("msg_auth")
  })

  test.each([
    undefined,
    { status: "error" } as const,
    { status: "not_connected" } as const,
    { status: "reconnect_required" } as const,
  ])("falls back to the error reset while usage is %j", (usage) => {
    const messages = [
      ...limitTranscript("openai", { resetsAt: RESET / 1_000 }),
      ...successfulTurn("anthropic"),
    ]
    const input = { providers: [], selectedProviderID: "openai", usage }
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, now: NOW,
    })).toMatchObject({ assistantMessageID: "msg_limit", expiresAt: RESET })
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, now: RESET,
    })).toBeUndefined()
  })

  test("shows a limit with no reset only while it is the latest terminal error", () => {
    const messages = limitTranscript("anthropic")
    const input = { providers: [], selectedProviderID: "anthropic", usage: undefined, now: NOW }
    expect(resolveDockedTerminalAssistantError(messages, input)?.assistantMessageID).toBe("msg_limit")
    expect(resolveDockedTerminalAssistantError([
      ...messages, ...successfulTurn("openai"),
    ], input)).toBeUndefined()
  })

  test("uses a live secondary window and stops when its last exhausted window resets", () => {
    const usage = planUsage(20)
    const liveUsage = {
      ...usage,
      rateLimit: {
        ...usage.rateLimit,
        secondary: { usedPercent: 100, resetsAt: "2026-10-02T13:00:00.000Z", windowSeconds: 604_800 },
      },
    }
    const messages = limitTranscript("openai", { resetsAt: RESET / 1_000 + 86_400 })
    const input = { providers: [], selectedProviderID: "openai", usage: liveUsage }
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, now: NOW,
    })).toMatchObject({ assistantMessageID: "msg_limit", expiresAt: RESET })
    expect(resolveDockedTerminalAssistantError(messages, {
      ...input, now: RESET,
    })).toBeUndefined()
  })
})

describe("retry status normalization", () => {
  test("detects structured retry changes even when text and timing stay the same", () => {
    const left: RetryStatus = { ...retryStatus(3), error: { type: "provider.rate-limit", status: 429 } }
    expect(sessionStatusEquals(left, {
      ...left, error: { type: "provider.internal", status: 429 },
    })).toBe(false)
    expect(sessionStatusEquals(left, {
      ...left, error: { type: "provider.rate-limit", status: 503 },
    })).toBe(false)
  })

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
