import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderQuestionTool } from "../src/components/chat/tools/render/question"
import { QuestionDock } from "../src/components/directory-chat/question-dock"
import type { ToolPartProps } from "../src/components/chat/tools/registry"
import type { QuestionRequest } from "../src/state/chat-types"

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
})
