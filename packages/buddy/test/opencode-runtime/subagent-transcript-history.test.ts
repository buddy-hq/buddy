import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { createOpenCodeHost, type OpenCodeEvent } from "@buddy/opencode-adapter/host"
import { listMessages, toBuddyMessage } from "@buddy/opencode-adapter/gateway/message"
import { subagentInboxMessage } from "@buddy/opencode-adapter/gateway/subagent"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { subagentScriptedModel, type ModelRequest } from "./subagent-scripted-model"

async function nextEvent(
  events: AsyncIterator<OpenCodeEvent>,
  matches: (event: OpenCodeEvent) => boolean,
) {
  while (true) {
    const next = await events.next()
    if (next.done) throw new Error("Subagent event stream ended before completion")
    if (matches(next.value)) return next.value
  }
}

test("projects a scripted native background subagent completion through persisted history", async () => {
  await using root = await temporaryDirectory({ prefix: "buddy-subagent-history-" })
  const directory = path.join(root.path, "workspace")
  const paths = {
    data: path.join(root.path, "data"),
    cache: path.join(root.path, "cache"),
    config: path.join(root.path, "config"),
    state: path.join(root.path, "state"),
    tmp: path.join(root.path, "tmp"),
  }
  await Promise.all(
    [directory, ...Object.values(paths)].map((entry) => fs.mkdir(entry, { recursive: true })),
  )
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const requests: ModelRequest[] = []
  await using host = await createOpenCodeHost({
    clientName: "buddy-subagent-history",
    paths,
    databasePath: path.join(paths.data, "opencode.db"),
    fetchModels: false,
    fs: { filewatcher: false, fff: false },
    config: {
      project: false,
      content: JSON.stringify({
        model: "scripted/chat",
        providers: {
          scripted: {
            package: "aisdk:@ai-sdk/perplexity",
            settings: { apiKey: "test" },
            models: { chat: { name: "Scripted chat", limit: { context: 32000, output: 1000 } } },
          },
        },
        agents: { "fixture-worker": { mode: "subagent", description: "Scripted worker" } },
      }),
    },
    plugins: [
      subagentScriptedModel({
        requests,
        async hold(request) {
          const childRequest = request.prompt.some(
            (message) =>
              message.role === "user" &&
              message.content.some(
                (part) =>
                  part.type === "text" &&
                  part.text.startsWith("You are a subagent spawned by another session."),
              ),
          )
          if (!childRequest) return
          entered.resolve()
          await release.promise
        },
      }),
    ],
  })
  const controller = new AbortController()
  const events = host.event
    .subscribe({ signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) })
    [Symbol.asyncIterator]()
  try {
    await nextEvent(events, (event) => event.type === "server.connected")
    const parent = await host.session.create({
      location: { directory },
      agent: "build",
      model: { providerID: "scripted", id: "chat" },
      permissions: [{ action: "*", resource: "*", effect: "allow" }],
    })
    await host.session.prompt({
      sessionID: parent.id,
      text: `fixture-delegate:${JSON.stringify({ agent: "fixture-worker", description: "Research migration", prompt: "fixture-child:history", background: true })}`,
    })
    await host.session.wait({ sessionID: parent.id })
    await entered.promise
    const context = { directory, sessionID: parent.id }
    const before = await listMessages(host, context)
    const launch = before.items
      .flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === "tool" && part.subagent ? [part.subagent] : [],
        ),
      )
      .at(-1)
    expect(launch).toMatchObject({
      ownerSessionID: parent.id,
      agentID: "fixture-worker",
      description: "Research migration",
      background: true,
      workerStatus: "running",
    })
    if (!launch?.childSessionID)
      throw new Error(`Missing background launch: ${JSON.stringify(before)}`)
    expect(launch.result).toBeUndefined()
    expect((await host.session.active())[launch.childSessionID]).toMatchObject({ type: "running" })
    release.resolve()
    const admitted = await nextEvent(
      events,
      (event) =>
        event.type === "session.inbox.enqueued" &&
        event.data.sessionID === parent.id &&
        event.data.item.type === "synthetic",
    )
    const provisional = subagentInboxMessage(admitted)
    if (!provisional)
      throw new Error(`Inbox admission was not a subagent completion: ${JSON.stringify(admitted)}`)
    const projected = toBuddyMessage(provisional, context)?.parts[0]
    if (projected?.type !== "notice" || !projected.completion)
      throw new Error("Missing projected completion notice")
    expect(projected.completion).toMatchObject({
      ownerSessionID: parent.id,
      childSessionID: launch.childSessionID,
      outcome: "completed",
      result: "Worker complete.",
      description: "Research migration",
    })
    await nextEvent(
      events,
      (event) =>
        event.type === "session.inbox.delivered" &&
        event.data.sessionID === parent.id &&
        event.data.inboxID === provisional.id,
    )
    await host.session.wait({ sessionID: parent.id })
    const after = await listMessages(host, context)
    const notices = after.items.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "notice" && part.completion ? [part] : [])),
    )
    expect(notices).toHaveLength(1)
    expect(notices[0]?.id).toBe(projected.id)
    expect(notices[0]?.completion).toMatchObject({
      messageID: provisional.id,
      childSessionID: launch.childSessionID,
      outcome: "completed",
      result: "Worker complete.",
      description: "Research migration",
    })
    const relaunched = after.items
      .flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === "tool" && part.subagent ? [part.subagent] : [],
        ),
      )
      .at(-1)
    expect(relaunched).toMatchObject({
      messageID: launch.messageID,
      callID: launch.callID,
      workerStatus: "running",
    })
  } finally {
    release.resolve()
    controller.abort()
    await events.return?.()
  }
})
