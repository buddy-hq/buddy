import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { TooltipProvider } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { HiddenSteps } from "../src/components/chat/tools/hidden-steps"
import { createHiddenStepsEntry } from "../src/components/chat/tools/hidden-steps/entries"
import {
  useFileToolHeaderDisplay,
  type TUseFileToolHeaderDisplayInput,
} from "../src/components/chat/tools/hidden-steps/use-file-tool-header-display"
import type { ToolState } from "../src/components/chat/tools/registry"
import { useSubagentCardData } from "../src/components/chat/tools/render/task/task-card-header"
import { SKILL_TOOL_ICON } from "../src/components/chat/tools/tool-icons"
import { useChatStore } from "../src/state/chat-store"
import type { MessagePart, SessionInfo } from "../src/state/chat-types"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  seedDirectoryChatState,
} from "./test-utils"

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

function createSkillToolPart(): MessagePart {
  return {
    id: "prt_skill",
    sessionID: "ses_skill",
    messageID: "msg_skill",
    type: "tool",
    tool: "skill",
    callID: "call_skill",
    state: {
      status: "completed",
      input: {
        name: "find-indian-education-resources",
      },
      metadata: {
        name: "find-indian-education-resources",
      },
      attachments: [],
      output:
        '<skill_content name="find-indian-education-resources">Hidden skill content</skill_content>',
      time: { start: 1, end: 2 },
    },
  }
}

function createSkillReferenceReadPart(): MessagePart {
  return {
    id: "prt_skill_reference_read",
    sessionID: "ses_skill_reference_child",
    messageID: "msg_skill_reference_child",
    type: "tool",
    tool: "read",
    callID: "call_skill_reference_read",
    state: {
      status: "running",
      input: {
        filePath:
          "/workspace/.agents/skills/react-best-practices/references/textbooks-and-board.md",
      },
      metadata: {},
      attachments: [],
      title: "textbooks-and-board.md",
      time: { start: 1 },
    },
  }
}

function FileToolHeaderHarness({ input }: { input: TUseFileToolHeaderDisplayInput }) {
  const displayState = useFileToolHeaderDisplay(input)
  return (
    <div data-icon={displayState.icon === SKILL_TOOL_ICON ? "skill" : displayState.icon ? "other" : "none"}>
      {displayState.label}
    </div>
  )
}

function SubagentCardDataHarness({
  state,
  directory,
}: {
  state: ToolState
  directory: string
}) {
  const displayState = useSubagentCardData({ state, directory })
  return (
    <div data-icon={displayState.activityIcon === SKILL_TOOL_ICON ? "skill" : displayState.activityIcon ? "other" : "none"}>
      {displayState.activityLine}
    </div>
  )
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
    useChatStore.setState({ directories: {} })
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

  test("does not make skill tools expandable in hidden steps", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <HiddenSteps parts={[createSkillToolPart()]} />
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

    expect(container.textContent).toContain("Skill Used: Find Indian Education Resources")
    expect(container.textContent).not.toContain("Hidden skill content")
    expect(container.querySelectorAll("button")).toHaveLength(1)
  })

  test("flushes the latest file after the throttle window", async () => {
    await act(async () => {
      root.render(
        <FileToolHeaderHarness
          input={{
            verb: "Reading",
            fileName: "App.tsx",
            throttleFileTools: true,
            isBusy: true,
          }}
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Reading App.tsx")

    await act(async () => {
      root.render(
        <FileToolHeaderHarness
          input={{
            verb: "Reading",
            fileName: "Card.tsx",
            throttleFileTools: true,
            isBusy: true,
          }}
        />,
      )
      await flushEffects(20)
    })

    expect(container.textContent).toContain("Reading App.tsx")
    expect(container.textContent).not.toContain("Card.tsx")

    await act(async () => {
      await flushEffects(650)
    })

    expect(container.textContent).toContain("Reading Card.tsx")
    expect(container.textContent).not.toContain("App.tsx")

    await act(async () => {
      root.render(
        <FileToolHeaderHarness
          input={{
            verb: "Reading",
            fileName: "Form.tsx",
            throttleFileTools: true,
            isBusy: true,
          }}
        />,
      )
      await flushEffects(20)
    })

    expect(container.textContent).toContain("Reading Card.tsx")
    expect(container.textContent).not.toContain("Form.tsx")

    await act(async () => {
      await flushEffects(650)
    })

    expect(container.textContent).toContain("Reading Form.tsx")
    expect(container.textContent).not.toContain("Card.tsx")
  })

  test("preserves reference label and boxes icon while throttled", async () => {
    await act(async () => {
      root.render(
        <FileToolHeaderHarness
          input={{
            label: "Using Reference Internal Scaffolds",
            icon: SKILL_TOOL_ICON,
            verb: "Using Reference",
            fileName: "Internal Scaffolds",
            throttleFileTools: true,
            isBusy: true,
          }}
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Using Reference Internal Scaffolds")
    expect(container.textContent).not.toContain("Internal Scaffolds Internal Scaffolds")
    expect(container.firstElementChild?.getAttribute("data-icon")).toBe("skill")
  })

  test("keeps the resolved skill icon for throttled subagent activity", async () => {
    const directory = "/repo-subagent"
    const childSessionID = "ses_skill_reference_child"
    const childSession: SessionInfo = {
      id: childSessionID,
      title: "Reference Work (@reference_helper subagent)",
      time: { created: 1, updated: 1 },
    }

    await act(async () => {
      seedDirectoryChatState(directory, {
        sessions: [childSession],
        messagesBySessionID: {
          [childSessionID]: [
            createMessageWithParts(
              createAssistantMessageInfo({
                id: "msg_skill_reference_child",
                sessionID: childSessionID,
                time: { created: 1 },
              }),
              [createSkillReferenceReadPart()],
            ),
          ],
        },
      })

      root.render(
        <SubagentCardDataHarness
          directory={directory}
          state={{
            status: "running",
            input: { subagent_type: "reference_helper" },
            metadata: { sessionId: childSessionID },
            attachments: [],
          }}
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Using Reference Textbooks And Board")
    expect(container.firstElementChild?.getAttribute("data-icon")).toBe("skill")
  })
})
