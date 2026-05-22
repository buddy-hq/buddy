import { describe, expect, test } from "bun:test"
import { buildSubagentActivityState } from "../src/components/chat/tools/render/task/task-card-header"
import { buildHiddenStepsSummary, createHiddenStepsEntry } from "../src/components/chat/tools/hidden-steps/entries"
import { shouldShowThinkingPlaceholder } from "../src/components/chat/turn-renderer"
import { groupAssistantParts } from "../src/components/chat/utils/message-utils"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"

function reasoningPart(input?: {
  id?: string
  text?: string
  start?: number
  end?: number
}): MessagePart {
  return {
    id: input?.id ?? "part_reasoning",
    sessionID: "session_1",
    messageID: "message_1",
    type: "reasoning",
    text: input?.text ?? "**Tracing transcript phases**",
    time: {
      start: input?.start ?? 0,
      ...(typeof input?.end === "number" ? { end: input.end } : {}),
    },
  }
}

function textPart(input?: { id?: string; text?: string; start?: number }): MessagePart {
  return {
    id: input?.id ?? "part_text",
    sessionID: "session_1",
    messageID: "message_1",
    type: "text",
    text: input?.text ?? "Visible output",
    time: {
      start: input?.start ?? 121_000,
    },
  }
}

function assistantMessage(parts: MessagePart[]): MessageWithParts {
  return {
    info: {
      id: "message_1",
      sessionID: "session_1",
      role: "assistant",
      time: {
        created: 0,
      },
      parentID: "message_user",
      modelID: "model_1",
      providerID: "provider_1",
      mode: "chat",
      agent: "buddy",
      path: {
        cwd: "/repo",
        root: "/repo",
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
    },
    parts,
  }
}

describe("hidden steps summaries", () => {
  test("marks an abstracted block as settled once visible follow-up output starts", () => {
    const items = groupAssistantParts([reasoningPart(), textPart()], true)

    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      type: "abstracted",
      key: "abstracted:part_reasoning",
      parts: [reasoningPart()],
      followupStartedAt: 121_000,
    })
  })

  test("formats settled reasoning summaries with heading and full duration", () => {
    const summary = buildHiddenStepsSummary([createHiddenStepsEntry(reasoningPart())], {
      isBusy: true,
      followupStartedAt: 121_000,
    })

    expect(summary).toBe("Thought: Tracing transcript phases · 2m 1s")
  })

  test("stops showing the placeholder once visible assistant output exists", () => {
    const items = groupAssistantParts([reasoningPart(), textPart()], false)

    expect(
      shouldShowThinkingPlaceholder({
        isBusy: true,
        isLastTurn: true,
        assistantErrored: false,
        sessionStatusType: "busy",
        turnHasCompaction: false,
        assistantItemCount: items.length,
      }),
    ).toBe(false)
  })

  test("does not keep a subagent card on stale thinking after text streaming begins", () => {
    const { activityLine } = buildSubagentActivityState({
      messages: [assistantMessage([reasoningPart(), textPart()])],
      toolIsActive: true,
    })

    expect(activityLine).toBeUndefined()
  })
})
