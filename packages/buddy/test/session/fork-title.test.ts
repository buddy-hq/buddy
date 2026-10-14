import { describe, expect, test } from "bun:test"
import { createSession, forkSession, getSession, updateSession } from "@buddy/opencode-adapter/gateway/session"
import { promptSession } from "@buddy/opencode-adapter/gateway/write"
import { createWriteFixture } from "./v2-write-fixture"

describe("v2 fork title lineage", () => {
  test("increments fork titles, clears lineage on rename and returns independent authoritative metadata", async () => {
    await using fixture = await createWriteFixture()
    const { host, directory } = fixture
    const original = await createSession(host, directory, { title: "Original", agent: "buddy", metadata: { retained: { value: 1 } } })
    expect((await promptSession(host, { sessionID: original.id, text: "Seed history" }, { directory }, AbortSignal.timeout(10_000))).ok).toBe(true)
    const first = await forkSession(host, original.id)
    expect(first.title).toBe("Original (2)")
    expect((await forkSession(host, first.id)).title).toBe("Original (3)")
    if (!first.metadata) throw new Error("Expected retained fork metadata")
    Object.assign(first.metadata, { retained: { value: 999 } })
    expect((await getSession(host, first.id)).metadata?.retained).toEqual({ value: 1 })
    const renamed = await updateSession(host, first.id, { title: "Renamed" })
    expect(renamed.metadata?.["buddy.forkTitle"]).toBeUndefined()
    expect((await host.session.get({ sessionID: first.id })).metadata?.["buddy.forkTitle"]).toBeUndefined()
    expect((await forkSession(host, first.id)).title).toBe("Renamed (2)")
  }, 15_000)
})
