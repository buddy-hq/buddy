import { describe, expect, test } from "bun:test"
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
})
