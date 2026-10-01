import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { TooltipProvider } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { UserSection } from "../src/components/chat/sections/user-section"
import type { MessagePart } from "../src/state/chat-types"
import { createMessageWithParts, createUserMessageInfo } from "./test-utils"

const SESSION_ID = "ses_notebook_reference"
const MESSAGE_ID = "msg_notebook_reference"

function textPart(id: string, text: string): MessagePart {
  return { id, sessionID: SESSION_ID, messageID: MESSAGE_ID, type: "text", text }
}

function sentNotebookReferencePart(input: { title: string; locator: string }): MessagePart {
  return {
    id: "prt_reference",
    sessionID: SESSION_ID,
    messageID: MESSAGE_ID,
    type: "text",
    text: input.locator,
    metadata: {
      buddyPromptPart: {
        type: "notebook-reference",
        text: input.locator,
        title: input.title,
        kind: "note",
      },
    },
  }
}

describe("user section notebook references", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  async function render(parts: MessagePart[]) {
    const message = createMessageWithParts(
      createUserMessageInfo({ id: MESSAGE_ID, sessionID: SESSION_ID }),
      parts,
    )
    await act(async () => {
      root.render(
        <TooltipProvider>
          <UserSection userMessage={message} providers={[]} />
        </TooltipProvider>,
      )
    })
  }

  test("draws a sent reference as its chip instead of its locator", async () => {
    await render([
      textPart("prt_before", "compare "),
      sentNotebookReferencePart({ title: "Plan", locator: "Plan (note: notes/plan.md)" }),
      textPart("prt_after", " with the draft"),
    ])

    expect(container.textContent).toContain("compare")
    expect(container.textContent).toContain("Plan")
    expect(container.textContent).toContain("with the draft")
    expect(container.textContent).not.toContain("(note: notes/plan.md)")
  })

  test("still draws the chip when the title holds repeated spaces", async () => {
    await render([
      textPart("prt_before", "compare "),
      sentNotebookReferencePart({
        title: "Plan  B",
        locator: "Plan  B (note: notes/plan-b.md)",
      }),
      textPart("prt_after", " with the draft"),
    ])

    expect(container.textContent).toContain("Plan  B")
    expect(container.textContent).not.toContain("(note: notes/plan-b.md)")
  })
})
