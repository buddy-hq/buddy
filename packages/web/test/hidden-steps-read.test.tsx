import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { TooltipProvider } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { HiddenSteps } from "../src/components/chat/tools/hidden-steps"
import { createHiddenStepsEntry } from "../src/components/chat/tools/hidden-steps/entries"
import type { MessagePart } from "../src/state/chat-types"

const FILE_BODY_SENTINEL = "UNRENDERED_READ_CONTENT"
const EDIT_ERROR_SENTINEL = "EDIT_FAILED_SENTINEL"
const HIDDEN_SUMMARY_SENTINEL = "HIDDEN_SUMMARY_PAYLOAD_SENTINEL"
const ANSI_ESCAPE = "\u001B"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function createLargeReadPart(): MessagePart {
  const body = `# ${FILE_BODY_SENTINEL}\n${`${FILE_BODY_SENTINEL}\n`.repeat(20_000)}`

  return {
    id: "prt_large_read",
    sessionID: "ses_large_read",
    messageID: "msg_large_read",
    type: "tool",
    tool: "read",
    callID: "call_large_read",
    state: {
      status: "completed",
      input: {
        filePath: "/workspace/large.md",
      },
      metadata: {
        preview: body,
      },
      attachments: [],
      output: `<path>/workspace/large.md</path>\n<content>\n${body}</content>`,
      title: "large.md",
      time: { start: 1, end: 2 },
    },
  }
}

function createFailedEditPart(): MessagePart {
  return {
    id: "prt_failed_edit",
    sessionID: "ses_failed_edit",
    messageID: "msg_failed_edit",
    type: "tool",
    tool: "edit",
    callID: "call_failed_edit",
    state: {
      status: "error",
      input: {
        filePath: "/workspace/notes.md",
        oldString: "old",
        newString: "new",
      },
      metadata: {},
      attachments: [],
      error: EDIT_ERROR_SENTINEL,
      time: { start: 1, end: 2 },
    },
  }
}

function createHiddenSummaryToolPart(): MessagePart {
  return {
    id: "prt_hidden_summary",
    sessionID: "ses_hidden_summary",
    messageID: "msg_hidden_summary",
    type: "tool",
    tool: "dynamic_hidden_summary_tool",
    callID: "call_hidden_summary",
    state: {
      status: "completed",
      input: {
        description: "2 matched memories",
      },
      metadata: {
        buddy: {
          toolUi: {
            presentation: "hidden-summary",
            labels: {
              idle: "Search Memory",
              running: "Searching Memory",
            },
          },
        },
      },
      attachments: [],
      output: HIDDEN_SUMMARY_SENTINEL,
      title: "dynamic_hidden_summary_tool",
      time: { start: 1, end: 2 },
    },
  }
}

function createAnsiBashPart(): MessagePart {
  return {
    id: "prt_ansi_bash",
    sessionID: "ses_ansi_bash",
    messageID: "msg_ansi_bash",
    type: "tool",
    tool: "bash",
    callID: "call_ansi_bash",
    state: {
      status: "completed",
      input: {
        command: "printf red",
      },
      metadata: {},
      attachments: [],
      output: `${ANSI_ESCAPE}[31mred${ANSI_ESCAPE}[0m`,
      title: "printf red",
      time: { start: 1, end: 2 },
    },
  }
}

describe("hidden steps read rendering", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("keeps read bodies out of summaries and hidden-step expansions", async () => {
    const part = createLargeReadPart()
    const entry = createHiddenStepsEntry(part)

    expect(entry.summary).toMatchObject({
      label: "Read: large.md",
      details: [
        { value: "large.md", format: "text" },
        { value: "workspace", format: "text" },
      ],
    })

    await act(async () => {
      root.render(
        <TooltipProvider>
          <HiddenSteps parts={[part]} />
        </TooltipProvider>,
      )
      await flushEffects()
    })

    const trigger = container.querySelector("button")
    expect(trigger).not.toBeNull()

    await act(async () => {
      trigger?.click()
      await flushEffects(20)
    })

    expect(container.querySelectorAll("button")).toHaveLength(1)
    expect(container.textContent).not.toContain(FILE_BODY_SENTINEL)
    expect(container.querySelector("diffs-container")).toBeNull()
  })

  test("shows file-tool errors beside their diff preview", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <HiddenSteps parts={[createFailedEditPart()]} />
        </TooltipProvider>,
      )
      await flushEffects()
    })

    const trigger = container.querySelector("button")
    expect(trigger).not.toBeNull()

    await act(async () => {
      trigger?.click()
      await flushEffects(20)
    })

    expect(container.textContent).toContain(EDIT_ERROR_SENTINEL)
  })

  test("keeps hidden-summary tools on summary rows without exposing raw output", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <HiddenSteps parts={[createHiddenSummaryToolPart()]} />
        </TooltipProvider>,
      )
      await flushEffects()
    })

    const trigger = container.querySelector("button")
    expect(trigger).not.toBeNull()

    await act(async () => {
      trigger?.click()
      await flushEffects(20)
    })

    expect(container.textContent).toContain("Search Memory")
    expect(container.textContent).toContain("2 matched memories")
    expect(container.textContent).not.toContain(HIDDEN_SUMMARY_SENTINEL)
  })

  test("strips ANSI escape sequences from hidden shell output", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <HiddenSteps parts={[createAnsiBashPart()]} />
        </TooltipProvider>,
      )
      await flushEffects()
    })

    const trigger = container.querySelector("button")
    expect(trigger).not.toBeNull()

    await act(async () => {
      trigger?.click()
      await flushEffects(20)
    })

    expect(container.textContent).toContain("$ printf red")
    expect(container.textContent).toContain("red")
    expect(container.textContent).not.toContain(ANSI_ESCAPE)
  })
})
