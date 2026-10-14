import { describe, expect, test } from "bun:test"
import { compactSession, promptSession } from "@buddy/opencode-adapter/gateway/write"
import { createWriteFixture } from "./v2-write-fixture"

describe("v2 session compaction", () => {
  test("waits for the completed summary and selects the requested compaction model", async () => {
    await using fixture = await createWriteFixture({ compactionSummary: "Scripted summary." })
    const { host, directory } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    expect((await promptSession(host, { sessionID: session.id, text: "Conversation to summarize" }, { directory }, AbortSignal.timeout(10_000))).ok).toBe(true)
    const result = await compactSession(host, { sessionID: session.id, model: { providerID: "scripted", id: "compact" } }, AbortSignal.timeout(10_000))
    expect(result).toEqual({ ok: true, value: true })
    const history = await host.message.list({ sessionID: session.id, type: "compaction" })
    expect(history.data).toContainEqual(expect.objectContaining({ type: "compaction", status: "completed", summary: "Scripted summary." }))
    expect((await host.session.get({ sessionID: session.id })).model).toMatchObject({ providerID: "scripted", id: "compact" })
  }, 15_000)

  test("returns compaction failure instead of reporting successful admission", async () => {
    await using fixture = await createWriteFixture()
    const { host, directory } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    expect((await promptSession(host, { sessionID: session.id, text: "Conversation to summarize" }, { directory }, AbortSignal.timeout(10_000))).ok).toBe(true)
    expect(await compactSession(host, { sessionID: session.id }, AbortSignal.timeout(10_000))).toMatchObject({ ok: false, error: { status: 500, message: "Compaction summary did not match the required template" } })
  }, 15_000)
})
