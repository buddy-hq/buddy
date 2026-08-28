import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { SubagentCard } from "../src/components/chat/tools/render/task/subagent-card"
import { TaskToolCard } from "../src/components/chat/tools/render/task/task-tool-card"

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
          state={{
            status: "completed",
            input: {
              subagent_type: "general",
              description: "Report available tools",
            },
            metadata: {},
            attachments: [],
            output:
              "<task_result>This large child response is already summarized by the parent.</task_result>",
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
          state={{
            status: "completed",
            input: {
              subagent_type: "general",
              description: "Review architecture",
            },
            metadata: { sessionId: "child-session" },
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
})
