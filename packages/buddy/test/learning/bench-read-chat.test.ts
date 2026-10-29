import { expect, test } from "bun:test"
import type { MessageWithParts } from "@buddy/transcript-contract/message"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { createRuntimeHarness, messageText, scenario } from "../conformance/harness"
import { runtimeHost } from "../helpers/opencode"
import { tmpdir } from "../helpers/tmpdir"

function chatReadOutcome(messages: readonly MessageWithParts[]) {
  const part = messages.flatMap((message) => message.parts).findLast(
    (part) => part.type === "tool" && part.tool === "bench_read_chat",
  )
  if (part?.type !== "tool") throw new Error("Missing chat read outcome")
  return part.state
}

async function createAttachmentChat(directory: string, input: { text: string; filename: string; mime: string; data: string }) {
  const host = runtimeHost(await getAgentRuntime())
  const session = await host.session.create({ title: input.filename, location: { directory } })
  await host.session.remove({ sessionID: session.id })
  await host.session.import({
    info: session,
    location: { directory },
    messages: [{
      id: `msg_${crypto.randomUUID()}`,
      type: "user",
      text: input.text,
      files: [{ name: input.filename, mime: input.mime, data: input.data, source: { type: "inline" } }],
      time: { created: 1 },
    }],
  })
  return session
}

test("Bench reads a chat's text and tool outcome in order, limits latest messages, and refuses another notebook", async () => {
  await using otherNotebook = await tmpdir()
  await using api = await createRuntimeHarness({
    toolResults: [{ name: "chat_evidence", parts: [{ type: "text", text: "The measurement is 42." }, { type: "file", filename: "report.csv", mime: "text/csv", url: "https://example.invalid/report.csv" }] }],
  })
  const source = await api.create({ title: "Measured result" })
  const userText = scenario({ kind: "tool", name: "chat_evidence", arguments: {} })
  expect((await api.prompt(source.id, userText)).status).toBe(200)
  const sourceMessages = await api.messages(source.id)
  const reader = await api.create({ title: "Read measured result" })
  expect((await api.prompt(reader.id, scenario({
    kind: "tool", name: "bench_read_chat", arguments: { sessionID: source.id },
  }))).status).toBe(200)
  const full = chatReadOutcome(await api.messages(reader.id))
  expect(full.status).toBe("completed")
  if (full.status !== "completed") throw new Error("Chat read failed")
  expect(full.output).toStartWith(
    `User:\n${userText}\n\nAssistant:\nWorking on the request.\nTool chat_evidence (completed):\nThe measurement is 42.\nreport.csv text/csv https://example.invalid/report.csv\n\nAssistant:\nTool result:`,
  )

  expect((await api.prompt(reader.id, scenario({
    kind: "tool", name: "bench_read_chat", arguments: { sessionID: source.id, latest: 1 },
  }))).status).toBe(200)
  const latest = chatReadOutcome(await api.messages(reader.id))
  const lastMessage = sourceMessages.at(-1)
  if (latest.status !== "completed" || !lastMessage) throw new Error("Missing latest chat message")
  expect(latest.output).toBe(
    `${sourceMessages.length - 1} earlier messages left out.\n\nAssistant:\n${messageText(lastMessage)}`,
  )

  const runtime = await getAgentRuntime()
  const otherChat = await runtime.conversations.create(otherNotebook.path, { title: "Other notebook" })
  try {
    expect((await api.prompt(reader.id, scenario({
      kind: "tool", name: "bench_read_chat", arguments: { sessionID: otherChat.id },
    }))).status).toBe(200)
    expect(chatReadOutcome(await api.messages(reader.id))).toMatchObject({
      status: "error", error: "Chat not found in this notebook",
    })
  } finally {
    await runtime.conversations.remove(otherChat.id)
  }
})

test("Bench names a user's image attachment without including its data", async () => {
  await using api = await createRuntimeHarness()
  const imageData = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
  const source = await createAttachmentChat(api.directory, {
    text: "Help me with this worksheet.", filename: "worksheet.png", mime: "image/png", data: imageData,
  })
  const reader = await api.create({ title: "Read worksheet question" })
  expect((await api.prompt(reader.id, scenario({
    kind: "tool", name: "bench_read_chat", arguments: { sessionID: source.id },
  }))).status).toBe(200)
  const outcome = chatReadOutcome(await api.messages(reader.id))
  expect(outcome.status).toBe("completed")
  if (outcome.status !== "completed") throw new Error("Chat read failed")
  expect(outcome.output).toContain("User:\nHelp me with this worksheet.\n[Attachment: worksheet.png (image/png)]\n(open that chat to view it)")
  expect(outcome.output).not.toContain(imageData)
})

test("Bench includes a user's attachment-only text file", async () => {
  await using api = await createRuntimeHarness()
  const source = await createAttachmentChat(api.directory, {
    text: "", filename: "notes.txt", mime: "text/plain", data: "aGVsbG8=",
  })
  const reader = await api.create({ title: "Read attached notes" })
  expect((await api.prompt(reader.id, scenario({
    kind: "tool", name: "bench_read_chat", arguments: { sessionID: source.id },
  }))).status).toBe(200)
  const outcome = chatReadOutcome(await api.messages(reader.id))
  expect(outcome.status).toBe("completed")
  if (outcome.status !== "completed") throw new Error("Chat read failed")
  expect(outcome.output).toContain("User:\n[Attachment: notes.txt (text/plain)]\nhello")
})
