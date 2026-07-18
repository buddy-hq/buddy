import { describe, expect, test } from "bun:test"
import { isValidElement } from "react"

import {
  activityEntryLabel,
  activityHeaderKey,
  activityWorkingLabel,
  createActivityEntry,
  resolveActivityHeader,
} from "../src/components/chat/tools/activity-row/entries"
import type { MessagePart } from "../src/state/chat-types"
import {
  activityPresentation,
  presentationMetadata,
} from "./tool-presentation-fixtures"

type ToolPhase = "pending" | "running" | "completed" | "error"

function toolPart(input: {
  id: string
  tool?: string
  phase: ToolPhase
  action: string
  detail?: string
  category: string
  summary: string
  icon?: "edit" | "read" | "search" | "terminal" | "tool"
  outcome?: "failure" | "neutral"
}): MessagePart {
  const presentation = activityPresentation({
    phase: input.phase,
    action: input.action,
    ...(input.detail ? { detail: input.detail } : {}),
    category: input.category,
    summary: input.summary,
    icon: input.icon ?? "tool",
    outcome:
      input.outcome === "neutral"
        ? { type: "neutral", reason: "permission-denied" }
        : input.outcome === "failure"
          ? { type: "failure" }
          : undefined,
  })
  const base = {
    id: input.id,
    sessionID: "ses_activity",
    messageID: "msg_activity",
    type: "tool" as const,
    tool: input.tool ?? "test_tool",
    callID: `call_${input.id}`,
    metadata: presentationMetadata(presentation),
  }

  if (input.phase === "pending") {
    return { ...base, state: { status: "pending", input: {}, raw: "{}" } }
  }
  if (input.phase === "running") {
    return { ...base, state: { status: "running", input: {}, time: { start: 1 } } }
  }
  if (input.phase === "error") {
    return {
      ...base,
      state: {
        status: "error",
        input: {},
        error: "boom",
        time: { start: 1, end: 2 },
      },
    }
  }
  return {
    ...base,
    state: {
      status: "completed",
      input: {},
      output: "ok",
      title: input.action,
      metadata: {},
      attachments: [],
      time: { start: 1, end: 2 },
    },
  }
}

function entries(parts: MessagePart[]) {
  return parts.flatMap((part) => createActivityEntry(part) ?? [])
}

describe("ActivityRow header resolution", () => {
  test("keeps identical pending and running headers on the same motion key", () => {
    const pendingHeader = resolveActivityHeader({
      entries: entries([
        toolPart({
          id: "read-pending",
          phase: "pending",
          action: "Reading",
          detail: "App.tsx",
          category: "read-files",
          summary: "Reading files",
          icon: "read",
        }),
      ]),
      busy: true,
      current: true,
      zeroEntryLabel: "Thinking",
    })
    const runningHeader = resolveActivityHeader({
      entries: entries([
        toolPart({
          id: "read-running",
          phase: "running",
          action: "Reading",
          detail: "App.tsx",
          category: "read-files",
          summary: "Reading files",
          icon: "read",
        }),
      ]),
      busy: true,
      current: true,
      zeroEntryLabel: "Thinking",
    })

    expect(activityHeaderKey(pendingHeader)).toBe(activityHeaderKey(runningHeader))
  })

  test("changes the motion key when visible active header content changes", () => {
    const firstHeader = resolveActivityHeader({
      entries: entries([
        toolPart({
          id: "read-app",
          phase: "running",
          action: "Reading",
          detail: "App.tsx",
          category: "read-files",
          summary: "Reading files",
          icon: "read",
        }),
      ]),
      busy: true,
      current: true,
      zeroEntryLabel: "Thinking",
    })
    const nextHeader = resolveActivityHeader({
      entries: entries([
        toolPart({
          id: "read-routes",
          phase: "running",
          action: "Reading",
          detail: "routes.ts",
          category: "read-files",
          summary: "Reading files",
          icon: "read",
        }),
      ]),
      busy: true,
      current: true,
      zeroEntryLabel: "Thinking",
    })

    expect(activityHeaderKey(firstHeader)).not.toBe(activityHeaderKey(nextHeader))
  })

  test("keeps the semantic edit icon when the file target is not known", () => {
    const [entry] = entries([
      toolPart({
        id: "edit",
        tool: "edit",
        phase: "running",
        action: "Editing",
        category: "edit-files",
        summary: "Editing files",
        icon: "edit",
      }),
    ])
    expect(entry).toBeDefined()
    if (!entry) throw new Error("Expected activity entry")

    expect(activityEntryLabel(entry)).toBe("Editing")
    expect(isValidElement(entry.icon("size-4"))).toBe(true)
  })

  test("renders the authored action and exact detail as one label", () => {
    const [entry] = entries([
      toolPart({
        id: "read",
        phase: "running",
        action: "Reading",
        detail: "App.tsx",
        category: "read-files",
        summary: "Reading files",
        icon: "read",
      }),
    ])
    expect(entry && activityEntryLabel(entry)).toBe("Reading App.tsx")
  })

  test("switches permanently to the generic burst label on the second category entry", () => {
    const resolvedEntries = entries([
      toolPart({
        id: "read-1",
        phase: "completed",
        action: "Read",
        detail: "App.tsx",
        category: "read-files",
        summary: "Read files",
        icon: "read",
      }),
      toolPart({
        id: "read-2",
        phase: "running",
        action: "Reading",
        detail: "routes.ts",
        category: "read-files",
        summary: "Reading files",
        icon: "read",
      }),
    ])

    expect(
      resolveActivityHeader({
        entries: resolvedEntries,
        busy: true,
        current: true,
        zeroEntryLabel: "Thinking",
      }).label,
    ).toBe("Reading files")
  })

  test("settles to the three most frequent successful categories with first-use ties", () => {
    const resolvedEntries = entries([
      toolPart({ id: "read-1", phase: "completed", action: "Read", category: "read", summary: "Read files", icon: "read" }),
      toolPart({ id: "search-1", phase: "completed", action: "Searched", category: "search", summary: "Searched code", icon: "search" }),
      toolPart({ id: "edit-1", phase: "completed", action: "Edited", category: "edit", summary: "Edited files", icon: "edit" }),
      toolPart({ id: "shell-1", phase: "completed", action: "Ran", category: "shell", summary: "Ran commands", icon: "terminal" }),
      toolPart({ id: "edit-2", phase: "completed", action: "Edited", category: "edit", summary: "Edited files", icon: "edit" }),
      toolPart({ id: "read-2", phase: "completed", action: "Read", category: "read", summary: "Read files", icon: "read" }),
      toolPart({ id: "edit-3", phase: "completed", action: "Edited", category: "edit", summary: "Edited files", icon: "edit" }),
    ])

    expect(
      resolveActivityHeader({
        entries: resolvedEntries,
        busy: false,
        current: false,
        zeroEntryLabel: "Thinking",
      }).label,
    ).toBe("Edited files · Read files · Searched code")
  })

  test("does not include failed or neutral entries in settled summaries", () => {
    const resolvedEntries = entries([
      toolPart({ id: "failure", phase: "error", action: "Failed to edit", category: "edit", summary: "Failed to edit files", outcome: "failure" }),
      toolPart({ id: "denied", phase: "error", action: "Permission denied", category: "read", summary: "Permission denied", outcome: "neutral" }),
    ])

    expect(activityEntryLabel(resolvedEntries[1]!)).toBe("Permission denied")
    expect(
      resolveActivityHeader({
        entries: resolvedEntries,
        busy: false,
        current: false,
        zeroEntryLabel: "Thinking",
      }).label,
    ).toBe("Steps")
  })

  test("uses reasoning duration only when no successful tool ran", () => {
    const reasoning: MessagePart = {
      id: "reasoning",
      sessionID: "ses_activity",
      messageID: "msg_activity",
      type: "reasoning",
      text: "Considering the change",
      time: { start: 1, end: 4_001 },
    }
    expect(
      resolveActivityHeader({
        entries: entries([reasoning]),
        busy: false,
        current: false,
        zeroEntryLabel: "Thinking",
      }).label,
    ).toBe("Thought for 4s")
  })

  test("selects a deterministic stable Panda word from the segment key", () => {
    expect(activityWorkingLabel("activity:turn:2")).toBe(
      activityWorkingLabel("activity:turn:2"),
    )
    expect(activityWorkingLabel("activity:turn:2")).not.toBe("")
  })
})
