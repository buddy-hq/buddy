import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import { Session } from "@buddy/transcript-contract/session"
import { createRuntimeHarness, messageText, scenario } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => { api = await createRuntimeHarness() })
afterAll(async () => { await api?.[Symbol.asyncDispose]() })

describe("Conversations port", () => {
  test("created conversations retain metadata, expose their family, and removal deletes the family", async () => {
    const parent = await api.create({ title: "Family", metadata: { purpose: "conformance" } })
    const child = await api.create({ parentID: parent.id, title: "Child" })
    expect(await api.session(parent.id)).toMatchObject({ title: "Family", metadata: { purpose: "conformance" } })
    expect((await api.children(parent.id)).map((item) => item.id)).toEqual([child.id])
    expect(await api.session(child.id)).toMatchObject({ parentID: parent.id })
    expect((await api.sessions()).map((item) => item.id)).toEqual(expect.arrayContaining([parent.id, child.id]))
    const renamed = await api.json(`/session/${parent.id}`, { method: "PATCH", body: JSON.stringify({ title: "Renamed family" }) })
    expect(Schema.decodeUnknownSync(Session)(renamed)).toMatchObject({ title: "Renamed family", metadata: { purpose: "conformance" } })
    expect(await api.json(`/session/${parent.id}`, { method: "DELETE" })).toBe(true)
    expect((await api.request(`/session/${parent.id}`)).status).toBe(404)
    expect((await api.request(`/session/${child.id}`)).status).toBe(404)
  })

  test("history is chronological and cursor pages recover every message without overlap", async () => {
    const session = await api.create()
    for (const text of ["First answer", "Second answer", "Third answer"]) expect((await api.prompt(session.id, scenario({ kind: "reply", text }))).status).toBe(200)
    const full = await api.messages(session.id)
    expect(full.filter((message) => message.info.role === "assistant").map(messageText)).toEqual(["First answer", "Second answer", "Third answer"])
    expect(full.map((message) => message.info.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"])
    let parentID = ""
    for (const message of full) {
      if (message.info.role === "user") {
        parentID = message.info.id
        continue
      }
      expect(message.info.parentID).toBe(parentID)
      const single = Schema.decodeUnknownSync(MessageWithParts)(await api.json(`/session/${session.id}/message/${message.info.id}`))
      expect(single.info).toMatchObject({ id: message.info.id, parentID })
    }
    const recovered: string[] = []
    const cursors = new Set<string>()
    let before: string | null = null
    do {
      const response = await api.request(`/session/${session.id}/message?limit=2${before ? `&before=${encodeURIComponent(before)}` : ""}`)
      expect(response.status).toBe(200)
      const page = Schema.decodeUnknownSync(Schema.Array(MessageWithParts))(await response.json())
      recovered.unshift(...page.map((message) => message.info.id))
      before = response.headers.get("x-next-cursor")
      if (before) {
        expect(response.headers.get("link")).toContain('rel="next"')
        expect(cursors.has(before)).toBe(false)
        cursors.add(before)
      }
    } while (before)
    expect(recovered).toEqual(full.map((message) => message.info.id))
  })

  test("fork copies history and an explicit boundary excludes that message and later turns", async () => {
    const session = await api.create({ title: "Original" })
    await api.prompt(session.id, scenario({ kind: "reply", text: "First fork answer" }))
    await api.prompt(session.id, scenario({ kind: "reply", text: "Second fork answer" }))
    const history = await api.messages(session.id)
    const boundary = history.findLast((message) => message.info.role === "user")
    if (!boundary) throw new Error("Missing fork boundary")
    const full = Schema.decodeUnknownSync(Session)(await api.json(`/session/${session.id}/fork`, { method: "POST" }))
    const partial = Schema.decodeUnknownSync(Session)(await api.json(`/session/${session.id}/fork`, { method: "POST", body: JSON.stringify({ messageID: boundary.info.id }) }))
    expect(full.id).not.toBe(session.id)
    expect((await api.messages(full.id)).map(messageText)).toEqual(history.map(messageText))
    expect((await api.messages(partial.id)).map(messageText)).toEqual(history.slice(0, 2).map(messageText))
    expect((await api.messages(session.id)).map((message) => message.info.id)).toEqual(history.map((message) => message.info.id))
  })

  test("revert records the selected turn boundary and unrevert restores the full conversation", async () => {
    const session = await api.create()
    await api.prompt(session.id, scenario({ kind: "reply", text: "Keep this turn" }))
    await api.prompt(session.id, scenario({ kind: "reply", text: "Undo this turn" }))
    const history = await api.messages(session.id)
    const boundary = history.findLast((message) => message.info.role === "user")
    if (!boundary) throw new Error("Missing revert boundary")
    const reverted = Schema.decodeUnknownSync(Session)(await api.json(`/session/${session.id}/revert`, { method: "POST", body: JSON.stringify({ messageID: boundary.info.id }) }))
    expect(reverted.revert?.messageID).toBe(boundary.info.id)
    expect((await api.session(session.id)).revert?.messageID).toBe(boundary.info.id)
    const restored = Schema.decodeUnknownSync(Session)(await api.json(`/session/${session.id}/unrevert`, { method: "POST" }))
    expect(restored.revert).toBeUndefined()
    expect((await api.messages(session.id)).map(messageText)).toEqual(history.map(messageText))
  })
})
