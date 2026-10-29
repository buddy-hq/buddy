import { expect, test } from "bun:test"
import type { SessionHooks } from "@opencode/plugin/promise/session"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Session } from "@opencode/schema/session"
import { createToolInputObserver } from "../src/extension/tool-input-wire"
import { createToolInputTap, registerToolInputStream } from "../src/extension/tool-input-stream"

const flagged = new Set(["whiteboard_create_view"])

test("Responses arguments use the public call ID and, like the native parser, ignore a delta without an item ID", () => {
  const observe = createToolInputObserver(flagged)
  const events = [
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_wire",
        call_id: "call_runner",
        name: "whiteboard_create_view",
        arguments: "",
      },
    },
    {
      type: "response.output_item.added",
      output_index: 1,
      item: {
        type: "function_call",
        id: "fc_other",
        call_id: "call_other",
        name: "read",
        arguments: "",
      },
    },
    { type: "response.function_call_arguments.delta", item_id: "fc_wire", delta: '{"elements":' },
    { type: "response.function_call_arguments.delta", output_index: 0, delta: '"😀"}' },
    { type: "response.function_call_arguments.delta", item_id: "fc_other", delta: "ignored" },
    {
      type: "response.function_call_arguments.done",
      item_id: "fc_wire",
      arguments: '{"elements":"😀"}',
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_wire",
        call_id: "call_runner",
        name: "whiteboard_create_view",
        arguments: '{"elements":"😀"}',
      },
    },
  ]
  expect(observe("{function_call broken")).toEqual([])
  expect(events.flatMap((event) => observe(JSON.stringify(event)))).toEqual([
    { callID: "call_runner", delta: '{"elements":' },
  ])
})

test("Responses output slots override conflicting item IDs and resolve missing item IDs", () => {
  const observe = createToolInputObserver(flagged)
  const events = [
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_first",
        call_id: "call_first",
        name: "whiteboard_create_view",
      },
    },
    {
      type: "response.output_item.added",
      output_index: 1,
      item: {
        type: "function_call",
        id: "fc_second",
        call_id: "call_second",
        name: "whiteboard_create_view",
      },
    },
    {
      type: "response.output_item.added",
      output_index: 1,
      item: { type: "function_call", call_id: "call_second", name: "whiteboard_create_view" },
    },
    {
      type: "response.output_item.added",
      output_index: 2,
      item: { type: "function_call", call_id: "call_generated", name: "whiteboard_create_view" },
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: 1,
      item_id: "fc_first",
      delta: "second",
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: 3,
      item_id: "fc_first",
      delta: "first",
    },
    { type: "response.function_call_arguments.delta", item_id: "fc_second", delta: "second again" },
    {
      type: "response.function_call_arguments.delta",
      output_index: 2,
      item_id: "unknown_generated_id",
      delta: "generated",
    },
  ]
  expect(events.flatMap((event) => observe(JSON.stringify(event)))).toEqual([
    { callID: "call_second", delta: "second" },
    { callID: "call_first", delta: "first" },
    { callID: "call_second", delta: "second again" },
    { callID: "call_generated", delta: "generated" },
  ])
})

test("Responses recycled item keys yield the new call's initial arguments and deltas", () => {
  const observe = createToolInputObserver(flagged)
  const events = [
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_reused",
        call_id: "call_first",
        name: "whiteboard_create_view",
        arguments: "first",
      },
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_reused",
        call_id: "call_first",
        name: "whiteboard_create_view",
        arguments: "first",
      },
    },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_reused",
        call_id: "call_second",
        name: "whiteboard_create_view",
        arguments: '{"elements":[',
      },
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: 0,
      item_id: "fc_reused",
      delta: "]}",
    },
  ]
  expect(events.flatMap((event) => observe(JSON.stringify(event)))).toEqual([
    { callID: "call_first", delta: "first" },
    { callID: "call_second", delta: '{"elements":[' },
    { callID: "call_second", delta: "]}" },
  ])
})

test("Responses initial arguments precede subsequent deltas", () => {
  const observe = createToolInputObserver(flagged)
  const events = [
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_board",
        call_id: "call_board",
        name: "whiteboard_create_view",
        arguments: '{"elements":[',
      },
    },
    {
      type: "response.output_item.added",
      output_index: 1,
      item: {
        type: "function_call",
        id: "fc_read",
        call_id: "call_read",
        name: "read",
        arguments: '{"path":',
      },
    },
    { type: "response.function_call_arguments.delta", item_id: "fc_board", delta: "]}" },
  ]
  expect(events.flatMap((event) => observe(JSON.stringify(event)))).toEqual([
    { callID: "call_board", delta: '{"elements":[' },
    { callID: "call_board", delta: "]}" },
  ])
})

test("Responses created clears previous response item and output-slot identities", () => {
  const observe = createToolInputObserver(flagged)
  expect(
    observe(
      JSON.stringify({
        type: "response.output_item.added",
        output_index: 0,
        item: {
          type: "function_call",
          id: "fc_old",
          call_id: "call_old",
          name: "whiteboard_create_view",
          arguments: "first response",
        },
      }),
    ),
  ).toEqual([{ callID: "call_old", delta: "first response" }])
  expect(
    observe(JSON.stringify({ type: "response.created", response: { id: "resp_next" } })),
  ).toEqual([])
  expect(
    observe(
      JSON.stringify({
        type: "response.function_call_arguments.delta",
        item_id: "fc_old",
        delta: "stale item",
      }),
    ),
  ).toEqual([])
  expect(
    observe(
      JSON.stringify({
        type: "response.function_call_arguments.delta",
        output_index: 0,
        item_id: "unknown",
        delta: "stale slot",
      }),
    ),
  ).toEqual([])
  expect(
    observe(
      JSON.stringify({
        type: "response.output_item.added",
        output_index: 0,
        item: {
          type: "function_call",
          id: "fc_old",
          call_id: "call_new",
          name: "whiteboard_create_view",
          arguments: "new response",
        },
      }),
    ),
  ).toEqual([{ callID: "call_new", delta: "new response" }])
})

test("Anthropic interleaved tool blocks yield only flagged JSON fragments", () => {
  const observe = createToolInputObserver(flagged)
  const events = [
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id: "toolu_other", name: "read", input: {} },
    },
    {
      type: "content_block_start",
      index: 1,
      content_block: {
        type: "tool_use",
        id: "toolu_board",
        name: "whiteboard_create_view",
        input: {},
      },
    },
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '{"elements":' },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: '{"path":"x"}' },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '"[]"}' },
    },
    { type: "content_block_stop", index: 1 },
  ]
  expect(events.flatMap((event) => observe(JSON.stringify(event)))).toEqual([
    { callID: "toolu_board", delta: '{"elements":' },
    { callID: "toolu_board", delta: '"[]"}' },
  ])
})

function chat(
  tool_calls: {
    index?: number | null
    id?: string | null
    function?: { name?: string | null; arguments?: string | null } | null
  }[],
) {
  return JSON.stringify({
    choices: [
      { index: 0, delta: { tool_calls } },
      {
        index: 1,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "wrong_choice",
              function: { name: "whiteboard_create_view", arguments: "ignored" },
            },
          ],
        },
      },
    ],
  })
}

test("Chat buffers argument fragments until identity is known and reads the first choice", () => {
  const observe = createToolInputObserver(flagged)

  expect(observe(chat([{ index: 0, function: { arguments: '{"elements":' } }]))).toEqual([])
  expect(observe(chat([{ index: 0, id: "call_board", function: { arguments: '"[' } }]))).toEqual([])
  expect(
    observe(chat([{ index: 0, function: { name: "whiteboard_create_view", arguments: ']"}' } }])),
  ).toEqual([
    { callID: "call_board", delta: '{"elements":' },
    { callID: "call_board", delta: '"[' },
    { callID: "call_board", delta: ']"}' },
  ])
  expect(
    observe(
      chat([
        { index: 0, function: { arguments: "later" } },
        { index: 1, function: { arguments: "ignored" } },
      ]),
    ),
  ).toEqual([{ callID: "call_board", delta: "later" }])
  expect(observe(chat([{ index: 1, id: "call_read", function: { name: "read" } }]))).toEqual([])
  expect(
    observe(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ functionCall: { name: "whiteboard_create_view", args: {} } }] } },
        ],
      }),
    ),
  ).toEqual([])
})

test("Chat recovers missing indexes and accepts nullable Venice DeepSeek continuations", () => {
  const observe = createToolInputObserver(flagged)
  const events = [
    [{ function: { arguments: '{"elements":' } }],
    [{ index: null, id: "call_first", function: { name: "", arguments: "" } }],
    [
      {
        id: "call_second",
        function: { name: "whiteboard_create_view", arguments: '{"elements":[' },
      },
    ],
    [{ id: "call_first", function: { name: "whiteboard_create_view", arguments: "[" } }],
    [{ index: 0, id: null, function: { arguments: "", name: null } }],
    [{ id: null, function: null }],
    [{ id: "call_second", function: { name: null, arguments: '{"id":"a"}' } }],
    [{ index: null, id: null, function: { name: null, arguments: ',{"id":"b"}' } }],
    [{ id: "", function: { name: "", arguments: null } }],
    [{ function: { arguments: "]}" } }, { function: { arguments: "]}" } }],
  ]
  expect(events.flatMap((event) => observe(chat(event)))).toEqual([
    { callID: "call_second", delta: '{"elements":[' },
    { callID: "call_first", delta: '{"elements":' },
    { callID: "call_first", delta: "[" },
    { callID: "call_second", delta: '{"id":"a"}' },
    { callID: "call_second", delta: ',{"id":"b"}' },
    { callID: "call_first", delta: "]}" },
    { callID: "call_second", delta: "]}" },
  ])
})

test("SSE tap preserves bytes and fragments with LF, bare CR and split CRLF framing", async () => {
  const original = [
    ': comment\r\nevent: message\r\nid: ignored\r\ndata: {"choices":[{"delta":\r\ndata: {"tool_calls":[{"index":0,"id":"call_board","function":{"name":"whiteboard_create_view","arguments":"😀"}}]}}]}\r\n\r\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"tail"}}]}}]}\n\n',
    "data:\r\n\r\ndata: [DONE]\r\n\r\n",
  ].join("")
  const lf = original.replaceAll("\r\n", "\n")
  for (const data of [original, lf, lf.replaceAll("\n", "\r"), lf.replaceAll("\n", "\r\n")]) {
    const bytes = new TextEncoder().encode(data)
    const fragments: { callID: string; delta: string }[] = []
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
        controller.close()
      },
    })
    const output = await new Response(
      source.pipeThrough(
        createToolInputTap(flagged, async (fragment) => {
          fragments.push(fragment)
        }),
      ),
    ).arrayBuffer()
    expect(new Uint8Array(output)).toEqual(bytes)
    expect(fragments).toEqual([
      { callID: "call_board", delta: "😀" },
      { callID: "call_board", delta: "tail" },
    ])
  }
})

test("SSE tap stops observing oversized unfinished lines and events while preserving bytes", async () => {
  const valid = `data: ${chat([{ index: 0, id: "call_board", function: { name: "whiteboard_create_view", arguments: "visible" } }])}\n\n`
  const keepalives = ": keepalive\n".repeat(1024)
  const dataLines = `data: ${" ".repeat(8192)}\n`
  const cases = [
    [": oversized ", "x".repeat(1024 * 1024), "\n\n"],
    [...Array.from({ length: 86 }, () => keepalives), "\n"],
    [...Array.from({ length: 128 }, () => dataLines), "\n"],
  ]
  for (const oversized of cases) {
    const chunks = [valid, ...oversized, valid]
    const fragments: { callID: string; delta: string }[] = []
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
        controller.close()
      },
    })
    const output = await new Response(
      source.pipeThrough(
        createToolInputTap(flagged, async (fragment) => {
          fragments.push(fragment)
        }),
      ),
    ).text()
    expect(output).toBe(chunks.join(""))
    expect(fragments).toEqual([{ callID: "call_board", delta: "visible" }])
  }
})

test("carrier rejection stops observing and preserves the model bytes", async () => {
  const data =
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_board","function":{"name":"whiteboard_create_view","arguments":"first"}}]}}]}\n\ndata: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"second"}}]}}]}\n\n'
  const attempted: string[] = []
  const source = new Response(data).body
  if (!source) throw new Error("Missing source")
  const output = await new Response(
    source.pipeThrough(
      createToolInputTap(flagged, async ({ delta }) => {
        attempted.push(delta)
        throw new Error("Must not log the fragment")
      }),
    ),
  ).text()
  expect(output).toBe(data)
  expect(attempted).toEqual(["first"])
})

function sessionHookRegistry<Hooks>() {
  const hooks: { [Name in keyof Hooks]?: (event: Hooks[Name]) => Promise<void> | void } = {}
  return {
    hooks,
    async hook<Name extends keyof Hooks>(
      name: Name,
      callback: (event: Hooks[Name]) => Promise<void> | void,
    ) {
      hooks[name] = callback
      return {
        async dispose() {
          delete hooks[name]
        },
      }
    },
  }
}

test("WebSocket observation resumes with fresh call state after a rejected response", async () => {
  const session = sessionHookRegistry<SessionHooks>()
  const published: unknown[] = []
  let reject = true
  await registerToolInputStream(
    {
      session,
      rpc: {
        async register() {
          return {
            async dispose() {},
            events: {
              async emit(...args) {
                if (reject) {
                  reject = false
                  throw new Error("Carrier unavailable")
                }
                published.push(args[1])
              },
            },
          }
        },
      },
    },
    [
      {
        id: "whiteboard_create_view",
        description: "Whiteboard",
        streamInput: true,
        jsonSchema: { type: "object" },
        async run() {
          throw new Error("Unexpected tool execution")
        },
      },
    ],
  )
  const receive = session.hooks["experimental.ws.receive"]
  if (!receive) throw new Error("Missing WebSocket hook")
  const events = [
    { type: "response.created", response: { id: "resp_first" } },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_old",
        call_id: "call_old",
        name: "whiteboard_create_view",
      },
    },
    { type: "response.function_call_arguments.delta", item_id: "fc_old", delta: "rejected" },
    { type: "response.function_call_arguments.delta", item_id: "fc_old", delta: "stopped" },
    { type: "response.created", response: { id: "resp_second" } },
    { type: "response.function_call_arguments.delta", item_id: "fc_old", delta: "stale" },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_new",
        call_id: "call_new",
        name: "whiteboard_create_view",
      },
    },
    { type: "response.function_call_arguments.delta", item_id: "fc_new", delta: "published" },
  ]
  for (const frame of events.map((event) => JSON.stringify(event))) {
    const event = {
      sessionID: Session.ID.make("ses_board"),
      agent: Agent.ID.make("buddy"),
      model: Model.Ref.parse("provider/model"),
      kind: "primary" as const,
      frame,
    }
    await receive(event)
    expect(event.frame).toBe(frame)
  }
  expect(published).toEqual([{ sessionID: "ses_board", callID: "call_new", delta: "published" }])
})
