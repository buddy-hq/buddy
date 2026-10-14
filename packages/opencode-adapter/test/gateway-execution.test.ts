import { describe, expect, test } from "bun:test"
import type { OpenCodeEvent } from "../src/gateway/client"
import { observeSessionExecution } from "../src/gateway/execution"

function observer(events: readonly OpenCodeEvent[]) {
  return observeSessionExecution({ event: { async *subscribe() { yield { id: "evt_connected", type: "server.connected", data: {} }; yield* events } } }, { sessionID: "ses_queued", promptID: "msg_queued" })
}

describe("v2 gateway execution correlation", () => {
  test("accepts the shared assistant for batched steers and ignores compaction control delivery", async () => {
    const base = { created: 1, durable: { aggregateID: "ses_queued", seq: 1, version: 1 as const } }
    const wait = observer([
      { ...base, id: "evt_delivery", type: "session.inbox.delivered", data: { sessionID: "ses_queued", inboxID: "msg_queued" } },
      { ...base, id: "evt_batch", type: "session.inbox.delivered", data: { sessionID: "ses_queued", inboxID: "msg_batch" } },
      { ...base, id: "evt_step", type: "session.step.started", data: { sessionID: "ses_queued", assistantMessageID: "msg_tool_step", agent: "buddy", model: { providerID: "provider", id: "model" }, started: 1 } },
      { ...base, id: "evt_control", type: "session.inbox.enqueued", data: { sessionID: "ses_queued", inboxID: "msg_compact", item: { type: "compaction", payload: {}, delivery: "steer" } } },
      { ...base, id: "evt_compact", type: "session.inbox.delivered", data: { sessionID: "ses_queued", inboxID: "msg_compact" } },
      { ...base, id: "evt_answer", type: "session.step.started", data: { sessionID: "ses_queued", assistantMessageID: "msg_answer", agent: "buddy", model: { providerID: "provider", id: "model" }, started: 2 } },
      { ...base, id: "evt_done", type: "session.execution.succeeded", data: { sessionID: "ses_queued" } },
    ])
    expect(await wait.result).toEqual({ ok: true, value: { type: "succeeded", messageID: "msg_answer" } })
    await wait.close()
  })

  test("ignores earlier turns and other sessions, then correlates the delivered prompt to its assistant", async () => {
    const base = { created: 1, durable: { aggregateID: "ses_queued", seq: 1, version: 1 as const } }
    const wait = observer([
      { ...base, id: "evt_earlier", type: "session.execution.succeeded", data: { sessionID: "ses_queued" } },
      { ...base, id: "evt_other", type: "session.inbox.delivered", data: { sessionID: "ses_other", inboxID: "msg_queued" } },
      { ...base, id: "evt_delivery", type: "session.inbox.delivered", data: { sessionID: "ses_queued", inboxID: "msg_queued" } },
      { ...base, id: "evt_step", type: "session.step.started", data: { sessionID: "ses_queued", assistantMessageID: "msg_answer", agent: "buddy", model: { providerID: "provider", id: "model" }, started: 1 } },
      { ...base, id: "evt_next", type: "session.inbox.delivered", data: { sessionID: "ses_queued", inboxID: "msg_next_user" } },
      { ...base, id: "evt_next_step", type: "session.step.started", data: { sessionID: "ses_queued", assistantMessageID: "msg_next_answer", agent: "buddy", model: { providerID: "provider", id: "model" }, started: 2 } },
      { ...base, id: "evt_done", type: "session.execution.succeeded", data: { sessionID: "ses_queued" } },
    ])
    expect(await wait.ready).toBeUndefined()
    expect(await wait.result).toEqual({ ok: true, value: { type: "succeeded", messageID: "msg_answer" } })
    await wait.close()
  })

  test.each(["failed", "interrupted"] as const)("settles a delivered repair on execution %s", async (type) => {
    const base = { created: 1, durable: { aggregateID: "ses_queued", seq: 1, version: 1 as const } }
    const terminal: OpenCodeEvent = type === "failed"
      ? { ...base, id: "evt_failed", type: "session.execution.failed", data: { sessionID: "ses_queued", error: { type: "provider.failed", message: "Unavailable" } } }
      : { ...base, id: "evt_stopped", type: "session.execution.interrupted", data: { sessionID: "ses_queued", reason: "user" } }
    const wait = observer([{ ...base, id: "evt_delivery", type: "session.inbox.delivered", data: { sessionID: "ses_queued", inboxID: "msg_queued" } }, terminal])
    expect(await wait.result).toMatchObject({ ok: true, value: { type } })
    await wait.close()
  })

  test("reports cancellation before delivery rather than waiting indefinitely", async () => {
    const wait = observer([{ id: "evt_cancelled", created: 1, durable: { aggregateID: "ses_queued", seq: 1, version: 1 }, type: "session.inbox.cancelled", data: { sessionID: "ses_queued", inboxID: "msg_queued" } }])
    expect(await wait.result).toMatchObject({ ok: false, error: { _tag: "SessionExecutionWaitError", reason: "cancelled" } })
    await wait.close()
  })
})
