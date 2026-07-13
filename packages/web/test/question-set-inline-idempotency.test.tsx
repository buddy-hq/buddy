import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  QuestionSetInlineView,
  type QuestionSetObject,
} from "../src/components/chat/tools/render/question-set/question-set-inline-view"

const QUESTION_SET: QuestionSetObject = {
  objectID: "question-set-idempotency-test",
  title: "Idempotency test",
  groupType: "quiz",
  questions: [
    {
      id: "question-one",
      prompt: "Choose an answer",
      goalIds: ["goal-one"],
      payload: {
        multipleSelect: false,
        choices: [
          { id: "choice-one", content: "Choice one" },
          { id: "choice-two", content: "Choice two" },
        ],
      },
    },
  ],
}

function clickElement(element: Element | undefined): void {
  if (!element) throw new Error("Expected clickable element.")
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
}

function findElement(selector: string, text: string): Element | undefined {
  return [...document.body.querySelectorAll(selector)].find((element) =>
    element.textContent?.includes(text),
  )
}

describe("inline question-set idempotency", () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  afterEach(() => {
    act(() => root?.unmount())
    root = undefined
    container?.remove()
    container = undefined
    document.body.replaceChildren()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("reuses the failed submission key after remount", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    const submissionIDs: string[] = []
    const onSubmit = async (_answers: Record<string, string[]>, submissionID: string) => {
      submissionIDs.push(submissionID)
      throw new Error("Response was lost")
    }
    const renderQuestionSet = () => (
      <QuestionSetInlineView
        questionSet={QUESTION_SET}
        persistKey="question-set-idempotency-remount"
        defaultOpen
        hideCard
        onSubmit={onSubmit}
      />
    )

    root = createRoot(container)
    await act(async () => root?.render(renderQuestionSet()))
    await act(async () => clickElement(findElement("[role='button']", "Choice one")))
    await act(async () => {
      clickElement(findElement("button", "Submit Quiz"))
      await Promise.resolve()
    })
    expect(submissionIDs).toHaveLength(1)

    await act(async () => root?.unmount())
    root = createRoot(container)
    await act(async () => root?.render(renderQuestionSet()))
    await act(async () => {
      clickElement(findElement("button", "Submit Quiz"))
      await Promise.resolve()
    })

    expect(submissionIDs).toHaveLength(2)
    expect(submissionIDs[1]).toBe(submissionIDs[0])
  })
})
