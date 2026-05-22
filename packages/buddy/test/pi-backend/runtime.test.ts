import { afterEach, describe, expect, test } from "bun:test"
import { PiRuntime } from "../../src/pi-backend/runtime"
import { buddySessionIDFromPi } from "../../src/pi-backend/session-ids"

const TEST_DIRECTORY = "/tmp/buddy-pi-runtime-test"
const PI_SESSION_ID = "pi-session"
const BUDDY_SESSION_ID = buddySessionIDFromPi(PI_SESSION_ID)
const ACTIVE_SESSION_KEY_SEPARATOR = "\u001e"

function fauxTitleModels() {
  return [
    {
      id: "gpt-5",
      name: "GPT-5",
      reasoning: true,
      input: ["text" as const],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    },
    {
      id: "gpt-5-mini",
      name: "GPT-5 Mini",
      reasoning: true,
      input: ["text" as const],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    },
  ]
}

afterEach(() => {
  new PiRuntime().getModelRegistry().unregisterProvider("faux-title-provider")
})

describe("PiRuntime promptAsync", () => {
  test("publishes idle when the async turn settles without a bridge agent_end event", async () => {
    const runtime = new PiRuntime()
    const bridgeEvents: string[] = []
    let sendCustomMessageCalls = 0

    const active = {
      directory: TEST_DIRECTORY,
      defaultToolNames: [] as string[],
      session: {
        sessionId: PI_SESSION_ID,
        isStreaming: false,
        async sendCustomMessage() {
          sendCustomMessageCalls += 1
        },
      },
      bridge: {
        handle(event: { type: string }) {
          bridgeEvents.push(`handle:${event.type}`)
        },
        publishError() {
          bridgeEvents.push("error")
        },
        publishIdle() {
          bridgeEvents.push("idle")
        },
      },
      unsubscribe() {},
      systemContext: {} as { current?: string },
    }

    Reflect.set(runtime, "ensureActiveSession", async () => active)
    Reflect.set(runtime, "applyRequestedModel", async () => undefined)
    Reflect.set(runtime, "applyRequestedThinkingLevel", () => undefined)
    Reflect.set(runtime, "injectTurnPrelude", async () => undefined)
    Reflect.set(runtime, "maybeGenerateSessionTitle", async () => undefined)
    Reflect.set(runtime, "removeEmptySessionHeader", () => undefined)

    await runtime.promptAsync(
      TEST_DIRECTORY,
      BUDDY_SESSION_ID,
      {
        content: "hi",
        llmContent: "hi",
        parts: [],
      },
      { refreshTools: false },
    )

    await Bun.sleep(0)

    expect(sendCustomMessageCalls).toBe(1)
    expect(bridgeEvents).toContain("handle:agent_start")
    expect(bridgeEvents).toContain("idle")
    expect(bridgeEvents).not.toContain("error")
  })

  test("generates a session title with a small model after the first user turn", async () => {
    const runtime = new PiRuntime()

    runtime.getModelRegistry().registerProvider("faux-title-provider", {
      api: "faux-title-api",
      apiKey: "test-key",
      baseUrl: "http://localhost:0",
      models: fauxTitleModels(),
    })
    const fullModel = runtime.getModelRegistry().find("faux-title-provider", "gpt-5")
    if (!fullModel) {
      throw new Error("Expected faux title model to be registered")
    }

    let savedTitle: string | undefined
    const active = {
      directory: TEST_DIRECTORY,
      defaultToolNames: [] as string[],
      session: {
        sessionId: PI_SESSION_ID,
        sessionName: undefined as string | undefined,
        model: fullModel,
        messages: [
          {
            role: "user" as const,
            content: "before we migrated to pi. the title of chat was auto generated with the chat models that were small. that no longer happens. can you fix it. like it was before.",
            timestamp: Date.now(),
          },
        ],
        sessionManager: {
          getHeader() {
            return {}
          },
        },
        setSessionName(title: string) {
          savedTitle = title
          this.sessionName = title
        },
      },
      bridge: {} as never,
      unsubscribe() {},
      systemContext: {} as { current?: string },
    }

    Reflect.set(
      runtime,
      "mappedSessionInfo",
      async (_directory: string, _sessionID: string) =>
        ({
          id: BUDDY_SESSION_ID,
          title: savedTitle,
        }) as { id: string; title: string | undefined },
    )

    Reflect.set(
      runtime,
      "completeTitleGeneration",
      async (input: { model: { id: string } }) => {
        expect(input.model.id).toBe("gpt-5-mini")
        return "Implementing chat title generation"
      },
    )

    Reflect.set(
      runtime,
      "activeSessions",
      new Map([[`${TEST_DIRECTORY}${ACTIVE_SESSION_KEY_SEPARATOR}${PI_SESSION_ID}`, active]]),
    )

    const updated = await Reflect.get(runtime, "maybeGenerateSessionTitle").call(runtime, active)

    expect(savedTitle).toBe("Implementing chat title generation")
    expect(updated).toEqual({
      id: BUDDY_SESSION_ID,
      title: "Implementing chat title generation",
    })
  })
})
