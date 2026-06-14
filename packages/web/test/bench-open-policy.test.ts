import { describe, expect, test } from "bun:test"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  htmlWidgetAutoOpenKey,
  isFullscreenHtmlWidgetViewportPreset,
  readLatestBenchAutoOpenCandidate,
  shouldAutoOpenBenchCandidate,
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

describe("bench open policy", () => {
  test("auto-opens active whiteboard work in floating chat mode", () => {
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
      key: "message-1:part-1",
      chatLayout: "floating",
      target: { type: "whiteboard" },
    })
  })

  test("auto-opens full-size HTML widgets in floating chat mode", () => {
    const candidate = readLatestBenchAutoOpenCandidate([
      createAssistantMessage(
        [createHtmlWidgetPart({ artifactID: "widget-1", preset: "standard_16_10" })],
        { time: { created: 1, completed: 2 } },
      ),
    ])

    expect(candidate).toMatchObject({
      policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
      key: htmlWidgetAutoOpenKey("widget-1"),
      chatLayout: "floating",
      routeSuffix: "/artifacts/html-widget/widget-1",
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

  test("does not recapture a dismissed candidate or the current bench route", () => {
    const candidate = readLatestBenchAutoOpenCandidate([
      createAssistantMessage(
        [createHtmlWidgetPart({ artifactID: "widget-1", preset: "wide_16_9" })],
        { time: { created: 1, completed: 2 } },
      ),
    ])

    expect(
      shouldAutoOpenBenchCandidate({
        candidate,
        pathname: "/notebook/chat",
        suppressedKey: htmlWidgetAutoOpenKey("widget-1"),
      }),
    ).toBe(false)
    expect(
      shouldAutoOpenBenchCandidate({
        candidate,
        pathname: "/notebook/artifacts/html-widget/widget-1",
        suppressedKey: undefined,
      }),
    ).toBe(false)
  })
})
