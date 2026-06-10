import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { AssistantTextPart } from "../src/components/chat/parts/assistant-part/text-part"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import type { ChatTextPart } from "../src/components/chat/utils/part-guards"
import { MARKDOWN_MATH_PLACEHOLDER_COMPONENT } from "../src/components/markdown/markdown-math-placeholder"
import { useChatStore } from "../src/state/chat-store"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  seedDirectoryChatState,
} from "./test-utils"

const directory = "/repo"
const sessionID = "ses_interrupted"
const assistantMessageID = "msg_assistant_interrupted"
const assistantPartID = "prt_assistant_interrupted"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
  await Promise.resolve()
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (condition()) return
    await act(async () => {
      await flushEffects(20)
    })
  }

  throw new Error("Timed out waiting for condition")
}

function interruptedTextPart(text: string): ChatTextPart {
  const part: ChatTextPart = {
    id: assistantPartID,
    sessionID,
    messageID: assistantMessageID,
    type: "text",
    text,
  }
  return part
}

describe("interrupted chat rendering", () => {
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
    useChatStore.setState({ directories: {} })
    container.remove()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("treats interrupted assistant finishes as tolerant markdown", async () => {
    const incompleteMathText = [
      "(15) Neyman-Pearson lemma:",
      "",
      String.raw`$$ \frac{L(\theta_0 \mid x)}{L(\theta_1 \mid x)} ${"\\"}`,
    ].join("\n")

    await act(async () => {
      seedDirectoryChatState(directory, {
        sessionID,
        isReady: true,
        isBusy: false,
        sessionStatusByID: {
          [sessionID]: { type: "idle" },
        },
        messages: [
          createMessageWithParts(
            createAssistantMessageInfo({
              id: assistantMessageID,
              sessionID,
              time: {
                created: 1,
                completed: 2,
              },
              finish: "interrupted",
            }),
            [interruptedTextPart(incompleteMathText)],
          ),
        ],
      })
      root.render(<ChatTranscript directory={directory} />)
      await flushEffects()
    })

    await waitFor(() => {
      return (
        container.querySelector(`[data-component="${MARKDOWN_MATH_PLACEHOLDER_COMPONENT}"]`) !==
        null
      )
    })

    expect(container.textContent).toContain("Neyman-Pearson lemma")
    expect(container.textContent).toContain("Interrupted")
    expect(container.textContent).not.toContain("\\frac")
  })

  test("flushes locally paced text when a live turn is interrupted", async () => {
    const firstText = "Short prefix."
    const finalText = `${firstText} ${"This response arrived in a large buffered chunk. ".repeat(30)}Final tail.`

    await act(async () => {
      root.render(
        <AssistantTextPart part={interruptedTextPart(firstText)} copyEnabled={false} streaming />,
      )
      await flushEffects()
    })
    await waitFor(() => container.textContent?.includes(firstText) === true)

    await act(async () => {
      root.render(
        <AssistantTextPart part={interruptedTextPart(finalText)} copyEnabled={false} streaming />,
      )
      await flushEffects(30)
    })

    expect(container.textContent).not.toContain("Final tail.")

    await act(async () => {
      root.render(
        <AssistantTextPart
          part={interruptedTextPart(finalText)}
          copyEnabled={false}
          interrupted
          streaming
        />,
      )
      await flushEffects()
    })

    await waitFor(() => container.textContent?.includes("Final tail.") === true)
  })

  test("settles an ended text part while the surrounding turn is still busy", async () => {
    const firstText = "Short prefix."
    const finalText = `${firstText} ${"This response arrived before the task cards settled. ".repeat(30)}Final tail.`

    await act(async () => {
      seedDirectoryChatState(directory, {
        sessionID,
        isReady: true,
        isBusy: true,
        sessionStatusByID: {
          [sessionID]: { type: "busy" },
        },
        messages: [
          createMessageWithParts(
            createAssistantMessageInfo({
              id: assistantMessageID,
              sessionID,
              time: { created: 1 },
            }),
            [
              {
                ...interruptedTextPart(firstText),
                time: {
                  start: 1,
                },
              },
            ],
          ),
        ],
      })
      root.render(<ChatTranscript directory={directory} />)
      await flushEffects()
    })

    await act(async () => {
      useChatStore.getState().applyPartUpdated(directory, {
        ...interruptedTextPart(finalText),
        time: {
          start: 1,
          end: 2,
        },
      })
      await flushEffects()
    })

    expect(container.textContent).toContain("Final tail.")
    expect(useChatStore.getState().directories[directory]?.isBusy).toBe(true)
  })
})
