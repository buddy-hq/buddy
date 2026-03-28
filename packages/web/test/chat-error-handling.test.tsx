import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { AbstractedToolGroup } from "../src/components/chat/parts/abstracted-tool-group"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function userMessage(): MessageWithParts {
  return {
    info: {
      id: "msg_user",
      sessionID: "ses_error",
      role: "user",
      agent: "buddy",
      model: {
        providerID: "test",
        modelID: "test-model",
      },
      time: {
        created: 1,
      },
    },
    parts: [
      {
        id: "prt_user",
        sessionID: "ses_error",
        messageID: "msg_user",
        type: "text",
        text: "trigger an error",
      },
    ],
  }
}

function assistantMessage(input?: {
  error?: {
    name: string
    message: string
  }
  parts?: MessagePart[]
}): MessageWithParts {
  return {
    info: {
      id: "msg_assistant",
      sessionID: "ses_error",
      role: "assistant",
      parentID: "msg_user",
      providerID: "test",
      modelID: "test-model",
      mode: "buddy",
      agent: "buddy",
      path: {
        cwd: "/repo",
        root: "/",
      },
      time: {
        created: 2,
        completed: 3,
      },
      ...(input?.error ? { error: input.error } : {}),
      tokens: {
        total: 0,
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
      cost: 0,
    },
    parts: input?.parts ?? [],
  }
}

function shellToolPart(input: {
  status: "running" | "error"
  output?: string
  error?: string
  description?: string
}): MessagePart {
  return {
    id: "prt_tool_shell",
    sessionID: "ses_error",
    messageID: "msg_assistant",
    type: "tool",
    tool: "bash",
    callID: "call_shell",
    state: {
      status: input.status,
      input: {
        description: input.description,
      },
      ...(input.output !== undefined ? { output: input.output } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
      time: {
        start: 2,
      },
    },
  }
}

describe("chat error handling", () => {
  let container: HTMLDivElement
  let root: Root
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    originalResizeObserver = globalThis.ResizeObserver
    class MockResizeObserver implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    globalThis.ResizeObserver = originalResizeObserver
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("renders assistant errors as accessible alerts", async () => {
    await act(async () => {
      root.render(
        <ChatTranscript
          messages={[
            userMessage(),
            assistantMessage({
              error: {
                name: "UpstreamError",
                message: "Request failed.",
              },
            }),
          ]}
        />,
      )
      await flushEffects()
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain("Assistant error")
    expect(alert?.textContent).toContain("Request failed.")
  })

  test("uses the shared abstracted thinking placeholder while the assistant is busy", async () => {
    await act(async () => {
      root.render(<ChatTranscript messages={[userMessage()]} isBusy />)
      await flushEffects()
    })

    const placeholder = container.querySelector("[data-abstracted-thinking-placeholder]")
    expect(placeholder).not.toBeNull()
    expect(placeholder?.textContent).toContain("Thinking")

    const title = placeholder?.querySelector("span")
    expect(title?.className).toContain("text-xs")
    expect(title?.className).not.toContain("text-sm")
  })

  test("prefers the latest abstracted tool error over stale live preview state", async () => {
    await act(async () => {
      root.render(
        <AbstractedToolGroup
          parts={[
            shellToolPart({
              status: "running",
              output: "searching the workspace",
            }),
          ]}
          isBusy
        />,
      )
      await flushEffects()
    })

    await act(async () => {
      root.render(
        <AbstractedToolGroup
          parts={[
            shellToolPart({
              status: "error",
              error: "command failed",
            }),
          ]}
          isBusy
        />,
      )
      await flushEffects(140)
    })

    expect(container.textContent).toContain("command failed")
  })

  test("keeps the live abstracted preview at a fixed viewport height while running", async () => {
    await act(async () => {
      root.render(
        <AbstractedToolGroup
          parts={[
            shellToolPart({
              status: "running",
              output: "searching the workspace\ncollecting files\nsummarizing results",
            }),
          ]}
          isBusy
        />,
      )
      await flushEffects()
    })

    const previewViewport = container.querySelector("[data-preview-viewport]")
    expect(previewViewport).not.toBeNull()
    expect((previewViewport as HTMLDivElement).style.height).toBe("80px")
    expect((previewViewport as HTMLDivElement).style.maxHeight).toBe("80px")
  })

  test("shows a generic abstracted tool failure message when the tool provides no text", async () => {
    await act(async () => {
      root.render(
        <AbstractedToolGroup
          parts={[
            shellToolPart({
              status: "error",
            }),
          ]}
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Shell failed.")
  })
})
