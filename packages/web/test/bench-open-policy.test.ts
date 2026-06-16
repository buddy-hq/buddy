import { describe, expect, test } from "bun:test"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  htmlWidgetAutoOpenKey,
  isFullscreenHtmlWidgetViewportPreset,
  readLatestBenchPresentationAction,
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
  artifactID: string
  preset: "compact_4_3" | "standard_16_10" | "wide_16_9" | "square" | "tall_mobile"
}) {
  return {
    id: `part-${input.artifactID}`,
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
        artifact: "PresentHtmlWidgetOutput",
        value: {
          artifactID: input.artifactID,
          kind: "html-widget",
          title: "Stress Test Widget",
          viewport: {
            preset: input.preset,
            width: 960,
            height: 600,
            label: "Standard 16:10",
          },
          runtimeUrl: "/runtime",
          sourceUrl: "/source",
          sourceHash: "hash",
          warnings: [],
        },
      },
    },
  } satisfies MessageWithParts["parts"][number]
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
      output: JSON.stringify({
        status: input.status,
        reason: input.status === "closed" ? "closed_by_request" : "presented_file",
        target: input.target ?? null,
        mode: input.status === "closed" ? null : "docked",
        message: "ok",
      }),
      title: "Bench Presentation",
      time: { start: 1, end: 2 },
      metadata: {},
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
          },
        },
      ]),
    ])

    expect(candidate).toMatchObject({
      policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
      eventKey: "message-1:part-1",
      target: { type: "whiteboard" },
    })
  })

  test("identifies full-size HTML widgets as auto-open candidates", () => {
    const candidate = readLatestBenchAutoOpenCandidate([
      createAssistantMessage(
        [createHtmlWidgetPart({ artifactID: "widget-1", preset: "standard_16_10" })],
        { time: { created: 1, completed: 2 } },
      ),
    ])

    expect(candidate).toMatchObject({
      policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
      eventKey: htmlWidgetAutoOpenKey("widget-1"),
      target: {
        type: "artifact",
        kind: "html-widget",
        artifactID: "widget-1",
      },
    })
  })

  test("does not auto-open compact HTML widgets", () => {
    expect(
      readLatestBenchAutoOpenCandidate([
        createAssistantMessage(
          [createHtmlWidgetPart({ artifactID: "widget-compact", preset: "compact_4_3" })],
          { time: { created: 1, completed: 2 } },
        ),
      ]),
    ).toBeUndefined()
  })

  test("only treats wide desktop presets as full-screen widgets", () => {
    expect(isFullscreenHtmlWidgetViewportPreset("standard_16_10")).toBe(true)
    expect(isFullscreenHtmlWidgetViewportPreset("wide_16_9")).toBe(true)
    expect(isFullscreenHtmlWidgetViewportPreset("square")).toBe(false)
    expect(isFullscreenHtmlWidgetViewportPreset("tall_mobile")).toBe(false)
  })

  test("maps bench_present file results to explicit presentation actions", () => {
    const action = readLatestBenchPresentationAction([
      createAssistantMessage(
        [
          createBenchPresentPart({
            status: "presented",
            target: {
              type: "markdown",
              path: "notes/design.md",
            },
          }),
        ],
        { time: { created: 1, completed: 2 } },
      ),
    ])

    expect(action).toMatchObject({
      action: "open",
      target: {
        type: "markdown",
        path: "notes/design.md",
      },
    })
  })

  test("finds bench_present actions before a final assistant text message in the same turn", () => {
    const action = readLatestBenchPresentationAction([
      createAssistantMessage(
        [
          createBenchPresentPart({
            status: "presented",
            target: {
              type: "markdown",
              path: "workspace.md",
            },
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
        type: "markdown",
        path: "workspace.md",
      },
    })
  })

  test("finds HTML widget auto-open candidates before a final assistant text message in the same turn", () => {
    const candidate = readLatestBenchAutoOpenCandidate([
      createAssistantMessage(
        [createHtmlWidgetPart({ artifactID: "widget-after-tool", preset: "standard_16_10" })],
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
      target: {
        type: "artifact",
        kind: "html-widget",
        artifactID: "widget-after-tool",
      },
    })
  })

  test("does not reopen a presentation from before the latest user message", () => {
    const action = readLatestBenchPresentationAction([
      createAssistantMessage(
        [
          createBenchPresentPart({
            status: "presented",
            target: {
              type: "markdown",
              path: "old.md",
            },
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
    const action = readLatestBenchPresentationAction([
      createAssistantMessage(
        [createBenchPresentPart({ status: "closed", target: null })],
        { time: { created: 1, completed: 2 } },
      ),
    ])

    expect(action).toMatchObject({
      action: "close",
    })
  })

  test("ignores blocked bench_present results", () => {
    const action = readLatestBenchPresentationAction([
      createAssistantMessage(
        [
          createBenchPresentPart({
            status: "blocked",
            target: {
              type: "markdown",
              path: "notes/design.md",
            },
          }),
        ],
        { time: { created: 1, completed: 2 } },
      ),
    ])

    expect(action).toBeUndefined()
  })
})
