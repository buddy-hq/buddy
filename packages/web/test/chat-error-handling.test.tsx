import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"
import { seedDirectoryChatState } from "./test-utils"

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
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("renders assistant errors as accessible alerts", async () => {
    await act(async () => {
      seedDirectoryChatState("/repo", {
        messages: [
          userMessage(),
          assistantMessage({
            error: {
              name: "UpstreamError",
              message: "Request failed.",
            },
          }),
        ],
      })
      root.render(<ChatTranscript directory="/repo" />)
      await flushEffects()
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain("Assistant error")
    expect(alert?.textContent).toContain("Request failed.")
  })
})
