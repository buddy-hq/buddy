import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { chatTranscriptEqual } from "../src/components/chat/utils/message-utils"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"
import { seedDirectoryChatState } from "./test-utils"
import {
  createChatTranscriptTestViewport,
  type ChatTranscriptTestViewport,
} from "./chat-transcript-harness"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function retryAction() {}
function replacementRetryAction() {}
function continueTruncated() {}
function replacementContinueTruncated() {}

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

function hiddenAutoRepairUserMessage(): MessageWithParts {
  const info = {
    id: "msg_auto_repair",
    sessionID: "ses_error",
    role: "user" as const,
    agent: "buddy",
    model: {
      providerID: "test",
      modelID: "test-model",
    },
    metadata: {
      kind: "mermaid_auto_repair",
      hiddenFromUser: true,
    },
    time: {
      created: 2,
    },
  }

  return {
    info,
    parts: [
      {
        id: "prt_auto_repair",
        sessionID: "ses_error",
        messageID: "msg_auto_repair",
        type: "text",
        text: "internal Mermaid auto repair prompt",
      },
    ],
  }
}

function prefixedAutoRepairUserMessage(): MessageWithParts {
  const messageID = "msg_buddy_mermaid_auto_repair_request"
  return {
    info: {
      id: messageID,
      sessionID: "ses_error",
      role: "user",
      agent: "buddy",
      model: {
        providerID: "test",
        modelID: "test-model",
      },
      time: {
        created: 3,
      },
    },
    parts: [
      {
        id: "prt_prefixed_auto_repair",
        sessionID: "ses_error",
        messageID,
        type: "text",
        text: "prefixed internal Mermaid auto repair prompt",
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

describe("chat transcript memoization", () => {
  test("invalidates when an error-recovery callback changes", () => {
    const previous = {
      directory: "/repo",
      onRetryAction: retryAction,
      onContinueTruncated: continueTruncated,
    }

    expect(
      chatTranscriptEqual(previous, {
        ...previous,
        onRetryAction: replacementRetryAction,
      }),
    ).toBe(false)
    expect(
      chatTranscriptEqual(previous, {
        ...previous,
        onContinueTruncated: replacementContinueTruncated,
      }),
    ).toBe(false)
  })
})

describe("chat error handling", () => {
  let container: HTMLDivElement
  let root: Root
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined
  let transcriptViewport: ChatTranscriptTestViewport

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    transcriptViewport = createChatTranscriptTestViewport()

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
    transcriptViewport.cleanup()
    container.remove()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("keeps terminal assistant errors out of the transcript", async () => {
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
      root.render(<ChatTranscript directory="/repo" scrollViewportRef={transcriptViewport.ref} />)
      await flushEffects()
    })

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('[data-timeline-row="Error"]')).toBeNull()
    expect(container.textContent).not.toContain("Request failed.")
  })

  test("hides user messages marked hiddenFromUser", async () => {
    await act(async () => {
      seedDirectoryChatState("/repo", {
        messages: [userMessage(), hiddenAutoRepairUserMessage()],
      })
      root.render(<ChatTranscript directory="/repo" scrollViewportRef={transcriptViewport.ref} />)
      await flushEffects()
    })

    expect(container.textContent).toContain("trigger an error")
    expect(container.textContent).not.toContain("internal Mermaid auto repair prompt")
  })

  test("hides prefixed auto-repair user messages without metadata", async () => {
    await act(async () => {
      seedDirectoryChatState("/repo", {
        messages: [userMessage(), prefixedAutoRepairUserMessage()],
      })
      root.render(<ChatTranscript directory="/repo" scrollViewportRef={transcriptViewport.ref} />)
      await flushEffects()
    })

    expect(container.textContent).toContain("trigger an error")
    expect(container.textContent).not.toContain("prefixed internal Mermaid auto repair prompt")
  })
})
