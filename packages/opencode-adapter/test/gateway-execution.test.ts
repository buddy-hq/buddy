import { describe, expect, test } from "bun:test"
import {
  OpenCode,
  type OpenCodeClient,
  type SessionActiveOutput,
  type SessionInboxInfo,
  type SessionInboxUser,
} from "@opencode/client"
import { TEST_SANDBOX } from "../../../script/test-preload"
import type { OpenCodeEvent } from "../src/gateway/client"
import { observeSessionExecution, withdrawUndeliveredInput } from "../src/gateway/execution"
import { commandSession } from "../src/gateway/write"
import { createExecution } from "../src/runtime/execution"

const base = { created: 1, durable: { aggregateID: "ses_queued", seq: 1, version: 1 as const } }
const failed: OpenCodeEvent = {
  ...base,
  id: "evt_failed",
  type: "session.execution.failed",
  data: { sessionID: "ses_queued", error: { type: "unknown", message: "Preparation failed" } },
}

function pendingInput(): SessionInboxUser {
  return {
    id: "msg_queued",
    sessionID: "ses_queued",
    type: "user",
    payload: {
      text: "Expanded instructions.",
      metadata: { buddy: { command: { display: "/quiz bio" } } },
    },
    delivery: "queue",
    time: { created: 1 },
  }
}

function waitForAbort(signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) resolve()
    else signal?.addEventListener("abort", () => resolve(), { once: true })
  })
}

async function executionResult<T>(result: Promise<T>): Promise<T> {
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(
    () => timeout.reject(new Error("Execution did not settle after the session became idle")),
    1_000,
  )
  try {
    return await Promise.race([result, timeout.promise])
  } finally {
    clearTimeout(timer)
  }
}

function nativeClient() {
  return OpenCode.make({
    baseUrl: "http://gateway.test",
    fetch: Object.assign(
      async () => {
        throw new Error("Unexpected native request")
      },
      { preconnect: fetch.preconnect },
    ),
  })
}

function observer(events: readonly OpenCodeEvent[]) {
  return observeSessionExecution(
    {
      event: {
        async *subscribe() {
          yield { id: "evt_connected", type: "server.connected", data: {} }
          yield* events
        },
      },
      session: { active: async () => ({}), wait: async () => {}, inbox: { list: async () => [] } },
    },
    { sessionID: "ses_queued", promptID: "msg_queued" },
  )
}

describe("v2 gateway execution correlation", () => {
  test.each(["failed", "interrupted"] as const)(
    "retains an undelivered %s event until active cleanup completes",
    async (type) => {
      const consumed = Promise.withResolvers<void>()
      const idle = Promise.withResolvers<void>()
      let active: SessionActiveOutput = { ses_queued: { type: "running" } }
      const terminal: OpenCodeEvent =
        type === "failed"
          ? failed
          : {
              ...base,
              id: "evt_interrupted",
              type: "session.execution.interrupted",
              data: { sessionID: "ses_queued", reason: "user" },
            }
      const wait = observeSessionExecution(
        {
          event: {
            async *subscribe({ signal } = {}) {
              yield { id: "evt_connected", type: "server.connected", data: {} }
              yield terminal
              consumed.resolve()
              await waitForAbort(signal)
            },
          },
          session: {
            active: async () => active,
            wait: async () => idle.promise,
            inbox: { list: async () => [pendingInput()] },
          },
        },
        { sessionID: "ses_queued", promptID: "msg_queued" },
      )
      try {
        await consumed.promise
        active = {}
        idle.resolve()
        expect(await executionResult(wait.result)).toMatchObject({
          ok: true,
          value: { type, undelivered: true },
        })
      } finally {
        idle.resolve()
        await wait.close()
      }
    },
  )

  test("continues observing delivery and steps from a successor while waiting for idle", async () => {
    const consumed = Promise.withResolvers<void>()
    const successor = Promise.withResolvers<void>()
    const idle = Promise.withResolvers<void>()
    const withdrawn: string[] = []
    const inbox = {
      list: async () => [pendingInput()],
      cancel: async ({ inboxID }: { inboxID: string }) => {
        withdrawn.push(inboxID)
      },
    }
    const wait = observeSessionExecution(
      {
        event: {
          async *subscribe({ signal } = {}) {
            yield { id: "evt_connected", type: "server.connected", data: {} }
            yield failed
            consumed.resolve()
            await successor.promise
            yield {
              ...base,
              id: "evt_delivery",
              type: "session.inbox.delivered",
              data: { sessionID: "ses_queued", inboxID: "msg_queued" },
            }
            yield {
              ...base,
              id: "evt_step",
              type: "session.step.started",
              data: {
                sessionID: "ses_queued",
                assistantMessageID: "msg_successor",
                agent: "buddy",
                model: { providerID: "provider", id: "model" },
                started: 2,
              },
            }
            yield {
              ...base,
              id: "evt_succeeded",
              type: "session.execution.succeeded",
              data: { sessionID: "ses_queued" },
            }
            await waitForAbort(signal)
          },
        },
        session: {
          active: async () => ({ ses_queued: { type: "running" } }),
          wait: async () => idle.promise,
          inbox,
        },
      },
      { sessionID: "ses_queued", promptID: "msg_queued" },
    )
    try {
      await consumed.promise
      successor.resolve()
      const result = await executionResult(wait.result)
      expect(result).toEqual({ ok: true, value: { type: "succeeded", messageID: "msg_successor" } })
      if (result.ok)
        await withdrawUndeliveredInput(
          { session: { inbox } },
          { sessionID: "ses_queued", promptID: "msg_queued" },
          result.value,
        )
      expect(withdrawn).toEqual([])
    } finally {
      successor.resolve()
      idle.resolve()
      await wait.close()
    }
  })

  test("command preparation failures withdraw only the undelivered command", async () => {
    const native = nativeClient()
    const commandStarted = Promise.withResolvers<void>()
    const unrelated = { ...pendingInput(), id: "msg_unrelated" }
    let pending: SessionInboxInfo[] = [unrelated]
    const client = {
      ...native,
      event: {
        async *subscribe({ signal } = {}) {
          yield { id: "evt_connected", type: "server.connected", data: {} }
          await commandStarted.promise
          yield {
            ...base,
            id: "evt_enqueued",
            type: "session.inbox.enqueued",
            data: {
              sessionID: "ses_queued",
              inboxID: "msg_queued",
              item: { type: "user", payload: pendingInput().payload, delivery: "queue" },
            },
          }
          yield failed
          await waitForAbort(signal)
        },
      },
      session: {
        ...native.session,
        get: async () => ({
          id: "ses_queued",
          projectID: "project",
          agent: "buddy",
          model: { providerID: "provider", id: "model" },
          location: { directory: TEST_SANDBOX.root },
          time: { created: 1, updated: 1 },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        }),
        active: async () => ({}),
        wait: async () => {},
        inbox: {
          ...native.session.inbox,
          list: async () => pending,
          cancel: async ({ inboxID }: { inboxID: string }) => {
            pending = pending.filter((item) => item.id !== inboxID)
          },
        },
        command: async () => {
          pending.push(pendingInput())
          commandStarted.resolve()
        },
      },
      message: { ...native.message, list: async () => ({ data: [], cursor: {} }) },
    } satisfies OpenCodeClient
    const result = await commandSession(
      client,
      { sessionID: "ses_queued", name: "quiz", text: "bio" },
      { directory: TEST_SANDBOX.root },
    )
    expect(result).toMatchObject({ ok: false, error: { message: "Preparation failed" } })
    expect(pending).toEqual([unrelated])
  })

  test.each([false, true])(
    "an admitted repair settles after withdrawal (withdrawal fails: %s)",
    async (withdrawalFails) => {
      const native = nativeClient()
      const withdrawing = Promise.withResolvers<void>()
      const withdrawal = Promise.withResolvers<void>()
      let pending = [pendingInput()]
      const client = {
        ...native,
        event: {
          async *subscribe({ signal } = {}) {
            yield { id: "evt_connected", type: "server.connected", data: {} }
            yield failed
            await waitForAbort(signal)
          },
        },
        session: {
          ...native.session,
          active: async () => ({}),
          wait: async () => {},
          inbox: {
            ...native.session.inbox,
            list: async () => pending,
            cancel: async ({ inboxID }: { inboxID: string }) => {
              withdrawing.resolve()
              await withdrawal.promise
              if (withdrawalFails) throw new Error("Inbox withdrawal unavailable")
              pending = pending.filter((item) => item.id !== inboxID)
            },
          },
        },
      } satisfies OpenCodeClient
      const execution = createExecution(
        {
          ...client,
          sessions: client.session,
          events: client.event,
          plugin: Object.assign(async () => {}, client.plugin),
          close: async () => {},
          [Symbol.asyncDispose]: async () => {},
        },
        {},
      )
      const wait = execution.observe({ sessionID: "ses_queued", messageID: "msg_queued" })
      let resolved = false
      void wait.result.then(() => {
        resolved = true
      })
      try {
        await executionResult(withdrawing.promise)
        expect(resolved).toBe(false)
        withdrawal.resolve()
        expect(await executionResult(wait.result)).toEqual({ ok: true, value: "failed" })
        expect(pending).toEqual(withdrawalFails ? [pendingInput()] : [])
      } finally {
        withdrawal.resolve()
        await wait.close()
      }
    },
  )

  test("accepts the shared assistant for batched steers and ignores compaction control delivery", async () => {
    const base = { created: 1, durable: { aggregateID: "ses_queued", seq: 1, version: 1 as const } }
    const wait = observer([
      {
        ...base,
        id: "evt_delivery",
        type: "session.inbox.delivered",
        data: { sessionID: "ses_queued", inboxID: "msg_queued" },
      },
      {
        ...base,
        id: "evt_batch",
        type: "session.inbox.delivered",
        data: { sessionID: "ses_queued", inboxID: "msg_batch" },
      },
      {
        ...base,
        id: "evt_step",
        type: "session.step.started",
        data: {
          sessionID: "ses_queued",
          assistantMessageID: "msg_tool_step",
          agent: "buddy",
          model: { providerID: "provider", id: "model" },
          started: 1,
        },
      },
      {
        ...base,
        id: "evt_control",
        type: "session.inbox.enqueued",
        data: {
          sessionID: "ses_queued",
          inboxID: "msg_compact",
          item: { type: "compaction", payload: {}, delivery: "steer" },
        },
      },
      {
        ...base,
        id: "evt_compact",
        type: "session.inbox.delivered",
        data: { sessionID: "ses_queued", inboxID: "msg_compact" },
      },
      {
        ...base,
        id: "evt_answer",
        type: "session.step.started",
        data: {
          sessionID: "ses_queued",
          assistantMessageID: "msg_answer",
          agent: "buddy",
          model: { providerID: "provider", id: "model" },
          started: 2,
        },
      },
      {
        ...base,
        id: "evt_done",
        type: "session.execution.succeeded",
        data: { sessionID: "ses_queued" },
      },
    ])
    expect(await wait.result).toEqual({
      ok: true,
      value: { type: "succeeded", messageID: "msg_answer" },
    })
    await wait.close()
  })

  test("ignores earlier turns and other sessions, then correlates the delivered prompt to its assistant", async () => {
    const base = { created: 1, durable: { aggregateID: "ses_queued", seq: 1, version: 1 as const } }
    const wait = observer([
      {
        ...base,
        id: "evt_earlier",
        type: "session.execution.succeeded",
        data: { sessionID: "ses_queued" },
      },
      {
        ...base,
        id: "evt_other",
        type: "session.inbox.delivered",
        data: { sessionID: "ses_other", inboxID: "msg_queued" },
      },
      {
        ...base,
        id: "evt_delivery",
        type: "session.inbox.delivered",
        data: { sessionID: "ses_queued", inboxID: "msg_queued" },
      },
      {
        ...base,
        id: "evt_step",
        type: "session.step.started",
        data: {
          sessionID: "ses_queued",
          assistantMessageID: "msg_answer",
          agent: "buddy",
          model: { providerID: "provider", id: "model" },
          started: 1,
        },
      },
      {
        ...base,
        id: "evt_next",
        type: "session.inbox.delivered",
        data: { sessionID: "ses_queued", inboxID: "msg_next_user" },
      },
      {
        ...base,
        id: "evt_next_step",
        type: "session.step.started",
        data: {
          sessionID: "ses_queued",
          assistantMessageID: "msg_next_answer",
          agent: "buddy",
          model: { providerID: "provider", id: "model" },
          started: 2,
        },
      },
      {
        ...base,
        id: "evt_done",
        type: "session.execution.succeeded",
        data: { sessionID: "ses_queued" },
      },
    ])
    expect(await wait.ready).toBeUndefined()
    expect(await wait.result).toEqual({
      ok: true,
      value: { type: "succeeded", messageID: "msg_answer" },
    })
    await wait.close()
  })

  test.each(["failed", "interrupted"] as const)(
    "settles a delivered repair on execution %s",
    async (type) => {
      const base = {
        created: 1,
        durable: { aggregateID: "ses_queued", seq: 1, version: 1 as const },
      }
      const terminal: OpenCodeEvent =
        type === "failed"
          ? {
              ...base,
              id: "evt_failed",
              type: "session.execution.failed",
              data: {
                sessionID: "ses_queued",
                error: { type: "provider.failed", message: "Unavailable" },
              },
            }
          : {
              ...base,
              id: "evt_stopped",
              type: "session.execution.interrupted",
              data: { sessionID: "ses_queued", reason: "user" },
            }
      const wait = observer([
        {
          ...base,
          id: "evt_delivery",
          type: "session.inbox.delivered",
          data: { sessionID: "ses_queued", inboxID: "msg_queued" },
        },
        terminal,
      ])
      expect(await wait.result).toMatchObject({ ok: true, value: { type } })
      await wait.close()
    },
  )

  test("reports cancellation before delivery rather than waiting indefinitely", async () => {
    const wait = observer([
      {
        id: "evt_cancelled",
        created: 1,
        durable: { aggregateID: "ses_queued", seq: 1, version: 1 },
        type: "session.inbox.cancelled",
        data: { sessionID: "ses_queued", inboxID: "msg_queued" },
      },
    ])
    expect(await wait.result).toMatchObject({
      ok: false,
      error: { _tag: "SessionExecutionWaitError", reason: "cancelled" },
    })
    await wait.close()
  })
})
