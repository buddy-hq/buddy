import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QuestionDock } from "../src/components/directory-chat/question-dock"
import type { QuestionRequest } from "../src/state/chat-types"

const NO_OP_REPLY = async () => undefined
const NO_OP_REJECT = async () => undefined

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function findOption(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("div")).find((element) => {
    return element.className.includes("cursor-pointer") && element.textContent?.includes(label)
  })
}

function buildRequest(): QuestionRequest {
  return {
    id: "question-stable",
    sessionID: "session-1",
    questions: [
      {
        header: "Question 1",
        question: "Pick one",
        options: [
          { label: "A", description: "Option A" },
          { label: "B", description: "Option B" },
        ],
      },
      {
        header: "Question 2",
        question: "Pick another",
        options: [
          { label: "C", description: "Option C" },
          { label: "D", description: "Option D" },
        ],
      },
    ],
  }
}

describe("QuestionDock request stability", () => {
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

  test("does not clear answers when the same request rerenders with rebuilt question arrays", async () => {
    const request = buildRequest()

    await act(async () => {
      root.render(<QuestionDock request={request} onReply={NO_OP_REPLY} onReject={NO_OP_REJECT} />)
      await flushEffects()
    })

    const optionA = findOption(container, "A")
    if (!(optionA instanceof HTMLDivElement)) {
      throw new Error("Option A not found")
    }

    await act(async () => {
      optionA.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    expect(container.textContent).toContain("Pick another")

    await act(async () => {
      root.render(
        <QuestionDock
          request={{
            ...request,
            questions: request.questions.map((question) => ({
              ...question,
              options: question.options.map((option) => ({ ...option })),
            })),
          }}
          onReply={NO_OP_REPLY}
          onReject={NO_OP_REJECT}
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Pick another")
  })
})
