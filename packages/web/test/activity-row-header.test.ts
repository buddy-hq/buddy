import { describe, expect, test } from "bun:test"

import {
  activityEntryLabel,
  activityHeaderKey,
  createActivityEntry,
  resolveActivityHeader,
} from "../src/components/chat/tools/activity-row/entries"
import type { MessagePart } from "../src/state/chat-types"
import { activityPresentation, presentationMetadata } from "./tool-presentation-fixtures"

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
  const presentation = activityPresentation(
    Object.assign(
      {
        phase: input.phase,
        action: input.action,
        category: input.category,
        summary: input.summary,
        icon: input.icon ?? "tool",
        outcome:
          input.outcome === "neutral"
            ? { type: "neutral" as const, reason: "permission-denied" as const }
            : input.outcome === "failure"
              ? { type: "failure" as const }
              : undefined,
      },
      input.detail === undefined ? undefined : { detail: input.detail },
    ),
  )
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

function reasoningPart(input: {
  id: string
  text: string
  time: { start: number; end?: number }
}): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_activity",
    messageID: "msg_activity",
    type: "reasoning",
    text: input.text,
    time: input.time,
  }
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

    expect(pendingHeader.label).toBe("Reading files")
    expect(runningHeader.label).toBe("Reading files")
    expect(activityHeaderKey(pendingHeader)).toBe(activityHeaderKey(runningHeader))
  })

  test("keeps detail changes in the same activity category on one motion key", () => {
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

    expect(activityHeaderKey(firstHeader)).toBe(activityHeaderKey(nextHeader))
  })

  test("changes the motion key when the semantic activity category changes", () => {
    const fileSearchHeader = resolveActivityHeader({
      entries: entries([
        toolPart({
          id: "search-files",
          phase: "running",
          action: "Searching",
          detail: "query",
          category: "search-files",
          summary: "Searching",
          icon: "search",
        }),
      ]),
      busy: true,
      current: true,
      zeroEntryLabel: "Thinking",
    })
    const codeSearchHeader = resolveActivityHeader({
      entries: entries([
        toolPart({
          id: "search-code",
          phase: "running",
          action: "Searching",
          detail: "query",
          category: "search-code",
          summary: "Searching",
          icon: "search",
        }),
      ]),
      busy: true,
      current: true,
      zeroEntryLabel: "Thinking",
    })

    expect(activityHeaderKey(fileSearchHeader)).not.toBe(activityHeaderKey(codeSearchHeader))
  })

  test("keeps active and settled titles in one category on the same motion key", () => {
    const completedSearch = toolPart({
      id: "search-completed",
      phase: "completed",
      action: "Searched files",
      detail: "src/**/*.tsx",
      category: "search-files",
      summary: "Searched files",
      icon: "search",
    })
    const activeHeader = resolveActivityHeader({
      entries: entries([
        completedSearch,
        toolPart({
          id: "search-running",
          phase: "running",
          action: "Searching files",
          detail: "packages/**/*.tsx",
          category: "search-files",
          summary: "Searching files",
          icon: "search",
        }),
      ]),
      busy: true,
      current: true,
      zeroEntryLabel: "Thinking",
    })
    const settledHeader = resolveActivityHeader({
      entries: entries([completedSearch]),
      busy: false,
      current: false,
      zeroEntryLabel: "Thinking",
    })

    expect(activeHeader.label).toBe("Searching files")
    expect(settledHeader.label).toBe("Searched files")
    expect(activityHeaderKey(activeHeader)).toBe(activityHeaderKey(settledHeader))
  })

  test("updates the Panda gap in place between same-category tool events", () => {
    const completedSearch = toolPart({
      id: "search-between-events",
      phase: "completed",
      action: "Searched files",
      detail: "src/**/*.tsx",
      category: "search-files",
      summary: "Searched files",
      icon: "search",
    })
    const busyGapHeader = resolveActivityHeader({
      entries: entries([completedSearch]),
      busy: true,
      current: true,
      zeroEntryLabel: "Pawing",
    })
    const nextSearchHeader = resolveActivityHeader({
      entries: entries([
        completedSearch,
        toolPart({
          id: "search-after-gap",
          phase: "pending",
          action: "Searching files",
          detail: "packages/**/*.tsx",
          category: "search-files",
          summary: "Searching files",
          icon: "search",
        }),
      ]),
      busy: true,
      current: true,
      zeroEntryLabel: "Pawing",
    })
    const settledHeader = resolveActivityHeader({
      entries: entries([completedSearch]),
      busy: false,
      current: false,
      zeroEntryLabel: "Pawing",
    })

    expect(busyGapHeader.label).toBe("Pawing")
    expect(busyGapHeader.shimmer).toBe(true)
    expect(activityHeaderKey(busyGapHeader)).toBe("activity:search-files")
    expect(activityHeaderKey(busyGapHeader)).toBe(activityHeaderKey(nextSearchHeader))
    expect(nextSearchHeader.label).toBe("Searching files")
    expect(settledHeader.label).toBe("Searched files")
    expect(settledHeader.shimmer).toBe(false)
  })

  test("keeps the edit action when the file target is not known", () => {
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
  })

  test("keeps arguments in the expanded entry but out of the summary title", () => {
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
    expect(entry).toBeDefined()
    if (!entry) throw new Error("Expected activity entry")

    const header = resolveActivityHeader({
      entries: [entry],
      busy: true,
      current: true,
      zeroEntryLabel: "Thinking",
    })

    expect(entry && activityEntryLabel(entry)).toBe("Reading App.tsx")
    expect(header.label).toBe("Reading files")
  })

  test("keeps the generic category label when more entries arrive", () => {
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
      toolPart({
        id: "read-1",
        phase: "completed",
        action: "Read",
        category: "read",
        summary: "Read files",
        icon: "read",
      }),
      toolPart({
        id: "search-1",
        phase: "completed",
        action: "Searched",
        category: "search",
        summary: "Searched code",
        icon: "search",
      }),
      toolPart({
        id: "edit-1",
        phase: "completed",
        action: "Edited",
        category: "edit",
        summary: "Edited files",
        icon: "edit",
      }),
      toolPart({
        id: "shell-1",
        phase: "completed",
        action: "Ran",
        category: "shell",
        summary: "Ran commands",
        icon: "terminal",
      }),
      toolPart({
        id: "edit-2",
        phase: "completed",
        action: "Edited",
        category: "edit",
        summary: "Edited files",
        icon: "edit",
      }),
      toolPart({
        id: "read-2",
        phase: "completed",
        action: "Read",
        category: "read",
        summary: "Read files",
        icon: "read",
      }),
      toolPart({
        id: "edit-3",
        phase: "completed",
        action: "Edited",
        category: "edit",
        summary: "Edited files",
        icon: "edit",
      }),
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
      toolPart({
        id: "failure",
        phase: "error",
        action: "Failed to edit",
        category: "edit",
        summary: "Failed to edit files",
        outcome: "failure",
      }),
      toolPart({
        id: "denied",
        phase: "error",
        action: "Permission denied",
        category: "read",
        summary: "Permission denied",
        outcome: "neutral",
      }),
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
    const reasoning = reasoningPart({
      id: "reasoning-without-heading",
      text: "Considering the change",
      time: { start: 1, end: 4_001 },
    })
    expect(
      resolveActivityHeader({
        entries: entries([reasoning]),
        busy: false,
        current: false,
        zeroEntryLabel: "Thinking",
      }).label,
    ).toBe("Thought for 4s")
  })

  test("keeps an OpenAI reasoning summary visible while active and after completion", () => {
    const title = "Inspecting git worktree list and status"
    const activeEntries = entries([
      reasoningPart({
        id: "reasoning-active",
        text: `**${title}**`,
        time: { start: 1 },
      }),
    ])
    const completedEntries = entries([
      reasoningPart({
        id: "reasoning-completed",
        text: `**${title}**`,
        time: { start: 1, end: 4_001 },
      }),
    ])

    expect(activityEntryLabel(activeEntries[0]!)).toBe(title)
    expect(
      resolveActivityHeader({
        entries: activeEntries,
        busy: true,
        current: true,
        zeroEntryLabel: "Thinking",
      }).label,
    ).toBe(title)
    expect(activityEntryLabel(completedEntries[0]!)).toBe(title)
    expect(
      resolveActivityHeader({
        entries: completedEntries,
        busy: false,
        current: false,
        zeroEntryLabel: "Thinking",
      }).label,
    ).toBe(title)
  })
})
