import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { HiddenSteps } from "../src/components/chat/tools/hidden-steps"
import { parseToolUiMetadata } from "../src/components/chat/tools/parse-tool-ui-metadata"
import { getToolInfo } from "../src/components/chat/tools/tool-info"
import {
  groupAssistantParts,
  assistantPartStartsFollowup,
} from "../src/components/chat/utils/message-utils"
import type { MessagePart } from "../src/state/chat-types"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

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
  let container: HTMLDivElement
  let root: Root
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    originalResizeObserver = globalThis.ResizeObserver
    class MockResizeObserver implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

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

  test("unknown metadata-marked tools render with hidden-step fallback UX", async () => {
    await act(async () => {
      root.render(<HiddenSteps parts={[hiddenSummaryToolPart()]} />)
      await flushEffects()
    })

    expect(container.textContent).toContain("Search learning tools")
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
