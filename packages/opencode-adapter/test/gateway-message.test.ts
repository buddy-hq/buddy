import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { Schema } from "effect"
import {
  OpenCode,
  type SessionInfo,
  type SessionMessageAssistant,
  type SessionMessageAssistantTool,
  type SessionMessageInfo,
} from "@opencode/client"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import type { EventClient, OpenCodeEvent, SessionClient } from "../src/gateway/client"
import {
  toBuddyMessage,
  listMessages,
  listContextMessages,
  getMessage,
} from "../src/gateway/message"
import { subscribeBuddyEvents } from "../src/gateway/stream"
import { admitSessionPrompt, promptSession } from "../src/gateway/write"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { loadBuddyToolMessages } from "../src/extension/tools"
import type { OpenCodeHost } from "../src/host"
import { createConversations } from "../src/runtime/conversations"
import { startV1ImportGuard } from "../src/v1-import-guard"

const context = { sessionID: "ses_gateway", directory: "/workspace" }
const assistant: SessionMessageAssistant = {
  id: "msg_assistant",
  type: "assistant",
  agent: "buddy",
  model: { id: "model", providerID: "provider" },
  time: { created: 10, completed: 20 },
  finish: "stop",
  cost: 0.25,
  tokens: { input: 5, output: 3, reasoning: 1, cache: { read: 2, write: 0 } },
  content: [
    { type: "reasoning", text: "Thinking", time: { created: 11, completed: 12 } },
    { type: "text", text: "Answer" },
    {
      type: "tool",
      id: "provider/call",
      name: "subagent",
      time: { created: 13, ran: 14, completed: 19 },
      state: {
        status: "completed",
        input: { description: "Research" },
        content: [
          { type: "text", text: "Result" },
          { type: "file", uri: "file:///image.png", mime: "image/png", name: "image.png" },
        ],
        metadata: { sessionID: "ses_child", status: "running" },
      },
    },
  ],
}

describe("v2 gateway history", () => {
  test("limits context messages to the latest compaction while retaining the full history", async () => {
    const history: SessionMessageInfo[] = [
      { id: "msg_001", type: "user", text: "before compaction", time: { created: 1 } },
      {
        id: "msg_002",
        type: "compaction",
        reason: "auto",
        status: "completed",
        summary: "Context",
        recent: "Recent",
        time: { created: 2 },
      },
      { id: "msg_003", type: "user", text: "after compaction", time: { created: 3 } },
    ]
    const runtimeFetch: typeof fetch = Object.assign(
      async (request: RequestInfo | URL) => {
        const url = new URL(request instanceof Request ? request.url : String(request))
        if (url.pathname.endsWith(`/session/${context.sessionID}/context`))
          return Response.json({ data: history.slice(1) })
        if (url.pathname.endsWith(`/session/${context.sessionID}`)) {
          return Response.json({
            data: {
              id: context.sessionID,
              projectID: "project",
              agent: "buddy",
              model: { id: "model", providerID: "provider" },
              location: { directory: context.directory },
              time: { created: 0, updated: 3 },
              cost: 0,
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            },
          })
        }
        const encoded = url.searchParams.get("cursor")
        const cursor = encoded
          ? Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String, order: Schema.String }))(
              JSON.parse(Buffer.from(encoded, "base64url").toString()),
            )
          : undefined
        const type = url.searchParams.get("type")
        const ascending = cursor?.order === "asc"
        const filtered = history.filter(
          (message) =>
            (!cursor || (ascending ? message.id > cursor.id : message.id < cursor.id)) &&
            (!type || message.type === type),
        )
        const messages = ascending ? filtered : filtered.toReversed()
        return Response.json({
          data: messages.slice(0, Number(url.searchParams.get("limit"))),
          cursor: {},
        })
      },
      { preconnect: fetch.preconnect },
    )
    const client = OpenCode.make({ baseUrl: "http://gateway.test", fetch: runtimeFetch })

    expect((await listContextMessages(client, context)).map((message) => message.info.id)).toEqual([
      "msg_002",
      "msg_003",
    ])
    expect((await listMessages(client, context)).items.map((message) => message.info.id)).toEqual([
      "msg_001",
      "msg_002",
      "msg_003",
    ])
  })

  test("restores each user message's selection across history pages, single reads, and streamed hydration", async () => {
    const model = { id: "first-model", providerID: "first-provider", variant: "high" }
    const currentModel = { id: "second-model", providerID: "second-provider" }
    const history: SessionMessageInfo[] = [
      { id: "msg_000", type: "user", text: "Before any switches", time: { created: 0 } },
      {
        ...assistant,
        id: "msg_000_reply",
        agent: "original-agent",
        model: { id: "original-model", providerID: "original-provider", variant: "default" },
      },
      { id: "msg_001", type: "agent-switched", agent: "first-agent", time: { created: 1 } },
      { id: "msg_002", type: "model-switched", model, time: { created: 2 } },
      { id: "msg_003", type: "user", text: "First question", time: { created: 3 } },
      { id: "msg_004", type: "agent-switched", agent: "second-agent", time: { created: 4 } },
      { id: "msg_005", type: "model-switched", model: currentModel, time: { created: 5 } },
      { id: "msg_006", type: "user", text: "Second question", time: { created: 6 } },
    ]
    const selectionQueries: string[] = []
    const runtimeFetch: typeof fetch = Object.assign(
      async (request: RequestInfo | URL) => {
        const url = new URL(request instanceof Request ? request.url : String(request))
        if (url.pathname.endsWith(`/session/${context.sessionID}`)) {
          return Response.json({
            data: {
              id: context.sessionID,
              projectID: "project",
              agent: "second-agent",
              model: currentModel,
              location: { directory: context.directory },
              time: { created: 0, updated: 6 },
              cost: 0,
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            },
          })
        }
        const single = history.find((message) => url.pathname.endsWith(`/message/${message.id}`))
        if (single) return Response.json({ data: single })
        const encoded = url.searchParams.get("cursor")
        const cursor = encoded
          ? Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String, order: Schema.String }))(
              JSON.parse(Buffer.from(encoded, "base64url").toString()),
            )
          : undefined
        const type = url.searchParams.get("type")
        if (type === "agent-switched" || type === "model-switched") selectionQueries.push(type)
        const ascending = cursor?.order === "asc"
        const filtered = history.filter(
          (message) =>
            (!cursor || (ascending ? message.id > cursor.id : message.id < cursor.id)) &&
            (!type || message.type === type),
        )
        const messages = ascending ? filtered : filtered.toReversed()
        return Response.json({
          data: messages.slice(0, Number(url.searchParams.get("limit"))),
          cursor: {},
        })
      },
      { preconnect: fetch.preconnect },
    )
    const client = OpenCode.make({ baseUrl: "http://gateway.test", fetch: runtimeFetch })
    const first = {
      id: "msg_003",
      agent: "first-agent",
      model: { providerID: "first-provider", modelID: "first-model", variant: "high" },
    }
    const second = {
      id: "msg_006",
      agent: "second-agent",
      model: { providerID: "second-provider", modelID: "second-model", variant: undefined },
    }
    const original = {
      id: "msg_000",
      agent: "original-agent",
      model: { providerID: "original-provider", modelID: "original-model", variant: undefined },
    }
    const full = await listMessages(client, context)
    expect(
      full.items
        .filter((message) => message.info.role === "user")
        .map((message) => Schema.decodeUnknownSync(MessageWithParts)(message).info),
    ).toMatchObject([original, first, second])
    expect(full.items.find((message) => message.info.id === "msg_000_reply")?.info).toMatchObject({
      role: "assistant",
      variant: "default",
    })
    for (const limit of [4, 5]) {
      const page = await listMessages(client, context, { limit })
      expect(page.items.map((message) => message.info)).toMatchObject([first, second])
    }
    expect((await getMessage(client, context, "msg_000"))?.info).toMatchObject(original)
    expect((await getMessage(client, context, "msg_003"))?.info).toMatchObject(first)
    expect((await getMessage(client, context, "msg_006"))?.info).toMatchObject(second)

    const queued: OpenCodeEvent[] = [
      {
        id: "evt_delivered_original",
        created: 0,
        type: "session.inbox.delivered",
        durable: { aggregateID: context.sessionID, seq: 0, version: 1 },
        data: { sessionID: context.sessionID, inboxID: "msg_000" },
      },
      {
        id: "evt_delivered_first",
        created: 3,
        type: "session.inbox.delivered",
        durable: { aggregateID: context.sessionID, seq: 1, version: 1 },
        data: { sessionID: context.sessionID, inboxID: "msg_003" },
      },
      {
        id: "evt_agent",
        created: 4,
        type: "session.agent.selected",
        durable: { aggregateID: context.sessionID, seq: 2, version: 1 },
        data: { sessionID: context.sessionID, agent: "second-agent" },
      },
      {
        id: "evt_model",
        created: 5,
        type: "session.model.selected",
        durable: { aggregateID: context.sessionID, seq: 3, version: 1 },
        data: { sessionID: context.sessionID, model: currentModel },
      },
      {
        id: "evt_delivered_second",
        created: 6,
        type: "session.inbox.delivered",
        durable: { aggregateID: context.sessionID, seq: 4, version: 1 },
        data: { sessionID: context.sessionID, inboxID: "msg_006" },
      },
    ]
    const events: BuddyEvent[] = []
    for await (const event of subscribeBuddyEvents(
      {
        session: client.session,
        message: client.message,
        event: {
          async *subscribe() {
            yield* queued
          },
        },
      },
      context,
    ))
      events.push(event)
    expect(
      events.flatMap((event) =>
        event.payload.type === "message.updated" ? [event.payload.properties.info] : [],
      ),
    ).toMatchObject([original, first, second])

    selectionQueries.length = 0
    const resync: OpenCodeEvent = {
      id: "evt_compacted",
      created: 7,
      type: "session.compaction.ended",
      durable: { aggregateID: context.sessionID, seq: 5, version: 1 },
      data: { sessionID: context.sessionID, reason: "auto", text: "Summary", recent: "Recent" },
    }
    const recovered: BuddyEvent[] = []
    for await (const event of subscribeBuddyEvents(
      {
        session: client.session,
        message: client.message,
        event: {
          async *subscribe() {
            yield resync
          },
        },
      },
      context,
    ))
      recovered.push(event)
    expect(
      recovered.flatMap((event) =>
        event.payload.type === "message.updated" ? [event.payload.properties.info] : [],
      ),
    ).toMatchObject([original, { id: "msg_000_reply", role: "assistant" }, first, second])
    expect(selectionQueries.toSorted()).toEqual(["agent-switched", "model-switched"])
  })

  test("restores each imported turn's selection from its own reply without switch records", async () => {
    const history: SessionMessageInfo[] = [
      { id: "msg_001", type: "user", text: "First question", time: { created: 1 } },
      {
        ...assistant,
        id: "msg_002",
        agent: "buddy-a",
        model: { id: "model-a", providerID: "p" },
        time: { created: 2, completed: 2 },
      },
      { id: "msg_003", type: "user", text: "Second question", time: { created: 3 } },
      {
        ...assistant,
        id: "msg_004",
        agent: "buddy-b",
        model: { id: "model-b", providerID: "p" },
        time: { created: 4, completed: 4 },
      },
    ]
    const runtimeFetch: typeof fetch = Object.assign(
      async (request: RequestInfo | URL) => {
        const url = new URL(request instanceof Request ? request.url : String(request))
        if (url.pathname.endsWith(`/session/${context.sessionID}`)) {
          return Response.json({
            data: {
              id: context.sessionID,
              projectID: "project",
              agent: "buddy-b",
              model: { id: "model-b", providerID: "p" },
              location: { directory: context.directory },
              time: { created: 0, updated: 4 },
              cost: 0,
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            },
          })
        }
        const single = history.find((message) => url.pathname.endsWith(`/message/${message.id}`))
        if (single) return Response.json({ data: single })
        const encoded = url.searchParams.get("cursor")
        const cursor = encoded
          ? Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String, order: Schema.String }))(
              JSON.parse(Buffer.from(encoded, "base64url").toString()),
            )
          : undefined
        const type = url.searchParams.get("type")
        const ascending = cursor?.order === "asc"
        const filtered = history.filter(
          (message) =>
            (!cursor || (ascending ? message.id > cursor.id : message.id < cursor.id)) &&
            (!type || message.type === type),
        )
        const messages = ascending ? filtered : filtered.toReversed()
        return Response.json({
          data: messages.slice(0, Number(url.searchParams.get("limit"))),
          cursor: {},
        })
      },
      { preconnect: fetch.preconnect },
    )
    const client = OpenCode.make({ baseUrl: "http://gateway.test", fetch: runtimeFetch })
    const first = {
      id: "msg_001",
      agent: "buddy-a",
      model: { providerID: "p", modelID: "model-a" },
    }
    const second = {
      id: "msg_003",
      agent: "buddy-b",
      model: { providerID: "p", modelID: "model-b" },
    }

    expect((await getMessage(client, context, "msg_003"))?.info).toMatchObject(second)
    const page = await listMessages(client, context)
    expect(
      page.items.filter((message) => message.info.role === "user").map((message) => message.info),
    ).toMatchObject([first, second])
  })

  describe("imported command turns", () => {
    const history: readonly SessionMessageInfo[] = [
      { id: "msg_001", type: "user", text: "Before", time: { created: 1 } },
      {
        ...assistant,
        id: "msg_002",
        agent: "old-agent",
        model: { providerID: "p", id: "old-model" },
        time: { created: 2, completed: 2 },
        content: [],
      },
      { id: "msg_003", type: "synthetic", text: "Expanded instructions.", time: { created: 3 } },
      {
        ...assistant,
        id: "msg_004",
        agent: "command-agent",
        model: { providerID: "p", id: "command-model" },
        time: { created: 4, completed: 4 },
        content: [],
      },
    ]
    const commandContext = {
      ...context,
      importedCommandDisplay: (id: string) => (id === "msg_003" ? "/quiz bio" : undefined),
    }

    function historyClient(
      queries: (string | null)[] = [],
      contextMessages: readonly SessionMessageInfo[] = history,
    ) {
      const runtimeFetch: typeof fetch = Object.assign(
        async (request: RequestInfo | URL) => {
          const url = new URL(request instanceof Request ? request.url : String(request))
          if (url.pathname.endsWith(`/session/${context.sessionID}/context`))
            return Response.json({ data: contextMessages })
          if (url.pathname.endsWith(`/session/${context.sessionID}`)) {
            return Response.json({
              data: {
                id: context.sessionID,
                projectID: "project",
                agent: "buddy",
                model: { id: "model", providerID: "provider" },
                location: { directory: context.directory },
                time: { created: 0, updated: 4 },
                cost: 0,
                tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              },
            })
          }
          const single = history.find((message) => url.pathname.endsWith(`/message/${message.id}`))
          if (single) return Response.json({ data: single })
          const encoded = url.searchParams.get("cursor")
          const cursor = encoded
            ? Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String, order: Schema.String }))(
                JSON.parse(Buffer.from(encoded, "base64url").toString()),
              )
            : undefined
          const type = url.searchParams.get("type")
          queries.push(type)
          const ascending = cursor?.order === "asc"
          const filtered = history.filter(
            (message) =>
              (!cursor || (ascending ? message.id > cursor.id : message.id < cursor.id)) &&
              (!type || message.type === type),
          )
          const messages = ascending ? filtered : filtered.toReversed()
          return Response.json({
            data: messages.slice(0, Number(url.searchParams.get("limit"))),
            cursor: {},
          })
        },
        { preconnect: fetch.preconnect },
      )
      return OpenCode.make({ baseUrl: "http://gateway.test", fetch: runtimeFetch })
    }

    test.each(["history", "single message", "tool context"])(
      "skips synthetic look-back in %s when no commands were imported",
      async (read) => {
        const queries: (string | null)[] = []
        const client = historyClient(queries, history.slice(-1))
        const host: OpenCodeHost = {
          ...client,
          sessions: client.session,
          events: client.event,
          plugin: Object.assign(async () => {}, client.plugin),
          async close() {},
          async [Symbol.asyncDispose]() {},
        }
        const conversations = createConversations(host, {})
        const messages =
          read === "history"
            ? (await conversations.history(context, { limit: 1 })).items
            : read === "single message"
              ? [await conversations.message(context, "msg_004")]
              : await loadBuddyToolMessages(host, context.directory, context.sessionID)
        expect(messages).toMatchObject([
          { info: { id: "msg_004", role: "assistant", parentID: "msg_001" } },
        ])
        expect(queries.filter((type) => type === "synthetic")).toHaveLength(0)
      },
    )

    test.each([false, true])(
      "uses the cached command record to decide look-back and display text (recorded: %s)",
      async (recorded) => {
        const file = path.join(TEST_SANDBOX.root, `command-displays-${randomUUID()}.db`)
        const db = new Database(file)
        db.exec("CREATE TABLE _buddy_v1_import (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        db.query("INSERT INTO _buddy_v1_import (key, value) VALUES ('commands', ?)").run(
          JSON.stringify(recorded ? [{ messageID: "msg_003", display: "/quiz bio" }] : []),
        )
        db.close()
        const guard = startV1ImportGuard(file)
        try {
          expect(guard.hasCommandDisplays()).toBe(recorded)
          const changed = new Database(file)
          changed.exec("DELETE FROM _buddy_v1_import WHERE key = 'commands'")
          changed.close()
          const guardedContext = {
            ...context,
            importedCommandDisplay: guard.hasCommandDisplays() ? guard.commandDisplay : undefined,
          }
          const queries: (string | null)[] = []
          const client = historyClient(queries)
          const page = await listMessages(client, guardedContext, { limit: 1 })
          expect(page.items).toMatchObject([
            { info: { id: "msg_004", parentID: recorded ? "msg_003" : "msg_001" } },
          ])
          expect(queries.filter((type) => type === "synthetic")).toHaveLength(recorded ? 1 : 0)
          const command = await getMessage(client, guardedContext, "msg_003")
          if (recorded) {
            expect(command).toMatchObject({
              info: { role: "user" },
              parts: [{ type: "text", text: "/quiz bio" }],
            })
          } else {
            expect(command).toBeUndefined()
          }
        } finally {
          await guard.close()
        }
      },
    )

    test.each(["history", "tool context"] as const)(
      "attaches a reply to its imported command in %s",
      async (read) => {
        const client = historyClient()
        const messages =
          read === "history"
            ? (await listMessages(client, commandContext)).items
            : await listContextMessages(client, commandContext)
        expect(messages.find((message) => message.info.id === "msg_004")?.info).toMatchObject({
          role: "assistant",
          parentID: "msg_003",
        })
        expect(
          messages.filter((message) => message.info.role === "user").map((message) => message.info),
        ).toMatchObject([
          { id: "msg_001", agent: "old-agent", model: { providerID: "p", modelID: "old-model" } },
          {
            id: "msg_003",
            agent: "command-agent",
            model: { providerID: "p", modelID: "command-model" },
          },
        ])
        expect(messages.find((message) => message.info.id === "msg_003")?.parts).toMatchObject([
          { type: "text", text: "/quiz bio" },
        ])
      },
    )

    test("restores the imported command's own selection in a single read", async () => {
      const message = await getMessage(historyClient(), commandContext, "msg_003")
      expect(message?.info).toMatchObject({
        role: "user",
        agent: "command-agent",
        model: { providerID: "p", modelID: "command-model" },
      })
    })

    test("attaches a single reply read to its imported command", async () => {
      const message = await getMessage(historyClient(), commandContext, "msg_004")
      expect(message?.info).toMatchObject({ role: "assistant", parentID: "msg_003" })
    })

    test("links a page starting with the imported command's reply to the command", async () => {
      const page = await listMessages(historyClient(), commandContext, { limit: 1 })
      expect(page.items).toMatchObject([
        { info: { id: "msg_004", role: "assistant", parentID: "msg_003" } },
      ])
    })
  })

  test.each([false, true])(
    "keeps a no-reply prompt's admitted selection when a later admission changes it (requested: %s)",
    async (requested) => {
      const initialModel = {
        id: "initial-model",
        providerID: "initial-provider",
        variant: "default",
      }
      const requestedModel = {
        id: "requested-model",
        providerID: "requested-provider",
        variant: "high",
      }
      let session: SessionInfo = {
        id: context.sessionID,
        projectID: "project",
        agent: "initial-agent",
        model: initialModel,
        location: { directory: context.directory },
        time: { created: 0, updated: 0 },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      }
      const native = OpenCode.make({ baseUrl: "http://gateway.test" })
      const client: SessionClient & Pick<EventClient, "event"> = {
        ...native,
        message: { ...native.message, list: async () => ({ data: [], cursor: {} }) },
        session: {
          ...native.session,
          get: async () => session,
          switchAgent: async ({ agent }) => {
            session = { ...session, agent }
          },
          switchModel: async ({ model }) => {
            session = { ...session, model }
          },
          prompt: async (input) => ({
            sessionID: input.sessionID,
            id: input.id ?? "msg_admitted",
            type: "user",
            payload: { text: input.text },
            delivery: "queue",
            time: { created: 1 },
          }),
        },
        event: {
          async *subscribe(input) {
            yield { id: "evt_connected", created: 0, type: "server.connected", data: {} }
            await new Promise<void>((resolve) => {
              if (input?.signal?.aborted) resolve()
              else input?.signal?.addEventListener("abort", () => resolve(), { once: true })
            })
          },
        },
      }
      const selection = requested ? { agent: "requested-agent", model: requestedModel } : undefined
      const result = await promptSession(
        client,
        {
          sessionID: context.sessionID,
          id: "msg_no_reply",
          text: "Save this",
          resume: false,
          ...selection,
        },
        context,
        undefined,
        async () => {
          const later = await admitSessionPrompt(client, {
            sessionID: context.sessionID,
            text: "Later",
            resume: false,
            agent: "later-agent",
            model: { id: "later-model", providerID: "later-provider" },
          })
          expect(later.ok).toBe(true)
        },
      )
      if (!result.ok) throw result.error
      expect(result.value.info).toMatchObject({
        id: "msg_no_reply",
        role: "user",
        agent: requested ? "requested-agent" : "initial-agent",
        model: requested
          ? { providerID: "requested-provider", modelID: "requested-model", variant: "high" }
          : { providerID: "initial-provider", modelID: "initial-model", variant: undefined },
      })
    },
  )

  test("links a page starting with an assistant to the preceding user without including that user", async () => {
    const prompt: SessionMessageInfo = {
      id: "msg_prompt",
      type: "user",
      text: "Question",
      time: { created: 1 },
    }
    const runtimeFetch: typeof fetch = Object.assign(
      async (request: RequestInfo | URL) => {
        const url = new URL(request instanceof Request ? request.url : String(request))
        return Response.json(
          url.searchParams.get("type") === "user"
            ? { data: [prompt], cursor: {} }
            : { data: [assistant], cursor: { next: "older-cursor" } },
        )
      },
      { preconnect: fetch.preconnect },
    )
    const client = OpenCode.make({ baseUrl: "http://gateway.test", fetch: runtimeFetch })
    const page = await listMessages(client, context, { limit: 1 })
    expect(page.items).toMatchObject([
      { info: { id: assistant.id, role: "assistant", parentID: prompt.id } },
    ])
    expect(page.cursor).toBe("older-cursor")
  })

  test.each([
    {
      name: "shell",
      type: "permission.rejected",
      message: "Try a different command",
      outcome: { type: "rejected", message: "Try a different command" },
      reason: "permission-denied",
    },
    {
      name: "read",
      type: "aborted",
      message: "The user declined this tool call",
      outcome: { type: "rejected" },
      reason: "permission-denied",
    },
    {
      name: "read",
      type: "unknown",
      message:
        "The user rejected permission to use this specific tool call with the following feedback: Use the other file",
      outcome: { type: "rejected", message: "Use the other file" },
      reason: "permission-denied",
    },
    {
      name: "question",
      type: "aborted",
      message: "The user dismissed this question",
      outcome: { type: "dismissed" },
      reason: "cancelled",
    },
    {
      name: "question",
      type: "unknown",
      message: "QuestionRejectedError",
      outcome: { type: "dismissed" },
      reason: "cancelled",
    },
    {
      name: "shell",
      type: "aborted",
      message: "Tool execution interrupted: shell",
      outcome: { type: "interrupted" },
      reason: "interrupted",
    },
    {
      name: "shell",
      type: "tool.execution",
      message: "stopped",
      metadata: { interrupted: true },
      outcome: { type: "interrupted" },
      reason: "interrupted",
    },
  ])(
    "preserves $type / $message as a neutral tool outcome through the schema",
    ({ name, type, message: errorMessage, metadata, outcome, reason }) => {
      const message = toBuddyMessage(
        {
          ...assistant,
          content: [
            {
              type: "tool",
              id: "denied",
              name,
              time: { created: 1, completed: 2 },
              state: {
                status: "error",
                input: {},
                metadata,
                error: { type, message: errorMessage },
              },
            },
          ],
        },
        context,
      )
      const projected = Schema.decodeUnknownSync(MessageWithParts)(message)
      expect(projected.parts[0]).toMatchObject({
        state: { status: "error", error: errorMessage, errorType: type, outcome },
        metadata: { buddy: { presentation: { outcome: { type: "neutral", reason } } } },
      })
    },
  )

  test("projects tool output, attachments, presentation, usage, and stable content order", () => {
    const message = toBuddyMessage(assistant, context)
    if (!message) throw new Error("Assistant fixture must map")
    expect(Schema.decodeUnknownSync(MessageWithParts)(message)).toEqual(message)
    expect(message.parts.map((part) => part.position)).toEqual([0, 1, 2])
    expect(message?.parts[2]).toMatchObject({
      tool: "subagent",
      state: {
        status: "completed",
        output: "Result",
        metadata: { sessionID: "ses_child", status: "running" },
        attachments: [{ url: "file:///image.png", filename: "image.png" }],
      },
      subagent: {
        childSessionID: "ses_child",
        description: "Research",
        background: true,
        workerStatus: "running",
      },
      metadata: { buddy: { presentation: { renderer: "task" } } },
    })
    expect(message?.info).toMatchObject({
      role: "assistant",
      order: "msg_assistant",
      finish: "stop",
      cost: 0.25,
      tokens: assistant.tokens,
    })
    const next = toBuddyMessage({ ...assistant, id: "msg_other" }, context)
    expect(next?.parts[2]?.id).not.toBe(message?.parts[2]?.id)
  })

  test("hides synthetic prompt context while retaining sourced and described notices", () => {
    const synthetic: SessionMessageInfo = {
      id: "msg_synthetic",
      type: "synthetic",
      text: "<system-reminder>internal</system-reminder>",
      time: { created: 1 },
    }
    expect(toBuddyMessage(synthetic, context)).toBeUndefined()
    expect(
      toBuddyMessage(
        { ...synthetic, metadata: { source: "subagent", state: "completed" } },
        context,
      ),
    ).toMatchObject({ parts: [{ type: "notice", text: "Subagent completed", source: "subagent" }] })
    expect(toBuddyMessage({ ...synthetic, description: "Shell finished" }, context)).toMatchObject({
      parts: [{ type: "notice", text: "Shell finished" }],
    })
  })

  test("keeps synthetic completion metadata and compaction while omitting hidden timeline entries", () => {
    const synthetic: SessionMessageInfo = {
      id: "msg_notice",
      type: "synthetic",
      text: "<subagent>Result</subagent>",
      description: "Research",
      metadata: { source: "subagent", childID: "ses_child", state: "completed" },
      time: { created: 30 },
    }
    expect(toBuddyMessage(synthetic, context)).toMatchObject({
      info: { kind: "synthetic", metadata: synthetic.metadata },
      parts: [
        { type: "notice", position: 0, text: "Subagent completed: Research", source: "subagent" },
      ],
    })
    const compaction: SessionMessageInfo = {
      id: "msg_compact",
      type: "compaction",
      reason: "auto",
      status: "completed",
      summary: "Context",
      recent: "Recent",
      time: { created: 40 },
    }
    for (const status of ["running", "completed"] as const) {
      const mapped = Schema.decodeUnknownSync(MessageWithParts)(
        toBuddyMessage({ ...compaction, status }, context),
      )
      expect(mapped).toMatchObject({
        info: { kind: "compaction" },
        parts: [
          {
            type: "compaction",
            position: 0,
            auto: true,
            status,
            summary: "Context",
            recent: "Recent",
          },
        ],
      })
      expect(mapped.info.role === "assistant" ? mapped.info.finish : undefined).toBe(
        status === "completed" ? "stop" : undefined,
      )
    }
    expect(
      toBuddyMessage(
        { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 50 } },
        context,
      ),
    ).toBeUndefined()
    expect(
      toBuddyMessage(
        { id: "msg_system", type: "system", text: "Instruction", time: { created: 50 } },
        context,
      ),
    ).toBeUndefined()
  })

  test("maps user files and preserves visibility metadata without inventing a historical model", () => {
    const mapped = toBuddyMessage(
      {
        id: "msg_user",
        type: "user",
        text: "Hello",
        metadata: { hiddenFromUser: true },
        files: [
          {
            data: "aGVsbG8=",
            mime: "text/plain",
            source: { type: "inline" },
            name: "hello.txt",
            mention: { text: "Hello", start: 0, end: 5 },
          },
        ],
        time: { created: 1 },
      },
      context,
    )
    expect(mapped).toMatchObject({
      info: {
        role: "user",
        order: "msg_user",
        model: { modelID: "", providerID: "" },
        metadata: { hiddenFromUser: true },
      },
      parts: [
        { type: "text", position: 0, text: "Hello" },
        {
          type: "file",
          position: 1,
          url: "data:text/plain;base64,aGVsbG8=",
          source: { type: "inline", text: { value: "Hello", start: 0, end: 5 } },
        },
      ],
    })
  })

  const toolCases: readonly {
    readonly names: readonly string[]
    readonly input: Extract<SessionMessageAssistantTool["state"], { status: "completed" }>["input"]
    readonly metadata?: Extract<
      SessionMessageAssistantTool["state"],
      { status: "completed" }
    >["metadata"]
    readonly compacted?: number
    readonly content?: Extract<
      SessionMessageAssistantTool["state"],
      { status: "completed" }
    >["content"]
    readonly errorContent?: Extract<
      SessionMessageAssistantTool["state"],
      { status: "error" }
    >["content"]
    readonly sourceText?: string
    readonly errorSourceText?: string
    readonly pending?: object
    readonly running?: object
    readonly error?: object
    readonly liveOutput?: string
    readonly expected: object
  }[] = [
    {
      names: ["read"],
      input: { filePath: "/workspace/a.ts", offset: 2, limit: 10 },
      expected: {
        summary: {
          kind: "read-file",
          subject: "/workspace/a.ts",
          args: [
            { name: "offset", value: 2 },
            { name: "limit", value: 10 },
          ],
          result: { unit: "characters", count: 6 },
        },
        filesChanged: false,
      },
    },
    {
      names: ["edit"],
      input: { filePath: "/workspace/a.ts", oldString: "old", newString: "new" },
      metadata: {
        filediff: {
          file: "/workspace/a.ts",
          before: "whole old",
          after: "whole new",
          patch: "@@ patch",
          additions: 1,
          deletions: 1,
        },
      },
      expected: {
        summary: { kind: "edit-file", subject: "/workspace/a.ts" },
        filesChanged: true,
        fileChanges: [
          {
            path: "/workspace/a.ts",
            kind: "update",
            before: "whole old",
            after: "whole new",
            patch: "@@ patch",
            additions: 1,
            deletions: 1,
          },
        ],
      },
    },
    {
      names: ["write"],
      input: { filePath: "/workspace/a.ts", content: "" },
      metadata: { filepath: "/workspace/resolved.ts" },
      expected: {
        summary: { kind: "write-file", subject: "/workspace/a.ts" },
        filesChanged: true,
        fileChanges: [{ path: "/workspace/resolved.ts", content: "" }],
      },
    },
    {
      names: ["write"],
      input: { filePath: "/workspace/a.ts", content: "saved" },
      compacted: 0,
      expected: { filesChanged: false },
    },
    {
      names: ["patch", "apply_patch"],
      input: { description: "Update files" },
      metadata: {
        files: [
          { file: "a.ts", status: "modified", patch: "@@ native", additions: 2, deletions: 1 },
          {
            filePath: "/workspace/b.ts",
            relativePath: "b.ts",
            type: "move",
            diff: "@@ legacy",
            before: "old",
            after: "new",
          },
          { filePath: "/workspace/c.ts", type: "delete", before: "gone", after: "" },
          null,
        ],
      },
      expected: {
        summary: { kind: "change-files", subject: "Update files" },
        filesChanged: true,
        fileChanges: [
          {
            path: "/workspace/a.ts",
            relativePath: "a.ts",
            kind: "update",
            patch: "@@ native",
            additions: 2,
            deletions: 1,
          },
          {
            path: "/workspace/b.ts",
            relativePath: "b.ts",
            kind: "move",
            patch: "@@ legacy",
            before: "old",
            after: "new",
          },
          { path: "/workspace/c.ts", kind: "delete", before: "gone", after: "" },
        ],
      },
    },
    {
      names: ["patch", "apply_patch"],
      input: {
        patchText:
          "*** Begin Patch\r\n*** Update File: old.ts\r\n*** Move to: nested/new.ts\r\n@@\r\n-old\r\n+new\r\n*** Update File: same.ts\r\n@@\r\n-old\r\n+new\r\n*** End Patch",
      },
      metadata: {
        files: [
          { file: "nested/new.ts", status: "modified" },
          { file: "/workspace/same.ts", status: "modified" },
        ],
      },
      expected: {
        fileChanges: [
          { path: "/workspace/nested/new.ts", kind: "move" },
          { path: "/workspace/same.ts", kind: "update" },
        ],
      },
    },
    {
      names: ["shell"],
      input: { command: "bun run build" },
      metadata: { shellID: "sh_native" },
      liveOutput: "Compiling",
      running: {
        shell: { command: "bun run build", output: "Compiling" },
        metadata: { shellID: "sh_native" },
      },
      expected: { shell: { command: "bun run build", output: "Result" } },
    },
    {
      names: ["shell", "bash"],
      input: { description: "Build", command: "bun run build" },
      metadata: { command: "ignored", output: "Building" },
      errorContent: [
        { type: "text", text: "" },
        { type: "text", text: "Build failed" },
      ],
      errorSourceText: "Failed\nBuild failed",
      pending: { shell: { command: "bun run build" } },
      running: { shell: { command: "bun run build", output: "Building" } },
      error: { shell: { command: "bun run build", output: "\nBuild failed" } },
      expected: {
        shell: { command: "bun run build", output: "Result" },
        summary: { kind: "run-command", subject: "Build", result: { unit: "command" } },
        filesChanged: true,
      },
    },
    {
      names: ["shell"],
      input: { command: "" },
      metadata: { command: "ignored", output: "earlier output" },
      content: [{ type: "text", text: "" }],
      expected: { shell: { command: "", output: "" } },
    },
    {
      names: ["list"],
      input: { path: "/workspace/src" },
      expected: {
        summary: {
          kind: "list-files",
          subject: "/workspace/src",
          result: { unit: "matches", count: 1 },
        },
        filesChanged: false,
      },
    },
    {
      names: ["glob"],
      input: { pattern: "*.ts", path: "/workspace" },
      expected: {
        summary: {
          kind: "find-files",
          subject: "*.ts",
          detail: "/workspace",
          args: [{ name: "path", value: "/workspace" }],
          result: { unit: "matches", count: 1 },
        },
      },
    },
    {
      names: ["grep"],
      input: { pattern: "needle", include: "*.ts", path: "/workspace" },
      expected: {
        summary: {
          kind: "search-files",
          subject: "needle",
          detail: "/workspace",
          args: [
            { name: "include", value: "*.ts" },
            { name: "path", value: "/workspace" },
          ],
          result: { unit: "matches", count: 1 },
        },
      },
    },
    {
      names: ["webfetch"],
      input: { url: "https://example.test", format: "markdown" },
      pending: {
        summary: { subject: "https://example.test", args: [{ name: "format", value: "markdown" }] },
      },
      running: {
        summary: { subject: "https://example.test", args: [{ name: "format", value: "markdown" }] },
      },
      error: {
        summary: { subject: "https://example.test", args: [{ name: "format", value: "markdown" }] },
      },
      expected: {
        summary: {
          kind: "fetch-url",
          subject: "https://example.test",
          args: [{ name: "format", value: "markdown" }],
        },
      },
    },
    {
      names: ["websearch"],
      input: { query: "Buddy" },
      expected: {
        summary: { kind: "search-web", subject: "Buddy", result: { unit: "matches", count: 1 } },
      },
    },
    {
      names: ["codesearch"],
      input: { query: "Buddy" },
      expected: {
        summary: { kind: "search-code", subject: "Buddy", result: { unit: "matches", count: 1 } },
      },
    },
    {
      names: ["task", "subagent"],
      input: { description: "Research", agent: "reader" },
      expected: { summary: { kind: "delegate", subject: "Research", agent: "reader" } },
    },
    {
      names: ["question"],
      input: {
        questions: [
          {
            question: "Which?",
            header: "Choice",
            options: [{ label: "A", description: "First" }],
            multiple: true,
          },
          { question: "Why?", options: [] },
        ],
      },
      metadata: { answers: [["A"], []] },
      pending: {
        questions: [
          {
            text: "Which?",
            header: "Choice",
            options: [{ label: "A", description: "First" }],
            multiple: true,
          },
          { text: "Why?", options: [] },
        ],
      },
      running: { questions: [{ answers: ["A"] }, { answers: [] }] },
      error: {
        questions: [
          { text: "Which?", answers: ["A"] },
          { text: "Why?", answers: [] },
        ],
      },
      expected: {
        summary: { kind: "ask-questions" },
        questions: [
          {
            text: "Which?",
            header: "Choice",
            options: [{ label: "A", description: "First" }],
            multiple: true,
            answers: ["A"],
          },
          { text: "Why?", options: [], answers: [] },
        ],
      },
    },
    {
      names: ["todowrite"],
      input: { todos: [{ content: " Draft ", status: "running", priority: "high" }] },
      metadata: {
        todos: [
          { content: "Ship", status: "done", priority: "low" },
          { content: "Drop", status: "skipped" },
          { content: "Later", status: "unknown" },
          null,
        ],
      },
      pending: { todos: [{ text: "Draft", status: "in_progress", priority: "high" }] },
      running: {
        todos: [
          { text: "Ship", status: "completed", priority: "low" },
          { text: "Drop", status: "cancelled" },
          { text: "Later", status: "pending" },
        ],
      },
      error: {
        todos: [
          { text: "Ship", status: "completed" },
          { text: "Drop", status: "cancelled" },
          { text: "Later", status: "pending" },
        ],
      },
      expected: {
        summary: { kind: "update-plan" },
        todos: [
          { text: "Ship", status: "completed", priority: "low" },
          { text: "Drop", status: "cancelled" },
          { text: "Later", status: "pending" },
        ],
      },
    },
    {
      names: ["todowrite"],
      input: { todos: [{ content: "Stale" }] },
      metadata: { todos: [] },
      expected: { todos: [] },
    },
    {
      names: ["skill"],
      input: { name: "writing" },
      metadata: { name: " displayed " },
      content: [
        { type: "text", text: '<skill_content name="tagged">\nInstructions\n</skill_content>' },
      ],
      pending: { summary: { subject: "writing" } },
      running: { summary: { subject: "displayed" } },
      error: { summary: { subject: "displayed" } },
      expected: {
        summary: { kind: "use-skill", subject: "displayed" },
        skillContent: "Instructions",
      },
    },
    {
      names: ["skill"],
      input: { id: "native-id" },
      content: [{ type: "text", text: '<skill_content name="from-output"></skill_content>' }],
      expected: { summary: { kind: "use-skill", subject: "from-output" }, skillContent: "" },
    },
    {
      names: ["patch", "apply_patch"],
      input: {},
      metadata: { files: [{ relativePath: "notes.md" }] },
      expected: { fileChanges: [{ path: "/workspace/notes.md", relativePath: "notes.md" }] },
    },
    {
      names: ["read"],
      input: {},
      content: [
        { type: "text", text: "" },
        { type: "file", name: "image.png", mime: "image/png", uri: "file:///image.png" },
      ],
      sourceText: "\nimage.png image/png file:///image.png",
      expected: { output: "" },
    },
  ]

  test.each([...toolCases])(
    "normalizes the $names tool family through the transcript schema",
    ({
      names,
      input,
      metadata,
      compacted,
      content,
      errorContent,
      sourceText,
      errorSourceText,
      pending,
      running,
      error,
      liveOutput,
      expected,
    }) => {
      const messageContext = {
        ...context,
        shellOutput:
          liveOutput === undefined
            ? undefined
            : new Map([["sh_native", { output: liveOutput, cursor: 9 }]]),
      }
      for (const name of names) {
        const time = { created: 1, completed: 2, compacted }
        const message = toBuddyMessage(
          {
            ...assistant,
            content: [
              {
                type: "tool",
                id: "call",
                name,
                time,
                state: {
                  status: "completed",
                  input,
                  metadata,
                  content: content ?? [{ type: "text", text: "Result" }],
                },
              },
            ],
          },
          messageContext,
        )
        const projected = Schema.decodeUnknownSync(MessageWithParts)(message)
        expect(projected.parts[0]).toMatchObject({ position: 0, state: expected })
        expect(projected.parts[0]?.sourceText).toBe(sourceText)
        const states: readonly [SessionMessageAssistantTool["state"], object | undefined][] = [
          [{ status: "streaming", input: JSON.stringify(input) }, pending],
          [{ status: "running", input, metadata: metadata ?? {} }, running],
          [
            {
              status: "error",
              input,
              metadata,
              content: errorContent,
              error: { type: "tool.execution", message: "Failed" },
            },
            error,
          ],
        ]
        for (const [state, expectedState] of states) {
          if (!expectedState) continue
          const projected = Schema.decodeUnknownSync(MessageWithParts)(
            toBuddyMessage(
              { ...assistant, content: [{ type: "tool", id: "call", name, time, state }] },
              messageContext,
            ),
          )
          expect(projected.parts[0]).toMatchObject({ state: expectedState })
          expect(projected.parts[0]?.sourceText).toBe(
            state.status === "error" ? errorSourceText : undefined,
          )
        }
      }
    },
  )

  test("uses grep match metadata before counting formatted output lines", () => {
    const output = "Found 1 matches\n/workspace/a.ts:\n  Line 1: needle"
    for (const { metadata, text, count } of [
      { metadata: { matches: 1 }, text: output, count: 1 },
      { metadata: { matches: 0 }, text: "No matches found", count: 0 },
      { metadata: {}, text: output, count: 3 },
    ]) {
      const message = toBuddyMessage(
        {
          ...assistant,
          content: [
            {
              type: "tool",
              id: "grep-call",
              name: "grep",
              time: { created: 1, completed: 2 },
              state: {
                status: "completed",
                input: { pattern: "needle" },
                metadata,
                content: [{ type: "text", text }],
              },
            },
          ],
        },
        context,
      )
      const projected = Schema.decodeUnknownSync(MessageWithParts)(message)
      expect(projected.parts[0]).toMatchObject({
        state: { summary: { kind: "search-files", result: { unit: "matches", count } } },
      })
    }
  })

  test("follows v2 opaque cursors without also sending order and skips pages with only hidden entries", async () => {
    const queries: URLSearchParams[] = []
    const runtimeFetch: typeof fetch = Object.assign(
      async (request: RequestInfo | URL) => {
        const url = new URL(request instanceof Request ? request.url : String(request))
        if (url.searchParams.get("type") === "user") return Response.json({ data: [], cursor: {} })
        queries.push(url.searchParams)
        if (!url.searchParams.has("cursor"))
          return Response.json({
            data: [{ id: "msg_system", type: "system", text: "Hidden", time: { created: 40 } }],
            cursor: { next: "opaque-cursor" },
          })
        return Response.json({ data: [assistant], cursor: { next: "older-cursor" } })
      },
      { preconnect: fetch.preconnect },
    )
    const client = OpenCode.make({ baseUrl: "http://gateway.test", fetch: runtimeFetch })
    const page = await listMessages(client, context, { limit: 2 })
    expect(page.items).toHaveLength(1)
    expect(page.cursor).toBe("older-cursor")
    expect(queries[0]?.get("order")).toBe("desc")
    expect(queries[1]?.get("cursor")).toBe("opaque-cursor")
    expect(queries[1]?.has("order")).toBe(false)
  })
})
