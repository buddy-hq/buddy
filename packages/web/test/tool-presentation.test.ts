import { describe, expect, test } from "bun:test"

import { getToolInfo } from "../src/components/chat/tools/tool-info"
import { parseToolPresentationMetadata } from "../src/components/chat/tools/parse-tool-presentation"
import { parseToolState } from "../src/components/chat/tools/parse-tool-state"
import {
  assistantPartStartsFollowup,
  groupAssistantParts,
} from "../src/components/chat/utils/message-utils"
import type { MessagePart } from "../src/state/chat-types"
import {
  activityPresentation,
  inlinePresentation,
  presentationMetadata,
} from "./tool-presentation-fixtures"

function completedToolPart(input: {
  id: string
  tool: string
  metadata: Record<string, unknown>
}): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_presentation",
    messageID: "msg_presentation",
    type: "tool",
    tool: input.tool,
    callID: `call_${input.id}`,
    metadata: input.metadata,
    state: {
      status: "completed",
      input: {},
      output: "ok",
      title: "done",
      metadata: {},
      attachments: [],
      time: { start: 1, end: 2 },
    },
  }
}

function failedInlinePart(id: string): MessagePart {
  return {
    id,
    sessionID: "ses_presentation",
    messageID: "msg_presentation",
    type: "tool",
    tool: "imagegen",
    callID: `call_${id}`,
    metadata: presentationMetadata(
      inlinePresentation({
        phase: "error",
        action: "Failed to generate",
        renderer: "image-generation",
        layoutRole: "media-output",
        icon: "image",
        outcome: { type: "failure" },
      }),
    ),
    state: {
      status: "error",
      input: {},
      error: "generation failed",
      time: { start: 1, end: 2 },
    },
  }
}

function textPart(id: string, text: string): MessagePart {
  return {
    id,
    sessionID: "ses_presentation",
    messageID: "msg_presentation",
    type: "text",
    text,
    time: { start: 1, end: 2 },
  }
}

describe("resolved tool presentation", () => {
  test("accepts the discriminated snapshot and rejects the old optional metadata", () => {
    const snapshot = activityPresentation({
      phase: "running",
      action: "Reading",
      detail: "App.tsx",
      category: "read-files",
      summary: "Reading files",
      icon: "read",
      renderer: "read",
    })

    expect(parseToolPresentationMetadata(presentationMetadata(snapshot))).toEqual(snapshot)
    expect(
      parseToolPresentationMetadata({
        buddy: { toolUi: { presentation: "hidden-summary" } },
      }),
    ).toBeUndefined()
  })

  test("uses authored presentation copy and never a raw snake-case name", () => {
    const presentation = activityPresentation({
      phase: "completed",
      action: "Updated memory",
      category: "memory",
      summary: "Updated memory",
      icon: "memory",
      renderer: "buddy-custom",
    })
    const part = completedToolPart({
      id: "memory",
      tool: "learner_memory_update",
      metadata: presentationMetadata(presentation),
    })

    expect(getToolInfo("learner_memory_update", parseToolState(part), presentation).title).toBe(
      "Updated memory",
    )
  })

  test("visible prose seals activity segments", () => {
    const activity = (id: string) =>
      completedToolPart({
        id,
        tool: "read",
        metadata: presentationMetadata(
          activityPresentation({
            phase: "completed",
            action: "Read",
            category: "read-files",
            summary: "Read files",
            icon: "read",
            renderer: "read",
          }),
        ),
      })

    expect(groupAssistantParts([activity("one"), textPart("text", "Done"), activity("two")], true)).toEqual([
      { type: "abstracted", key: "activity:0", layoutRole: "activity", parts: [activity("one")] },
      { type: "part", key: "part:text", layoutRole: "prose", part: textPart("text", "Done") },
      { type: "abstracted", key: "activity:1", layoutRole: "activity", parts: [activity("two")] },
    ])
  })

  test("completed inline output stays visible while failure moves into activity", () => {
    const completed = completedToolPart({
      id: "image-complete",
      tool: "imagegen",
      metadata: presentationMetadata(
        inlinePresentation({
          phase: "completed",
          action: "Generated",
          renderer: "image-generation",
          layoutRole: "media-output",
          icon: "image",
        }),
      ),
    })
    const failed = failedInlinePart("image-failed")

    expect(assistantPartStartsFollowup(completed)).toBe(true)
    expect(assistantPartStartsFollowup(failed)).toBe(false)
    expect(groupAssistantParts([completed, failed], true).map((item) => item.type)).toEqual([
      "part",
      "abstracted",
    ])
  })

  test("compatible collection tokens group independent stable tool parts", () => {
    const image = (id: string) =>
      completedToolPart({
        id,
        tool: "imagegen",
        metadata: presentationMetadata(
          inlinePresentation({
            phase: "completed",
            action: "Generated",
            renderer: "image-generation",
            layoutRole: "media-output",
            collection: "image-gallery",
            icon: "image",
          }),
        ),
      })
    const first = image("image-1")
    const second = image("image-2")

    expect(groupAssistantParts([first, second], true)).toEqual([
      {
        type: "grouped-parts",
        key: "grouped-parts:image-gallery:image-1",
        collection: "image-gallery",
        layoutRole: "media-output",
        parts: [first, second],
      },
    ])
  })

  test("a named silent outcome produces no transcript item", () => {
    const part = completedToolPart({
      id: "silent-fallback",
      tool: "ingest_full_text",
      metadata: presentationMetadata(
        inlinePresentation({
          phase: "completed",
          action: "Ingested full text",
          renderer: "full-text",
          layoutRole: "card-output",
          outcome: { type: "silent", reason: "scoped-reading-fallback" },
        }),
      ),
    })

    expect(groupAssistantParts([part], true)).toEqual([])
  })

  test("missing snapshots are not humanized into user-visible fallback copy", () => {
    const part = completedToolPart({ id: "missing", tool: "raw_backend_name", metadata: {} })
    expect(groupAssistantParts([part], true)).toEqual([])
  })
})
