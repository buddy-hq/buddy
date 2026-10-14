import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Schema } from "effect"
import { Skill } from "@buddy/opencode-adapter/config"
import { Plugin } from "@buddy/opencode-adapter/plugin"
import { listExecutableCommands } from "@buddy/opencode-adapter/gateway/command"
import { commandSession, promptSession } from "@buddy/opencode-adapter/gateway/write"
import { listMessages } from "@buddy/opencode-adapter/gateway/message"
import { subscribeBuddyEvents } from "@buddy/opencode-adapter/gateway/stream"
import { createWriteFixture } from "./v2-write-fixture"
import { parseStringValue } from "@buddy/transcript-contract/parse-external"

describe("v2 command transcript", () => {
  test("shows the compact command in history and live events while the model receives the full template", async () => {
    await using fixture = await createWriteFixture()
    const { host, directory, requests } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    const abort = new AbortController()
    const connected = Promise.withResolvers<void>()
    const userText: string[] = []
    const watching = (async () => {
      for await (const event of subscribeBuddyEvents(host, { directory, signal: abort.signal })) {
        if (event.payload.type === "server.connected") connected.resolve()
        const part = event.payload.properties.part
        if (part instanceof Object && "type" in part && part.type === "text" && "text" in part) {
          const text = parseStringValue(part.text)
          if (text !== undefined) userText.push(text)
        }
      }
    })()
    try {
      await connected.promise
      const result = await commandSession(host, { sessionID: session.id, name: "explain", text: " closures " }, { directory }, AbortSignal.timeout(10_000))
      expect(result).toMatchObject({ ok: true, value: { info: { role: "assistant" }, parts: [{ type: "text", text: "Scripted title." }] } })
      const page = await listMessages(host, { sessionID: session.id, directory })
      const user = page.items.find((message) => message.info.role === "user")
      expect(user).toMatchObject({ parts: [{ type: "text", text: "/explain closures" }] })
      expect(userText).toContain("/explain closures")
      expect(userText.some((text) => text.includes("Full expanded template"))).toBe(false)
      const modelText = requests.flatMap((request) => request.prompt.filter((message) => message.role === "user").flatMap((message) => Array.isArray(message.content) ? message.content.flatMap((part) => part.type === "text" ? [part.text] : []) : [message.content]))
      expect(modelText).toContain("Full expanded template:  closures")
      const ordinary = await promptSession(host, { sessionID: session.id, text: "Ordinary prompt" }, { directory }, AbortSignal.timeout(10_000))
      expect(ordinary.ok).toBe(true)
      const history = await listMessages(host, { sessionID: session.id, directory })
      expect(history.items.findLast((message) => message.info.role === "user")?.parts[0]).toMatchObject({ text: "Ordinary prompt" })
    } finally { abort.abort(); await watching }
  }, 15_000)

  test("correlates identical concurrent commands with distinct admitted prompt IDs", async () => {
    await using fixture = await createWriteFixture()
    const { host, directory } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    const results = await Promise.all([1, 2].map(() => commandSession(host, { sessionID: session.id, name: "explain", text: "same" }, { directory }, AbortSignal.timeout(10_000))))
    const parents = results.map((result) => {
      if (!result.ok || !("info" in result.value) || result.value.info.role !== "assistant") throw new Error("Expected a completed command assistant")
      return result.value.info.parentID
    })
    expect(new Set(parents).size).toBe(2)
    const history = await listMessages(host, { sessionID: session.id, directory })
    expect(history.items.filter((message) => message.info.role === "user").map((message) => message.info.id).toSorted()).toEqual(parents.toSorted())
  }, 15_000)

  test("executes an advertised skill-only slash entry as a skill-attached prompt with compact command display", async () => {
    const skillPlugin = Plugin.define({ id: "buddy.test.review-skill", async setup(ctx) {
      await ctx.skill.transform((editor) => editor.add(Schema.decodeUnknownSync(Skill.Info)({
        id: "review-skill", name: "review-skill", description: "Review a chapter",
        path: path.join(ctx.location.directory, "review-skill.md"), content: "Review skill instructions.",
      })))
    } })
    await using fixture = await createWriteFixture({ plugins: [skillPlugin] })
    const { host, directory, requests } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    let accepted = false
    const result = await commandSession(host, { sessionID: session.id, name: "/review-skill", text: " chapter 3 " }, { directory }, AbortSignal.timeout(10_000), async () => { accepted = true })
    expect(accepted).toBe(true)
    expect((await host.command.list({ location: { directory } })).data.some((command) => command.name === "review-skill")).toBe(false)
    expect(await listExecutableCommands(host, directory)).toContainEqual({ name: "review-skill", description: "Review a chapter", source: "skill" })
    expect(result).toMatchObject({ ok: true, value: { info: { role: "assistant" }, parts: [{ type: "text", text: "Scripted title." }] } })
    if (!result.ok || !("info" in result.value) || result.value.info.role !== "assistant") throw new Error("Expected a completed skill command assistant")
    const history = await listMessages(host, { sessionID: session.id, directory })
    const user = history.items.find((message) => message.info.role === "user")
    expect(user?.info.id).toBe(result.value.info.parentID)
    expect(user).toMatchObject({ parts: [{ type: "text", text: "/review-skill chapter 3" }] })
    const prompt = JSON.stringify(requests.at(-1)?.prompt)
    expect(prompt).toContain("Review skill instructions.")
    expect(prompt).toContain("chapter 3")
    const missing = await commandSession(host, { sessionID: session.id, name: "missing-entry", text: "" }, { directory }, AbortSignal.timeout(10_000))
    expect(missing).toMatchObject({ ok: false, error: { cause: { _tag: "CommandNotFoundError" } } })
  }, 15_000)
})
