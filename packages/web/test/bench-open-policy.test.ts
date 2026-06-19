import { describe, expect, test } from "bun:test"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  htmlWidgetAutoOpenKey,
  readLatestBenchAction,
  readLatestBenchAutoOpenCandidate,
} from "../src/components/bench/bench-open-policy"
import type { AssistantMessageInfo, MessageWithParts } from "../src/state/chat-types"

function createAssistantMessage(
  parts: MessageWithParts["parts"],
  info: Partial<AssistantMessageInfo> = {},
): MessageWithParts {
  return {
    info: {
      id: "message-1",
      sessionID: "session-1",
      role: "assistant",
      parentID: "message-0",
      time: { created: 1 },
      mode: "buddy",
      agent: "buddy",
      modelID: "model-1",
      providerID: "provider-1",
      path: { cwd: "", root: "" },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      ...info,
    },
    parts,
  }
}

function createHtmlWidgetPart(input: {
  objectID: string
  preset: "compact_4_3" | "standard_16_10" | "wide_16_9" | "square" | "tall_mobile"
}) {
  const ref = {
    kind: "html-widget",
    objectID: input.objectID,
    revisionID: null,
    itemID: null,
  } as const

  return {
    id: `part-${input.objectID}`,
    sessionID: "session-1",
    messageID: "message-1",
    type: "tool",
    tool: "present_html_widget",
    state: {
      status: "completed",
      input: {},
      output: "",
      title: "Present widget",
      time: { start: 1, end: 2 },
      metadata: {
        buddyObjectResult: {
          version: 1,
          status: "ok",
          reason: null,
          message: "Presented HTML widget.",
          primaryRef: ref,
          objects: [
            {
              kind: "html-widget",
              objectID: input.objectID,
              title: "Stress Test Widget",
              status: "ready",
              lifecycle: "live",
              sourceRoot: ".buddy/objects/v1/html-widget/widget-1/source",
            },
          ],
          presentations: [
            {
              ref,
              viewID: "runtime",
              surface: "bench",
              data: null,
              autoOpen:
                input.preset === "standard_16_10" || input.preset === "wide_16_9"
                  ? {
                      policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
                      eventKey: htmlWidgetAutoOpenKey(input.objectID),
                    }
                  : null,
            },
          ],
        },
      },
    },
  } satisfies MessageWithParts["parts"][number]
}

function createBenchObjectTarget(input: {
  kind: "html-widget" | "whiteboard"
  objectID: string
  viewID: "runtime" | "current"
}) {
  return {
    type: "object",
    ref: {
      kind: input.kind,
      objectID: input.objectID,
      revisionID: null,
      itemID: null,
    },
    viewID: input.viewID,
  } as const
}

function createWorkspaceFileTarget(input: { path: string; viewer: "markdown" | "file" }) {
  return {
    type: "workspace-file",
    path: input.path,
    viewer: input.viewer,
  } as const
}

function createBenchPresentMetadata(input: {
  status: "presented" | "already_presenting" | "closed" | "blocked"
  target?: Record<string, unknown> | null
}) {
  if (input.status === "closed") {
    return {
      benchAction: "close",
      benchStatus: "closed",
      reason: "closed_by_request",
      benchTarget: null,
    }
  }

  return {
    benchAction: "open",
    benchStatus: input.status,
    reason: input.status === "blocked" ? "blocked" : "presented_file",
    benchTarget: input.target ?? null,
  }
}

function createBenchPresentPart(input: {
  status: "presented" | "already_presenting" | "closed" | "blocked"
  target?: Record<string, unknown> | null
}) {
  return {
    id: "part-bench-present",
    sessionID: "session-1",
    messageID: "message-1",
    type: "tool",
    tool: "bench_present",
    state: {
      status: "completed",
      input: {},
      output: "ok",
      title: "Bench Presentation",
      time: { start: 1, end: 2 },
      metadata: createBenchPresentMetadata(input),
    },
  } satisfies MessageWithParts["parts"][number]
}

describe("bench open policy", () => {
  test("identifies active whiteboard work as an auto-open candidate", () => {
    const candidate = readLatestBenchAutoOpenCandidate([
      createAssistantMessage([
        {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "running",
            input: {},
            time: { start: 1 },
            metadata: {
              benchAutoOpenCandidate: {
                policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
                eventKey: "whiteboard:session-1:message-1:part-1",
                target: createBenchObjectTarget({
                  kind: "whiteboard",
                  objectID: "whiteboard-1",
                  viewID: "current",
                }),
              },
            },
          },
        },
      ]),
    ])

    expect(candidate).toMatchObject({
      policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
      eventKey: "whiteboard:session-1:message-1:part-1",
      target: createBenchObjectTarget({
        kind: "whiteboard",
        objectID: "whiteboard-1",
        viewID: "current",
      }),
    })
  })

  test("keeps whiteboard start candidates when message status has settled", () => {
    const candidate = readLatestBenchAutoOpenCandidate([
      createAssistantMessage(
        [
          {
            id: "part-1",
            sessionID: "session-1",
            messageID: "message-1",
            type: "tool",
            tool: "whiteboard_create_view",
            state: {
              status: "running",
              input: {},
              time: { start: 1 },
              metadata: {
                benchAutoOpenCandidate: {
                  policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
                  eventKey: "whiteboard:session-1:message-1:part-1",
                  target: createBenchObjectTarget({
                    kind: "whiteboard",
                    objectID: "whiteboard-1",
                    viewID: "current",
                  }),
                },
              },
            },
          },
        ],
        { time: { created: 1, completed: 2 } },
      ),
    ])

    expect(candidate).toMatchObject({
      policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
      eventKey: "whiteboard:session-1:message-1:part-1",
      target: createBenchObjectTarget({
        kind: "whiteboard",
        objectID: "whiteboard-1",
        viewID: "current",
      }),
    })
  })

  test("identifies full-size HTML widgets as auto-open candidates", () => {
    const candidate = readLatestBenchAutoOpenCandidate([
      createAssistantMessage(
        [createHtmlWidgetPart({ objectID: "widget-1", preset: "standard_16_10" })],
        { time: { created: 1, completed: 2 } },
      ),
    ])

    expect(candidate).toMatchObject({
      policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
      eventKey: htmlWidgetAutoOpenKey("widget-1"),
      target: createBenchObjectTarget({
        kind: "html-widget",
        objectID: "widget-1",
        viewID: "runtime",
      }),
    })
  })

  test("does not auto-open compact HTML widgets", () => {
    expect(
      readLatestBenchAutoOpenCandidate([
        createAssistantMessage(
          [createHtmlWidgetPart({ objectID: "widget-compact", preset: "compact_4_3" })],
          { time: { created: 1, completed: 2 } },
        ),
      ]),
    ).toBeUndefined()
  })

  test("maps bench_present file results to explicit presentation actions", () => {
    const action = readLatestBenchAction([
      createAssistantMessage(
        [
          createBenchPresentPart({
            status: "presented",
            target: createWorkspaceFileTarget({ path: "notes/design.md", viewer: "markdown" }),
          }),
        ],
        { time: { created: 1, completed: 2 } },
      ),
    ])

    expect(action).toMatchObject({
      action: "open",
      target: {
        type: "workspace-file",
        path: "notes/design.md",
        viewer: "markdown",
      },
    })
  })

  test("finds bench_present actions before a final assistant text message in the same turn", () => {
    const action = readLatestBenchAction([
      createAssistantMessage(
        [
          createBenchPresentPart({
            status: "presented",
            target: createWorkspaceFileTarget({ path: "workspace.md", viewer: "markdown" }),
          }),
        ],
        { id: "message-tool", time: { created: 1, completed: 2 } },
      ),
      createAssistantMessage(
        [
          {
            id: "part-final-text",
            sessionID: "session-1",
            messageID: "message-final",
            type: "text",
            text: "Done, it is open on the Bench.",
          },
        ],
        { id: "message-final", time: { created: 3, completed: 4 } },
      ),
    ])

    expect(action).toMatchObject({
      action: "open",
      target: {
        type: "workspace-file",
        path: "workspace.md",
        viewer: "markdown",
      },
    })
  })

  test("finds HTML widget auto-open candidates before a final assistant text message in the same turn", () => {
    const candidate = readLatestBenchAutoOpenCandidate([
      createAssistantMessage(
        [createHtmlWidgetPart({ objectID: "widget-after-tool", preset: "standard_16_10" })],
        { id: "message-tool", time: { created: 1, completed: 2 } },
      ),
      createAssistantMessage(
        [
          {
            id: "part-final-text",
            sessionID: "session-1",
            messageID: "message-final",
            type: "text",
            text: "Try the widget.",
          },
        ],
        { id: "message-final", time: { created: 3, completed: 4 } },
      ),
    ])

    expect(candidate).toMatchObject({
      target: createBenchObjectTarget({
        kind: "html-widget",
        objectID: "widget-after-tool",
        viewID: "runtime",
      }),
    })
  })

  test("does not reopen a presentation from before the latest user message", () => {
    const action = readLatestBenchAction([
      createAssistantMessage(
        [
          createBenchPresentPart({
            status: "presented",
            target: createWorkspaceFileTarget({ path: "old.md", viewer: "markdown" }),
          }),
        ],
        { id: "message-old", time: { created: 1, completed: 2 } },
      ),
      {
        info: {
          id: "message-user",
          sessionID: "session-1",
          role: "user",
          agent: "buddy",
          time: { created: 3 },
          model: { providerID: "provider-1", modelID: "model-1" },
        },
        parts: [
          {
            id: "part-user",
            sessionID: "session-1",
            messageID: "message-user",
            type: "text",
            text: "Do something else.",
          },
        ],
      },
    ])

    expect(action).toBeUndefined()
  })

  test("maps bench_present close results to close actions", () => {
    const action = readLatestBenchAction([
      createAssistantMessage([createBenchPresentPart({ status: "closed", target: null })], {
        time: { created: 1, completed: 2 },
      }),
    ])

    expect(action).toMatchObject({
      action: "close",
    })
  })

  test("ignores blocked bench_present results", () => {
    const action = readLatestBenchAction([
      createAssistantMessage(
        [
          createBenchPresentPart({
            status: "blocked",
            target: createWorkspaceFileTarget({ path: "notes/design.md", viewer: "markdown" }),
          }),
        ],
        { time: { created: 1, completed: 2 } },
      ),
    ])

    expect(action).toBeUndefined()
  })
})
