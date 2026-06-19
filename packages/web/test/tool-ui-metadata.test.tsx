import { describe, expect, test } from "bun:test"
import { estimateApproxWordCountFromTokens } from "../src/components/chat/tools/full-text-metadata"
import { parseToolUiMetadata } from "../src/components/chat/tools/parse-tool-ui-metadata"
import { getToolInfo } from "../src/components/chat/tools/tool-info"
import {
  groupAssistantParts,
  assistantPartStartsFollowup,
} from "../src/components/chat/utils/message-utils"
import type { MessagePart } from "../src/state/chat-types"

function hiddenSummaryToolPart(input?: {
  id?: string
  tool?: string
  status?: "pending" | "running" | "completed" | "error"
}): MessagePart {
  const status = input?.status ?? "completed"
  const state =
    status === "pending"
      ? {
          status,
          input: {},
          raw: "{}",
        }
      : status === "running"
        ? {
            status,
            input: {},
            time: { start: 1 },
            metadata: {
              buddy: {
                toolUi: {
                  presentation: "hidden-summary",
                  labels: {
                    idle: "Search learning tools",
                    running: "Searching learning tools",
                  },
                },
              },
            },
          }
        : status === "error"
          ? {
              status,
              input: {},
              error: "boom",
              time: { start: 1, end: 2 },
              metadata: {
                buddy: {
                  toolUi: {
                    presentation: "hidden-summary",
                    labels: {
                      idle: "Search learning tools",
                      running: "Searching learning tools",
                    },
                  },
                },
              },
            }
          : {
              status,
              input: {},
              output: "Matched dynamic tools",
              title: "learning_tool_search",
              time: { start: 1, end: 2 },
              metadata: {
                matchedToolIds: ["tool_a", "tool_b"],
                buddy: {
                  toolUi: {
                    presentation: "hidden-summary",
                    labels: {
                      idle: "Search learning tools",
                      running: "Searching learning tools",
                    },
                  },
                },
              },
            }

  return {
    id: input?.id ?? "prt_hidden_summary_tool",
    sessionID: "ses_hidden_summary_tool",
    messageID: "msg_hidden_summary_tool",
    type: "tool",
    tool: input?.tool ?? "unknown_hidden_summary_tool",
    callID: "call_hidden_summary_tool",
    metadata:
      status === "pending"
        ? {
            buddy: {
              toolUi: {
                presentation: "hidden-summary",
                labels: {
                  idle: "Search learning tools",
                  running: "Searching learning tools",
                },
              },
            },
          }
        : undefined,
    state,
  }
}

function visibleToolPart(input: { id: string; tool: string }): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_visible_tool",
    messageID: "msg_visible_tool",
    type: "tool",
    tool: input.tool,
    callID: `call_${input.id}`,
    state: {
      status: "completed",
      input: {},
      metadata: {},
      attachments: [],
      output: "",
    },
  }
}

function reasoningPart(input: { id: string; text?: string }): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_reasoning",
    messageID: "msg_reasoning",
    type: "reasoning",
    text: input.text ?? "Thinking",
    time: { start: 1, end: 2 },
  }
}

function contextTooFullIngestPart(input: { legacy?: boolean } = {}): MessagePart {
  const state = input.legacy
    ? {
        status: "error" as const,
        input: { resourceKey: "guns-of-august" },
        error:
          'Cannot ingest full text for resource "guns-of-august" because the live session context is too full.\nUse scoped reading instead of full-text ingestion in this session.',
        time: { start: 1, end: 2 },
      }
    : {
        status: "completed" as const,
        input: { resourceKey: "guns-of-august" },
        metadata: {
          resource: "guns-of-august",
          completed: false,
          reason: "context_too_full",
          fallback: "scoped_reading",
          fullTextEstimatedTokens: 399317,
          truncated: false,
        },
        attachments: [],
        output:
          '<resource_full_text_ingestion resource="guns-of-august" completed="false" reason="context_too_full">Use scoped reading instead.</resource_full_text_ingestion>',
      }

  return {
    id: input.legacy ? "prt_full_text_legacy_context_too_full" : "prt_full_text_context_too_full",
    sessionID: "ses_full_text",
    messageID: "msg_full_text",
    type: "tool",
    tool: "ingest_full_text",
    callID: input.legacy ? "call_full_text_legacy_context_too_full" : "call_full_text_context_too_full",
    state,
  }
}

describe("tool UI metadata", () => {
  test("parses valid and invalid tool UI metadata shapes", () => {
    expect(
      parseToolUiMetadata({
        buddy: {
          toolUi: {
            presentation: "hidden-summary",
            labels: {
              idle: "Idle",
              running: "Running",
            },
          },
        },
      }),
    ).toEqual({
      presentation: "hidden-summary",
      labels: {
        idle: "Idle",
        running: "Running",
      },
    })

    expect(parseToolUiMetadata({ buddy: { toolUi: { presentation: "invalid" } } })).toBeUndefined()
    expect(parseToolUiMetadata({})).toBeUndefined()
  })

  test("metadata-marked tools become abstracted and do not start follow-up sections", () => {
    const part = hiddenSummaryToolPart()
    const grouped = groupAssistantParts([part], true)

    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.type).toBe("abstracted")
    expect(assistantPartStartsFollowup(part)).toBe(false)
  })

  test("tool labels choose running vs idle based on lifecycle state", () => {
    const pendingInfo = getToolInfo("unknown_hidden_summary_tool", {
      status: "pending",
      input: {},
      metadata: {
        buddy: {
          toolUi: {
            presentation: "hidden-summary",
            labels: {
              idle: "Search learning tools",
              running: "Searching learning tools",
            },
          },
        },
      },
      attachments: [],
    })
    const completedInfo = getToolInfo("unknown_hidden_summary_tool", {
      status: "completed",
      input: {},
      metadata: {
        buddy: {
          toolUi: {
            presentation: "hidden-summary",
            labels: {
              idle: "Search learning tools",
              running: "Searching learning tools",
            },
          },
        },
      },
      attachments: [],
      output: "done",
    })

    expect(pendingInfo.title).toBe("Searching learning tools")
    expect(completedInfo.title).toBe("Search learning tools")
  })

  test("tool fallback labels do not expose raw tool ids", () => {
    const runningWhiteboard = getToolInfo("whiteboard_create_view", {
      status: "running",
      input: {},
      metadata: {},
      attachments: [],
    })
    const completedWhiteboard = getToolInfo("whiteboard_create_view", {
      status: "completed",
      input: {},
      metadata: {},
      attachments: [],
      output: "done",
    })
    const unknownTool = getToolInfo("raw_custom_tool", {
      status: "completed",
      input: {},
      metadata: {},
      attachments: [],
      output: "done",
    })

    expect(runningWhiteboard.title).toBe("Updating Whiteboard")
    expect(completedWhiteboard.title).toBe("Updated Whiteboard")
    expect(unknownTool.title).toBe("Raw Custom Tool")
  })

  test("skill tool titles use humanized skill names", () => {
    const completedInfo = getToolInfo("skill", {
      status: "completed",
      input: {
        name: "react-best-practices",
      },
      metadata: {},
      attachments: [],
      output: "",
    })

    expect(completedInfo.title).toBe("Skill Used")
    expect(completedInfo.subtitle).toBe("React Best Practices")
  })

  test("estimateApproxWordCountFromTokens uses four chars per token", () => {
    expect(estimateApproxWordCountFromTokens(308_341)).toBe(246_673)
  })

  test("ingest_full_text renders inline instead of in abstracted steps", () => {
    const part = {
      id: "prt_ingest_inline",
      sessionID: "ses_1",
      messageID: "msg_1",
      type: "tool" as const,
      tool: "ingest_full_text",
      state: {
        status: "completed" as const,
        input: { resourceKey: "guns-of-august" },
        metadata: {
          resource: "guns-of-august",
          fullTextEstimatedTokens: 4200,
          truncated: false,
        },
        attachments: [],
        output: "",
      },
    }
    const grouped = groupAssistantParts([part], true)

    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.type).toBe("part")
    expect(assistantPartStartsFollowup(part)).toBe(true)
  })

  test("context-too-full ingest fallback does not split hidden summaries", () => {
    const firstReasoning = reasoningPart({ id: "reasoning_before" })
    const hiddenRead = hiddenSummaryToolPart({ id: "read_pack", tool: "read" })
    const fallback = contextTooFullIngestPart()
    const secondReasoning = reasoningPart({ id: "reasoning_after" })
    const grouped = groupAssistantParts(
      [firstReasoning, hiddenRead, fallback, secondReasoning],
      true,
    )

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      type: "abstracted",
      parts: [firstReasoning, hiddenRead, secondReasoning],
    })
    expect(assistantPartStartsFollowup(fallback)).toBe(false)
  })

  test("legacy context-too-full ingest error does not split hidden summaries", () => {
    const firstReasoning = reasoningPart({ id: "legacy_reasoning_before" })
    const fallback = contextTooFullIngestPart({ legacy: true })
    const secondReasoning = reasoningPart({ id: "legacy_reasoning_after" })
    const grouped = groupAssistantParts([firstReasoning, fallback, secondReasoning], true)

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      type: "abstracted",
      parts: [firstReasoning, secondReasoning],
    })
    expect(assistantPartStartsFollowup(fallback)).toBe(false)
  })

  test("todowrite renders inline instead of being hidden", () => {
    const part = visibleToolPart({ id: "todo_visible", tool: "todowrite" })
    const grouped = groupAssistantParts([part], true)

    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.type).toBe("part")
    expect(assistantPartStartsFollowup(part)).toBe(true)
  })

  test("groups consecutive render_figure tool calls", () => {
    const first = visibleToolPart({ id: "prt_figure_1", tool: "render_figure" })
    const second = visibleToolPart({ id: "prt_figure_2", tool: "render_figure" })
    const grouped = groupAssistantParts([first, second], true)

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      type: "grouped-parts",
      tool: "render_figure",
      parts: [first, second],
    })
  })

  test("groups consecutive render_freeform_figure tool calls", () => {
    const first = visibleToolPart({ id: "prt_freeform_1", tool: "render_freeform_figure" })
    const second = visibleToolPart({ id: "prt_freeform_2", tool: "render_freeform_figure" })
    const grouped = groupAssistantParts([first, second], true)

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      type: "grouped-parts",
      tool: "render_freeform_figure",
      parts: [first, second],
    })
  })

  test("keeps render_figure and render_freeform_figure in separate groups", () => {
    const figure = visibleToolPart({ id: "prt_figure", tool: "render_figure" })
    const freeform = visibleToolPart({ id: "prt_freeform", tool: "render_freeform_figure" })
    const grouped = groupAssistantParts([figure, freeform], true)

    expect(grouped).toHaveLength(2)
    expect(grouped[0]).toMatchObject({
      type: "part",
      part: figure,
    })
    expect(grouped[1]).toMatchObject({
      type: "part",
      part: freeform,
    })
  })

  test("groups consecutive full text ingests", () => {
    const first = visibleToolPart({ id: "prt_full_text_1", tool: "ingest_full_text" })
    const second = visibleToolPart({ id: "prt_full_text_2", tool: "ingest_full_text" })
    const grouped = groupAssistantParts([first, second], true)

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      type: "grouped-parts",
      tool: "ingest_full_text",
      parts: [first, second],
    })
  })

  test("ingest_full_text summaries reflect truncation instead of claiming full context load", () => {
    const completedInfo = getToolInfo("ingest_full_text", {
      status: "completed",
      input: {
        resourceKey: "guns-of-august",
      },
      metadata: {
        resource: "guns-of-august",
        fullTextEstimatedTokens: 308341,
        truncated: true,
        fullTextPath: "/tmp/tool-output",
      },
      attachments: [],
      output: "truncated preview",
    })

    expect(completedInfo.subtitle).toBe("guns-of-august")
    expect(completedInfo.summary).toBe("308,341 tokens in source; output truncated")
  })
})
