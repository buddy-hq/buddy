import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import { renderQuestionTool } from "../src/components/chat/tools/render/question"
import { QuestionDock } from "../src/components/directory-chat/question-dock"
import { QuestionInlineMarkdown } from "../src/components/chat/tools/render/question-set/question-markdown"
import type { ToolPartProps, ToolState } from "../src/components/chat/tools/registry"
import type { QuestionRequest } from "../src/state/chat-types"
import { language } from "../src/context/language"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000) {
  const startTime = Date.now()
  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Timed out waiting for condition")
    }
    await flushEffects(10)
  }
}

function createQuestionToolProps(): ToolPartProps {
  return {
    part: {
      id: "prt_question",
      sessionID: "ses_question",
      messageID: "msg_question",
      type: "tool",
    },
    state: {
      status: "completed",
      input: {
        questions: [{ question: "What is **bold** and $x^2$?" }],
      },
      metadata: {
        answers: [["`inline-code`", "$$x+y$$"]],
      },
      attachments: [],
    },
    info: {
      title: "question",
    },
    tool: "question",
  }
}

function createQuestionDockRequest(): QuestionRequest {
  return {
    id: "req_question_dock",
    sessionID: "ses_question_dock",
    questions: [
      {
        header: "Question",
        question: "Pick the **best** answer for $x^2$",
        options: [
          {
            label: "`option` one",
            description: "Supports $a+b$",
          },
        ],
      },
    ],
  }
}

function createKeyboardNavigationQuestionDockRequest(): QuestionRequest {
  return {
    id: "req_question_keyboard",
    sessionID: "ses_question_keyboard",
    questions: [
      {
        header: "First",
        question: "First question",
        options: [{ label: "First option", description: "" }],
      },
      {
        header: "Second",
        question: "Second question",
        options: [
          { label: "Second option A", description: "" },
          { label: "Second option B", description: "" },
        ],
      },
    ],
  }
}

function createCustomAnswerQuestionDockRequest(): QuestionRequest {
  return {
    id: "req_question_custom_blur",
    sessionID: "ses_question_custom_blur",
    questions: [
      {
        header: "Custom",
        question: "Type a custom answer",
        options: [],
        custom: true,
      },
      {
        header: "Confirm",
        question: "Confirm the second answer",
        options: [{ label: "Confirmed", description: "" }],
        custom: false,
      },
    ],
  }
}

function questionToolProps(input: {
  questions: Array<{ question: string }>
  answers: string[][]
  status?: ToolState["status"]
}): ToolPartProps {
  return {
    part: {
      id: "prt_q",
      sessionID: "ses_q",
      messageID: "msg_q",
      type: "tool",
    },
    state: {
      status: input.status ?? "completed",
      input: { questions: input.questions },
      metadata: { answers: input.answers },
      attachments: [],
    },
    info: { title: "question" },
    tool: "question",
  }
}

describe("question markdown rendering", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
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
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("renders markdown and latex in question tool prompts and answers", async () => {
    await act(async () => {
      root.render(renderQuestionTool(createQuestionToolProps()))
      await flushEffects()
    })

    await waitFor(() => container.querySelector(".katex") !== null)
    expect(container.querySelector("strong")?.textContent).toContain("bold")
    expect(container.querySelector("code")?.textContent).toContain("inline-code")
    expect(container.querySelector(".katex")).not.toBeNull()
  })

  test("renders markdown and latex in question dock prompt and option content", async () => {
    await act(async () => {
      root.render(
        <QuestionDock
          request={createQuestionDockRequest()}
          onReply={async () => undefined}
          onReject={async () => undefined}
        />,
      )
      await flushEffects()
    })

    await waitFor(() => container.querySelector(".katex") !== null)
    expect(container.querySelector("strong")?.textContent).toContain("best")
    expect(container.querySelector("code")?.textContent).toContain("option")
    expect(container.querySelector(".katex")).not.toBeNull()
  })

  test("focuses the question dock so arrow-key navigation works even if the prompt editor had focus", async () => {
    const externalEditor = document.createElement("div")
    externalEditor.contentEditable = "true"
    document.body.appendChild(externalEditor)
    externalEditor.focus()
    expect(document.activeElement).toBe(externalEditor)

    const replies: string[][][] = []

    await act(async () => {
      root.render(
        <QuestionDock
          request={createKeyboardNavigationQuestionDockRequest()}
          onReply={async (answers) => {
            replies.push(answers)
          }}
          onReject={async () => undefined}
        />,
      )
      await flushEffects()
    })

    const dock = container.querySelector("[role='region']")
    expect(dock).not.toBeNull()
    await waitFor(() => document.activeElement === dock)

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
      await flushEffects()
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }))
      await flushEffects()
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
      await flushEffects()
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
      await flushEffects()
    })

    expect(replies).toEqual([[[], ["Second option B"]]])
    externalEditor.remove()
  })

  test("commits a custom answer when the input blurs before continuing", async () => {
    const replies: string[][][] = []
    await act(async () => {
      root.render(
        <QuestionDock
          request={createCustomAnswerQuestionDockRequest()}
          onReply={async (answers) => {
            replies.push(answers)
          }}
          onReject={async () => undefined}
        />,
      )
      await flushEffects()
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
      await flushEffects()
    })

    const input = container.querySelector<HTMLInputElement>(
      `input[aria-label="${language.t("chat.questionDock.typeOwnAnswer")}"]`,
    )
    expect(input).not.toBeNull()
    if (!input) throw new Error("Expected custom answer input")

    await act(async () => {
      input.value = "A custom response"
      input.blur()
      await flushEffects()
    })

    const nextButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${language.t("chat.questionDock.nextQuestion")}"]`,
    )
    expect(nextButton).not.toBeNull()

    await act(async () => {
      nextButton?.click()
      await flushEffects()
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
      await flushEffects()
    })

    expect(container.textContent).toContain("A custom response")
    expect(container.textContent).not.toContain(language.t("chat.questionDock.notAnswered"))

    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === language.t("chat.questionDock.submit"),
    )
    await act(async () => {
      submitButton?.click()
      await flushEffects()
    })

    expect(replies).toEqual([[["A custom response"], ["Confirmed"]]])
  })

  test("does not render parsed HTML from the previous inline Markdown source", async () => {
    await act(async () => {
      root.render(<QuestionInlineMarkdown text="**First**" cacheKey="inline-first" />)
      await flushEffects()
    })
    await waitFor(() => container.querySelector("strong") !== null)

    act(() => {
      flushSync(() => {
        root.render(<QuestionInlineMarkdown text="`Second`" cacheKey="inline-second" />)
      })
      expect(container.textContent).toBe("`Second`")
      expect(container.querySelector("strong")).toBeNull()
    })

    await act(async () => {
      await flushEffects(20)
    })
    expect(container.querySelector("code")?.textContent).toBe("Second")
  })
})

describe("question tool answered states", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
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
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("single answered question renders without numbering or reply marker", async () => {
    await act(async () => {
      root.render(
        renderQuestionTool(
          questionToolProps({
            questions: [{ question: "Pick one: **bold**" }],
            answers: [["`code`"]],
          }),
        ),
      )
      await flushEffects()
    })

    await waitFor(() => container.querySelector("ul li") !== null)
    expect(container.querySelector("ul li span.tabular-nums")).toBeNull()
    expect(container.querySelector("ul li svg")).toBeNull()
    expect(container.textContent).toContain("Asked a question")
    expect(container.textContent).toContain("code")
  })

  test("multiple answered questions have no leading ordinals", async () => {
    await act(async () => {
      root.render(
        renderQuestionTool(
          questionToolProps({
            questions: [{ question: "First?" }, { question: "Second?" }],
            answers: [["a1"], ["a2"]],
          }),
        ),
      )
      await flushEffects()
    })

    await waitFor(() => container.querySelectorAll("ul li").length === 2)
    expect(container.querySelectorAll("ul li span.tabular-nums").length).toBe(0)
    expect(container.textContent).toContain("Asked questions")
    expect(container.textContent).toContain("First?")
    expect(container.textContent).toContain("Second?")
  })

  test("unanswered question shows the no-answer hint", async () => {
    await act(async () => {
      root.render(
        renderQuestionTool(
          questionToolProps({
            questions: [{ question: "Anything?" }],
            answers: [[]],
          }),
        ),
      )
      await flushEffects()
    })

    await waitFor(() => container.querySelector("ul li") !== null)
    expect(container.textContent).toContain(language.t("chatTools.noAnswer"))
  })
})
