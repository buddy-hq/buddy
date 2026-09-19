import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { TooltipProvider } from "@buddy/ui"
import type { Citation } from "@buddy/citation-contract"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { UserSection } from "../src/components/chat/sections/user-section"
import type { MessagePart } from "../src/state/chat-types"
import { createMessageWithParts, createUserMessageInfo } from "./test-utils"

const SESSION_ID = "ses_quotes"
const MESSAGE_ID = "msg_quotes"
const SELECTOR = { version: 1, start: 0, end: 12, prefix: "", suffix: "" } as const

function documentCitation(id: string, comment?: string): Citation {
  return Object.assign(
    {
      schemaVersion: 1 as const,
      id,
      excerpt: `Excerpt of ${id}`,
      source: { kind: "document" as const, path: "notes/basic-demo.md", selector: SELECTOR },
    },
    comment ? { comment } : undefined,
  )
}

function chatCitation(id: string, comment: string): Citation {
  return {
    schemaVersion: 1,
    id,
    excerpt: `Assistant words ${id}`,
    comment,
    source: {
      kind: "chat",
      sessionID: SESSION_ID,
      messageID: "msg_assistant",
      partID: "prt_assistant",
      selector: SELECTOR,
    },
  }
}

function serverCitationPart(id: string, citation: Citation): MessagePart {
  return {
    id,
    sessionID: SESSION_ID,
    messageID: MESSAGE_ID,
    type: "text",
    text: "Cited for the model",
    metadata: { buddyPromptPart: { type: "selection-context", citation } },
  }
}

function userTextPart(text: string): MessagePart {
  return { id: "prt_user_text", sessionID: SESSION_ID, messageID: MESSAGE_ID, type: "text", text }
}

describe("user section quotes", () => {
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

  test("renders every quote and comment in one band inside the message bubble", async () => {
    await render([
      serverCitationPart("prt_doc", documentCitation("citation_doc", "from the md file")),
      serverCitationPart("prt_chat", chatCitation("citation_chat", "from chat")),
      userTextPart("reply with yes"),
    ])

    const bubbles = container.querySelectorAll(".composer-surface-bubble")
    expect(bubbles).toHaveLength(1)
    const band = bubbles[0]?.querySelector(".quote-band")
    expect(band?.textContent).toContain("Excerpt of citation_doc")
    expect(band?.textContent).toContain("from the md file")
    expect(band?.textContent).toContain("Assistant words citation_chat")
    expect(band?.textContent).toContain("from chat")
    expect(bubbles[0]?.textContent).toContain("reply with yes")
    expect(container.textContent).not.toContain("Cited for the model")
  })

  test("renders a quotes-only message as a bubble holding just the band", async () => {
    await render([serverCitationPart("prt_doc", documentCitation("citation_doc"))])

    const bubbles = container.querySelectorAll(".composer-surface-bubble")
    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.querySelector(".quote-band")?.textContent).toContain(
      "Excerpt of citation_doc",
    )
  })

  test("keeps the comment on an optimistic citation before the server copy lands", async () => {
    const citation = chatCitation("citation_chat", "why the widget")
    await render([
      {
        id: "prt_optimistic_chat",
        sessionID: SESSION_ID,
        messageID: MESSAGE_ID,
        type: "selection-context",
        source: "message",
        optimistic: true,
        text: citation.excerpt,
        selectionKey: citation.id,
        quotedMessageID: "msg_assistant",
        citation,
      },
      userTextPart("reply with yes"),
    ])

    const band = container.querySelector(".quote-band")
    expect(band?.textContent).toContain("Assistant words citation_chat")
    expect(band?.textContent).toContain("why the widget")
  })
})
