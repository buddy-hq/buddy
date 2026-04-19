import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QuestionDock } from "../src/components/directory-chat/question-dock"
import type { QuestionRequest } from "../src/state/chat-types"
import { language } from "../src/context/language"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function dispatchKey(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
}

function findButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  )
}

function buildRequest(): QuestionRequest {
  return {
    id: "question-submit-guard",
    sessionID: "session-1",
    questions: [
      {
        header: "First",
        question: "Pick the first answer",
        options: [{ label: "Alpha", description: "First choice" }],
        custom: false,
      },
      {
        header: "Second",
        question: "Pick the second answer",
        options: [{ label: "Beta", description: "Second choice" }],
        custom: false,
      },
    ],
  }
}

describe("QuestionDock submit guard", () => {
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

  test("does not submit from confirm until every question has an answer", async () => {
    const replies: string[][][] = []

    await act(async () => {
      root.render(
        <QuestionDock
          request={buildRequest()}
          onReply={async (answers) => {
            replies.push(answers)
          }}
          onReject={async () => undefined}
        />,
      )
      await flushEffects()
    })

    await act(async () => {
      dispatchKey("1")
      await flushEffects()
    })

    const confirmButton = findButtonByText(container, language.t("chat.questionDock.confirm"))
    if (!(confirmButton instanceof HTMLButtonElement)) {
      throw new Error("Confirm button not found")
    }

    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      dispatchKey("Enter")
      await flushEffects()
    })

    expect(replies).toEqual([])

    const secondTab = findButtonByText(container, "Second")
    if (!(secondTab instanceof HTMLButtonElement)) {
      throw new Error("Second question tab not found")
    }

    await act(async () => {
      secondTab.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      dispatchKey("1")
      dispatchKey("Enter")
      await flushEffects()
    })

    expect(replies).toEqual([[["Alpha"], ["Beta"]]])
  })
})
