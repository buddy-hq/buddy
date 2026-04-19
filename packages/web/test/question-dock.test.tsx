import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QuestionDock } from "../src/components/directory-chat/question-dock"
import type { QuestionRequest } from "../src/state/chat-types"
import { language } from "../src/context/language"

const NO_OP_REPLY = async () => undefined
const NO_OP_REJECT = async () => undefined

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function buildRequest(input: {
  id: string
  question: string
  options: Array<{ label: string; description: string }>
  custom?: boolean
  multiple?: boolean
}): QuestionRequest {
  return {
    id: input.id,
    sessionID: "session-1",
    questions: [
      {
        header: "Question",
        question: input.question,
        options: input.options,
        ...(input.custom === undefined ? {} : { custom: input.custom }),
        ...(input.multiple === undefined ? {} : { multiple: input.multiple }),
      },
    ],
  }
}

function dispatchKey(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
}

function findButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  )
}

function findOption(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("div")).find((element) => {
    return element.className.includes("cursor-pointer") && element.textContent?.includes(text)
  })
}

describe("QuestionDock", () => {
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

  test("resets selected answers when a new request arrives", async () => {
    await act(async () => {
      root.render(
        <QuestionDock
          request={buildRequest({
            id: "question-1",
            question: "Pick one",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" },
            ],
            custom: true,
            multiple: true,
          })}
          onReply={NO_OP_REPLY}
          onReject={NO_OP_REJECT}
        />,
      )
      await flushEffects()
    })

    const optionA = findOption(container, "A")
    if (!(optionA instanceof HTMLDivElement)) {
      throw new Error("Option A row not found")
    }

    await act(async () => {
      optionA.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    await act(async () => {
      root.render(
        <QuestionDock
          request={buildRequest({
            id: "question-2",
            question: "Choose again",
            options: [
              { label: "C", description: "Option C" },
              { label: "D", description: "Option D" },
            ],
            custom: true,
            multiple: true,
          })}
          onReply={NO_OP_REPLY}
          onReject={NO_OP_REJECT}
        />,
      )
      await flushEffects()
    })

    const confirmButton = findButtonByText(container, language.t("chat.questionDock.confirm"))
    if (!(confirmButton instanceof HTMLButtonElement)) {
      throw new Error("Confirm button not found after request update")
    }

    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    expect(container.textContent).toContain(language.t("chat.questionDock.notAnswered"))
  })

  test("shows a custom textarea when question custom flag is omitted", async () => {
    await act(async () => {
      root.render(
        <QuestionDock
          request={buildRequest({
            id: "question-default-custom",
            question: "Provide your answer",
            options: [{ label: "Preset", description: "Preset option" }],
            multiple: true,
          })}
          onReply={NO_OP_REPLY}
          onReject={NO_OP_REJECT}
        />,
      )
      await flushEffects()
    })

    const customOption = findOption(container, language.t("chat.questionDock.typeOwnAnswer"))
    if (!(customOption instanceof HTMLDivElement)) {
      throw new Error("Custom option not found")
    }

    await act(async () => {
      customOption.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    const placeholder = language.t("chat.questionDock.customPlaceholder")
    const input = container.querySelector(`textarea[placeholder="${placeholder}"]`)
    expect(input).not.toBeNull()
  })

  test("submits a typed custom answer when the custom option is chosen", async () => {
    const replies: string[][][] = []

    await act(async () => {
      root.render(
        <QuestionDock
          request={buildRequest({
            id: "question-custom-answer",
            question: "Choose the best answer",
            options: [
              { label: "Preset", description: "Preset option" },
              { label: "Other", description: "Another option" },
            ],
            custom: true,
          })}
          onReply={async (answers) => {
            replies.push(answers)
          }}
          onReject={NO_OP_REJECT}
        />,
      )
      await flushEffects()
    })

    const customOption = findOption(container, language.t("chat.questionDock.typeOwnAnswer"))
    if (!(customOption instanceof HTMLDivElement)) {
      throw new Error("Custom option not found")
    }

    await act(async () => {
      customOption.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    const placeholder = language.t("chat.questionDock.customPlaceholder")
    const input = container.querySelector(`textarea[placeholder="${placeholder}"]`)
    if (!(input instanceof HTMLTextAreaElement)) {
      throw new Error("Custom textarea not found")
    }

    await act(async () => {
      input.value = "Typed custom answer"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      dispatchKey("Enter")
      await flushEffects()
    })

    expect(replies).toEqual([[["Typed custom answer"]]])
  })
})
