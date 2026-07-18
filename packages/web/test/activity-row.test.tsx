import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { TooltipProvider } from "@buddy/ui"

import { ActivityRow } from "../src/components/chat/tools/activity-row"
import type { MessagePart } from "../src/state/chat-types"
import {
  activityPresentation,
  presentationMetadata,
} from "./tool-presentation-fixtures"

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

  test("shows the entry row even when an expanded group contains one entry", async () => {
    await act(async () => {
      root.render(
        <ActivityRow
          parts={[readPart()]}
          seed="activity:turn:0"
          zeroEntryLabel="Thinking"
        />,
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
          <ActivityRow
            parts={[failedEditPart()]}
            seed="activity:turn:1"
            zeroEntryLabel="Pawing"
          />
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
        <ActivityRow
          parts={[failedEditPart()]}
          seed="activity:turn:1"
          zeroEntryLabel="Pawing"
        />,
      )
    })

    expect(container.querySelector("[data-lucide='circle-alert']")).toBeNull()
    expect(container.querySelector("[data-activity-entry]")).toBeNull()
  })
})
