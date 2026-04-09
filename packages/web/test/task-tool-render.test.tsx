import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderTaskTool } from "../src/components/chat/tools/render/task"
import type { ToolPartProps } from "../src/components/chat/tools/registry"
import { useChatStore } from "../src/state/chat-store"
import { seedDirectoryChatState } from "./test-utils"

async function flushEffects() {
  await act(async () => {
    await Promise.resolve()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  })
}

describe("renderTaskTool", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    useChatStore.persist.clearStorage()
    useChatStore.setState((state) => ({
      ...state,
      directories: {},
    }))
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    useChatStore.setState((state) => ({
      ...state,
      directories: {},
    }))
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("shows the spawned child session details instead of only the generic task label", async () => {
    seedDirectoryChatState("/repo", {
      sessions: [
        {
          id: "child-session",
          title: "Read AGENTS.md (@Dalton subagent)",
          parentID: "root-session",
          time: {
            created: Date.now() - 60_000,
            updated: Date.now() - 60_000,
          },
        },
      ],
      isReady: true,
    })

    const props: ToolPartProps = {
      part: {
        id: "part-1",
        sessionID: "root-session",
        messageID: "message-1",
        type: "tool",
      },
      state: {
        status: "completed",
        input: {
          description: "Read AGENTS.md",
          subagent_type: "Dalton",
        },
        metadata: {
          sessionId: "child-session",
        },
        attachments: [],
      },
      info: {
        title: "Task",
      },
      tool: "task",
      directory: "/repo",
    }

    await act(async () => {
      root.render(renderTaskTool(props))
      await flushEffects()
    })

    expect(container.textContent).toContain("Read AGENTS.md")
    expect(container.textContent).toContain("Dalton")
    expect(container.textContent).not.toContain("Read AGENTS.md (@Dalton subagent)")
  })
})
