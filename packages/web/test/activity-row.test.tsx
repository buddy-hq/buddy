import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { TooltipProvider } from "@buddy/ui"

import { ActivityRow, MID_TURN_DEAD_ZONE_MS } from "../src/components/chat/tools/activity-row"
import {
  activityHeaderKey,
  createActivityEntry,
  resolveActivityHeader,
} from "../src/components/chat/tools/activity-row/entries"
import type { MessagePart } from "../src/state/chat-types"
import { activityPresentation, presentationMetadata } from "./tool-presentation-fixtures"

function readPart(): MessagePart {
  return {
    id: "read",
    sessionID: "ses_activity",
    messageID: "msg_activity",
    type: "tool",
    tool: "read",
    callID: "call_read",
    metadata: presentationMetadata(
      activityPresentation({
        phase: "completed",
        action: "Read",
        detail: "App.tsx",
        category: "read-files",
        summary: "Read files",
        icon: "read",
        renderer: "read",
      }),
    ),
    state: {
      status: "completed",
      input: { filePath: "/workspace/App.tsx" },
      output: "source",
      title: "App.tsx",
      metadata: {},
      attachments: [],
      time: { start: 1, end: 2 },
    },
  }
}

function failedEditPart(): MessagePart {
  return {
    id: "edit",
    sessionID: "ses_activity",
    messageID: "msg_activity",
    type: "tool",
    tool: "edit",
    callID: "call_edit",
    metadata: presentationMetadata(
      activityPresentation({
        phase: "error",
        action: "Failed to edit",
        detail: "App.tsx",
        category: "edit-files",
        summary: "Failed to edit files",
        icon: "edit",
        renderer: "edit",
        outcome: { type: "failure" },
      }),
    ),
    state: {
      status: "error",
      input: { filePath: "/workspace/App.tsx" },
      error: "Edit failed",
      time: { start: 1, end: 2 },
    },
  }
}

function reasoningPart(input: { active: boolean }): MessagePart {
  return {
    id: "reasoning-1",
    sessionID: "ses_activity",
    messageID: "msg_activity",
    type: "reasoning",
    text: "",
    time: input.active ? { start: 1 } : { start: 1, end: 2 },
  }
}

function searchPart(input: {
  id: string
  phase: "pending" | "running" | "completed"
  pattern: string
}): MessagePart {
  const base = {
    id: input.id,
    sessionID: "ses_activity",
    messageID: "msg_activity",
    type: "tool" as const,
    tool: "glob",
    callID: `call_${input.id}`,
    metadata: presentationMetadata(
      activityPresentation({
        phase: input.phase,
        action: input.phase === "completed" ? "Searched files" : "Searching files",
        detail: input.pattern,
        category: "search-files",
        summary: input.phase === "completed" ? "Searched files" : "Searching files",
        icon: "search",
        renderer: "search",
      }),
    ),
  }
  if (input.phase === "pending") {
    return { ...base, state: { status: "pending", input: {}, raw: "{}" } }
  }
  if (input.phase === "running") {
    return { ...base, state: { status: "running", input: {}, time: { start: 1 } } }
  }
  return {
    ...base,
    state: {
      status: "completed",
      input: {},
      output: "ok",
      title: "Searched files",
      metadata: {},
      attachments: [],
      time: { start: 1, end: 2 },
    },
  }
}

describe("ActivityRow", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("uses the same margin-free shell for zero-entry optimistic activity", async () => {
    await act(async () => {
      root.render(
        <ActivityRow
          parts={[]}
          seed="activity:turn:0"
          zeroEntryLabel="Thinking"
          isBusy
          isCurrent
        />,
      )
    })

    const row = container.querySelector<HTMLElement>("[data-activity-row]")
    expect(row?.textContent).toContain("Thinking")
    expect(row?.className).toBe("w-full")
    expect(container.querySelector(".bg-linear-to-r")).toBeNull()
  })

  test("shows the working word immediately for an empty busy tail", async () => {
    // The end-of-turn hold-back moved into row projection: a tail row that is
    // still waiting on its pause is not created at all, because hiding it with
    // `invisible` still reserved ~40px and made every turn ending move the
    // transcript twice. By the time this component renders such a row, the
    // decision to show it has already been made, so it must not hide anything.
    // The withholding contract itself is covered in chat-timeline-rows.test.ts.
    await act(async () => {
      root.render(
        <ActivityRow
          parts={[]}
          seed="activity:turn:tail"
          zeroEntryLabel="Pondering"
          isBusy
          isCurrent
        />,
      )
    })

    const row = container.querySelector<HTMLElement>("[data-activity-row]")
    expect(row).not.toBeNull()
    expect(row?.classList.contains("invisible")).toBe(false)
    expect(row?.hasAttribute("aria-hidden")).toBe(false)
    expect(container.textContent).toContain("Pondering")
  })

  test("keeps the header mounted through a Panda gap between same-category tools", async () => {
    const firstRunning = searchPart({
      id: "search-first",
      phase: "running",
      pattern: "src/**/*.tsx",
    })
    const firstCompleted = searchPart({
      id: "search-first",
      phase: "completed",
      pattern: "src/**/*.tsx",
    })
    const nextPending = searchPart({
      id: "search-next",
      phase: "pending",
      pattern: "packages/**/*.tsx",
    })
    const nextCompleted = searchPart({
      id: "search-next",
      phase: "completed",
      pattern: "packages/**/*.tsx",
    })

    await act(async () => {
      root.render(
        <ActivityRow
          parts={[firstRunning]}
          seed="activity:turn:search"
          zeroEntryLabel="Pawing"
          isBusy
          isCurrent
        />,
      )
    })
    const initialHeader = container.querySelector("[aria-label='Searching files']")
    expect(initialHeader).not.toBeNull()
    expect(container.textContent).not.toContain("src/**/*.tsx")

    await act(async () => {
      root.render(
        <ActivityRow
          parts={[firstCompleted]}
          seed="activity:turn:search"
          zeroEntryLabel="Pawing"
          isBusy
          isCurrent
        />,
      )
    })
    expect(container.querySelector("[aria-label='Searching files']")).toBe(initialHeader)
    expect(container.querySelector("[aria-label='Pawing']")).toBeNull()

    await act(async () => {
      root.render(
        <ActivityRow
          parts={[firstCompleted, nextPending]}
          seed="activity:turn:search"
          zeroEntryLabel="Pawing"
          isBusy
          isCurrent
        />,
      )
    })
    expect(container.querySelector("[aria-label='Searching files']")).toBe(initialHeader)

    await act(async () => {
      root.render(
        <ActivityRow
          parts={[firstCompleted, nextCompleted]}
          seed="activity:turn:search"
          zeroEntryLabel="Pawing"
          isBusy
          isCurrent
        />,
      )
    })
    expect(container.querySelector("[aria-label='Searching files']")).toBe(initialHeader)
    expect(container.querySelector("[aria-label='Pawing']")).toBeNull()

    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, MID_TURN_DEAD_ZONE_MS + 50)
        }),
    )
    expect(container.querySelector("[aria-label='Pawing']")).toBe(initialHeader)
  })

  test("shows the entry row even when an expanded group contains one entry", async () => {
    await act(async () => {
      root.render(
        <ActivityRow parts={[readPart()]} seed="activity:turn:0" zeroEntryLabel="Thinking" />,
      )
    })

    const header = container.querySelector<HTMLButtonElement>("[data-activity-row] > button")
    expect(header).not.toBeNull()
    await act(async () => header?.click())

    expect(container.querySelectorAll("[data-activity-entry]")).toHaveLength(1)
    expect(container.textContent).toContain("Read App.tsx")
    expect(container.querySelector(".bg-linear-to-r")).not.toBeNull()
  })

  test("keeps unexpected failure details inside the expanded entry", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <ActivityRow parts={[failedEditPart()]} seed="activity:turn:1" zeroEntryLabel="Pawing" />
        </TooltipProvider>,
      )
    })

    const buttons = container.querySelectorAll<HTMLButtonElement>("button")
    await act(async () => buttons[0]?.click())
    await act(async () => container.querySelectorAll<HTMLButtonElement>("button")[1]?.click())

    expect(container.textContent).toContain("Failed to edit App.tsx")
    expect(container.textContent).toContain("Edit failed")
  })

  test("does not render a collapsed error marker", async () => {
    await act(async () => {
      root.render(
        <ActivityRow parts={[failedEditPart()]} seed="activity:turn:1" zeroEntryLabel="Pawing" />,
      )
    })

    expect(container.querySelector("[data-lucide='circle-alert']")).toBeNull()
    expect(container.querySelector("[data-activity-entry]")).toBeNull()
  })

  // The header's AnimatePresence is keyed on the header identity. The empty
  // "Thinking" placeholder and the first real reasoning entry both render the
  // reasoning header, so they must resolve to the same key — otherwise the
  // identical header crossfades (blur/fade out + in) for no visible reason: the
  // optimistic/tail thinking-block flash.
  test("thinking placeholder shares its header key with real reasoning", () => {
    const placeholder = resolveActivityHeader({
      entries: [],
      busy: true,
      current: true,
      zeroEntryLabel: "Thinking",
    })
    const reasoningEntry = createActivityEntry(reasoningPart({ active: true }))
    expect(reasoningEntry).toBeDefined()
    const reasoning = resolveActivityHeader({
      entries: reasoningEntry ? [reasoningEntry] : [],
      busy: true,
      current: true,
      zeroEntryLabel: "Thinking",
    })

    expect(activityHeaderKey(placeholder)).toBe(activityHeaderKey(reasoning))
  })
})
