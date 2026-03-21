import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import type { MessageWithParts } from "../src/state/chat-types"

const PLOT_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p3xK+QAAAAASUVORK5CYII="

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("ChatTranscript tool attachments", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("renders calculator plot attachments inline without a no-output placeholder", async () => {
    const messages: MessageWithParts[] = [
      {
        info: {
          id: "msg_user",
          sessionID: "ses_math",
          role: "user",
          agent: "math-buddy",
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
            sessionID: "ses_math",
            messageID: "msg_user",
            type: "text",
            text: "plot y = x^2",
          },
        ],
      },
      {
        info: {
          id: "msg_assistant",
          sessionID: "ses_math",
          role: "assistant",
          parentID: "msg_user",
          providerID: "test",
          modelID: "test-model",
          mode: "math-buddy",
          agent: "math-buddy",
          path: {
            cwd: "/repo",
            root: "/",
          },
          time: {
            created: 2,
            completed: 3,
          },
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
        parts: [
          {
            id: "prt_tool",
            sessionID: "ses_math",
            messageID: "msg_assistant",
            type: "tool",
            tool: "python_calculator",
            callID: "call_plot",
            state: {
              status: "completed",
              input: {
                code: "plot(x**2)",
              },
              output: "",
              title: "Python calculator",
              metadata: {
                artifact: "PythonCalculatorOutput",
              },
              time: {
                start: 2,
                end: 3,
              },
              attachments: [
                {
                  id: "prt_plot",
                  sessionID: "ses_math",
                  messageID: "msg_assistant",
                  type: "file",
                  mime: "image/png",
                  filename: "figure-1.png",
                  url: PLOT_DATA_URL,
                },
              ],
            },
          },
        ],
      },
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} />)
      await flushEffects()
    })

    const image = container.querySelector('[data-slot="tool-attachment-image"]')
    expect(image).not.toBeNull()
    expect(image?.getAttribute("src")).toBe(PLOT_DATA_URL)
    expect(image?.getAttribute("alt")).toBe("figure-1.png")
    expect(container.textContent?.includes("No output")).toBe(false)
  })
})
