import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { TooltipProvider } from "@buddy/ui"
import { SubagentCard } from "../src/components/chat/tools/render/task/subagent-card"
import { TaskToolCard } from "../src/components/chat/tools/render/task/task-tool-card"
import type { ToolState } from "../src/components/chat/tools/types"
import { SubagentCompletionRow } from "../src/components/chat/tools/render/task/subagent-completion-row"
import type { SubagentCompletion, SubagentPresentation } from "@buddy/transcript-contract/subagent"
import { useChatStore } from "../src/state/chat-store"
import {
  applyTranscriptMessageUpdated,
  applyTranscriptPartUpdated,
  resetTranscriptRepositoryForTests,
} from "../src/state/transcript-repository"

const DIRECTORY = "/notebook"
const LAUNCH: SubagentPresentation = {
  ownerSessionID: "owner",
  messageID: "msg_launch",
  callID: "call",
  childSessionID: "child",
  agentID: "general",
  description: "Research",
  background: true,
  workerStatus: "running",
  startedAt: 10,
}
const LAUNCH_STATE: ToolState = {
  status: "completed",
  input: { agent: "general", description: "Research", background: true },
  metadata: { sessionID: "child", status: "running" },
  attachments: [],
  output: "The subagent is working in the background",
}

const MESSAGE_BASE = {
  sessionID: "owner",
  role: "assistant",
  parentID: "",
  agent: "",
  mode: "",
  modelID: "",
  providerID: "",
  path: { cwd: DIRECTORY, root: DIRECTORY },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
} as const

function seedLaunch() {
  applyTranscriptMessageUpdated(DIRECTORY, {
    ...MESSAGE_BASE,
    id: "msg_launch",
    time: { created: 10, completed: 15 },
    finish: "stop",
  })
  applyTranscriptPartUpdated(DIRECTORY, {
    id: "prt_msg_launch_00000000_tool%3Acall",
    sessionID: "owner",
    messageID: "msg_launch",
    type: "tool",
    tool: "subagent",
    callID: "call",
    state: LAUNCH_STATE,
    subagent: LAUNCH,
  })
}

function deliverCompletion(outcome: SubagentCompletion["outcome"]) {
  const completion: SubagentCompletion = {
    ownerSessionID: "owner",
    childSessionID: "child",
    messageID: "msg_done",
    createdAt: 20,
    description: "Research",
    outcome,
    result: "Worker summary",
  }
  applyTranscriptMessageUpdated(DIRECTORY, {
    ...MESSAGE_BASE,
    id: "msg_done",
    kind: "synthetic",
    time: { created: 20, completed: 20 },
    finish: "stop",
  })
  applyTranscriptPartUpdated(DIRECTORY, {
    id: "prt_msg_done_00000000_notice",
    sessionID: "owner",
    messageID: "msg_done",
    type: "notice",
    text: "Subagent completed: Research",
    source: "subagent",
    status: outcome,
    completion,
  })
}

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("subagent card", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    useChatStore.getState().resetRuntimeState()
    resetTranscriptRepositoryForTests()
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

  test("keeps the task context visible while startup becomes live activity", async () => {
    await act(async () => {
      root.render(<SubagentCard taskTitle="Refactor auth module" status="pending" />)
      await flushEffects()
    })

    expect(container.textContent).toContain("Refactor auth module")
    expect(container.textContent).toContain("Starting specialist")
    expect(container.textContent).not.toContain("Handing off")

    await act(async () => {
      root.render(
        <SubagentCard
          taskTitle="Refactor auth module"
          status="running"
          activityLine="Reading auth.ts"
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Refactor auth module")
    expect(container.textContent).toContain("Reading auth.ts")
  })

  test("keeps generic completed task results out of the parent transcript", async () => {
    await act(async () => {
      root.render(
        <TaskToolCard
          subagent={{
            ...LAUNCH,
            background: false,
            workerStatus: "completed",
            description: "Report available tools",
            result: "This large child response is already summarized by the parent.",
          }}
          state={{
            status: "completed",
            input: { agent: "general", description: "Report available tools" },
            metadata: {},
            attachments: [],
            output:
              '<subagent sessionID="child" state="completed">\nThis large child response is already summarized by the parent.\n</subagent>',
          }}
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Report available tools")
    expect(container.textContent).not.toContain("This large child response")
  })

  test("opens the child session recorded by the completed task", async () => {
    const openedSessionIDs: string[] = []

    await act(async () => {
      root.render(
        <TaskToolCard
          subagent={{
            ...LAUNCH,
            childSessionID: "child-session",
            background: false,
            workerStatus: "completed",
            description: "Review architecture",
          }}
          state={{
            status: "completed",
            input: { agent: "general", description: "Review architecture" },
            metadata: { sessionID: "child-session", status: "completed" },
            attachments: [],
            output: "",
          }}
          onOpenSession={(sessionID) => {
            openedSessionIDs.push(sessionID)
          }}
        />,
      )
      await flushEffects()
    })

    const headerButton = container.querySelector('[data-component="subagent-card"] > button')
    if (!(headerButton instanceof HTMLButtonElement)) {
      throw new Error("Expected the rendered subagent header to be a button")
    }

    await act(async () => {
      headerButton.click()
      await flushEffects()
    })

    expect(openedSessionIDs).toEqual(["child-session"])
  })

  test("keeps a successful background launch working, then waiting, and openable", async () => {
    const opened: string[] = []
    useChatStore.getState().applySessionStatus(DIRECTORY, "child", { type: "busy" })
    await act(async () => {
      root.render(
        <TaskToolCard
          directory={DIRECTORY}
          subagent={LAUNCH}
          state={LAUNCH_STATE}
          onOpenSession={(id) => opened.push(id)}
        />,
      )
      await flushEffects()
    })
    expect(container.textContent).toContain("Working")
    expect(container.textContent).not.toContain("The subagent is working in the background")

    await act(async () => {
      useChatStore.getState().applySessionStatus(DIRECTORY, "child", { type: "idle" })
      await flushEffects()
    })
    expect(container.textContent).toContain("Waiting for result")

    const button = container.querySelector('[data-component="subagent-card"] > button')
    if (!(button instanceof HTMLButtonElement)) throw new Error("Missing open-child button")
    await act(async () => {
      button.click()
      await flushEffects()
    })
    expect(opened).toEqual(["child"])
  })

  test.each(["completed", "error", "cancelled"] as const)(
    "settles a background card when its %s completion arrives",
    async (outcome) => {
      seedLaunch()
      await act(async () => {
        root.render(
          <TooltipProvider>
            <TaskToolCard directory={DIRECTORY} subagent={LAUNCH} state={LAUNCH_STATE} />
          </TooltipProvider>,
        )
        await flushEffects()
      })
      expect(container.textContent).toContain("Waiting for result")

      await act(async () => {
        deliverCompletion(outcome)
        await flushEffects()
      })
      expect(container.textContent).not.toContain("Waiting for result")
      expect(container.textContent).toContain("Research")
      expect(container.querySelector('[data-component="subagent-card-error-body"]') !== null).toBe(
        outcome === "error",
      )
      if (outcome === "error") expect(container.textContent).toContain("Worker summary")
      if (outcome === "cancelled") expect(container.textContent).toContain("Cancelled")
    },
  )

  test.each(["completed", "error", "cancelled"] as const)(
    "links a %s completion row to its child",
    async (outcome) => {
      const opened: string[] = []
      await act(async () => {
        root.render(
          <SubagentCompletionRow
            completion={{
              ownerSessionID: "owner",
              childSessionID: "child",
              messageID: "msg_done",
              createdAt: 20,
              description: "Research",
              outcome,
              result: "Details",
            }}
            onOpenSession={(id) => opened.push(id)}
          />,
        )
        await flushEffects()
      })
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        outcome === "error" ? "Failed" : outcome === "cancelled" ? "Cancelled" : "Completed",
      )
      expect(container.textContent).not.toContain("Details")
      const button = container.querySelector("button")
      if (!button) throw new Error("Missing completion button")
      await act(async () => {
        button.click()
        await flushEffects()
      })
      expect(opened).toEqual(["child"])
    },
  )
})
