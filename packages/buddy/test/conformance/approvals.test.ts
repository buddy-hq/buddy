import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import { createRuntimeHarness, messageText, scenario } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => { api = await createRuntimeHarness() })
afterAll(async () => { await api?.[Symbol.asyncDispose]() })

describe("Approvals port", () => {
  test("a denied tool is hidden from the model's available tools", async () => {
    const session = await api.create()
    const available = await api.prompt(session.id, scenario({ kind: "catalog", access: "allowed" }))
    expect(available.status).toBe(200)
    expect(messageText(Schema.decodeUnknownSync(MessageWithParts)(await available.json()))).toBe("Tool available")
    const response = await api.prompt(session.id, scenario({ kind: "catalog", access: "denied" }))
    expect(response.status).toBe(200)
    expect(messageText(Schema.decodeUnknownSync(MessageWithParts)(await response.json()))).toBe("Tool hidden")
  })

  test("external access raises an approval and rejection feedback reaches the tool and assistant", async () => {
    const session = await api.create()
    await using events = await api.events()
    await api.promptAsync(session.id, scenario({ kind: "read", path: api.outsideFile }))
    await events.until((event) => event.payload.type === "permission.asked" && event.payload.properties.sessionID === session.id)
    const pending = (await api.permissions(session.id))[0]
    expect(pending).toMatchObject({ sessionID: session.id, action: "outside_notebook", source: { messageID: expect.any(String), callID: expect.any(String) } })
    if (!pending) throw new Error("Missing approval request")
    expect(await api.json(`/permission/${pending.id}/reply?sessionID=${session.id}`, { method: "POST", body: JSON.stringify({ reply: "reject", message: "Use the notebook copy instead" }) })).toBe(true)
    await events.idle(session.id)
    const history = await api.messages(session.id)
    const tool = history.flatMap((message) => message.parts).find((part) => part.type === "tool")
    expect(tool).toMatchObject({ type: "tool", state: { status: "error", error: expect.stringContaining("Use the notebook copy instead") } })
    const final = history.at(-1)
    if (!final) throw new Error("Missing completed assistant")
    expect(messageText(final)).toContain("Use the notebook copy instead")
    expect(await api.permissions(session.id)).toEqual([])
  })

  test("always approvals are saved, reused, and ask again after removal", async () => {
    const session = await api.create()
    const content = scenario({ kind: "read", path: api.outsideFile })
    await using events = await api.events()
    await api.promptAsync(session.id, content)
    await events.until((event) => event.payload.type === "permission.asked" && event.payload.properties.sessionID === session.id)
    const pending = (await api.permissions(session.id))[0]
    if (!pending) throw new Error("Missing approval request")
    try {
      await api.json(`/permission/${pending.id}/reply?sessionID=${session.id}`, { method: "POST", body: JSON.stringify({ reply: "always" }) })
      await events.idle(session.id)
      const saved = (await api.savedPermissions()).find((grant) => grant.action === pending.action && pending.save?.includes(grant.resource))
      expect(saved).toBeDefined()
      if (!saved) throw new Error("Missing saved approval")
      const nextSession = await api.create()
      const response = await api.prompt(nextSession.id, content)
      expect(response.status).toBe(200)
      expect(messageText(Schema.decodeUnknownSync(MessageWithParts)(await response.json()))).toContain("External fixture contents")
      expect(await api.permissions(nextSession.id)).toEqual([])
      expect(await api.json(`/permission/saved/${saved.id}`, { method: "DELETE" })).toBe(true)
      expect((await api.savedPermissions()).some((grant) => grant.id === saved.id)).toBe(false)
      const revokedSession = await api.create()
      await api.promptAsync(revokedSession.id, content)
      await events.until((event) => event.payload.type === "permission.asked" && event.payload.properties.sessionID === revokedSession.id)
      const askedAgain = (await api.permissions(revokedSession.id))[0]
      expect(askedAgain).toMatchObject({ sessionID: revokedSession.id, action: pending.action })
      if (!askedAgain) throw new Error("Missing approval request after removal")
      await api.json(`/permission/${askedAgain.id}/reply?sessionID=${revokedSession.id}`, { method: "POST", body: JSON.stringify({ reply: "reject" }) })
      await events.idle(revokedSession.id)
    } finally {
      for (const grant of await api.savedPermissions()) await api.json(`/permission/saved/${grant.id}`, { method: "DELETE" })
    }
  })
})
