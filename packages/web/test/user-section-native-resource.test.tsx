import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { TooltipProvider } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { UserSection } from "../src/components/chat/sections/user-section"
import {
  BUDDY_PROMPT_PART_METADATA_KEY,
  TEXT_FILE_ATTACHMENT_PART_TYPE,
} from "../src/components/prompt/prompt-types"
import { createMessageWithParts, createUserMessageInfo } from "./test-utils"

const SESSION_ID = "ses_native_resource"
const MESSAGE_ID = "msg_native_resource"
const UPLOADED_PDF_PATH = "/notebook/uploads/Lesson--abcdefghij.pdf"

describe("user section native resources", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  test("renders one chip and hides flattened metadata for a dual-path PDF", async () => {
    const message = createMessageWithParts(
      createUserMessageInfo({ id: MESSAGE_ID, sessionID: SESSION_ID }),
      [
        {
          id: "prt_native_metadata",
          sessionID: SESSION_ID,
          messageID: MESSAGE_ID,
          type: "text",
          text: "Attached native learning resource metadata",
          metadata: {
            buddyPromptPart: {
              type: "native-resource-attachment",
              filename: "Lesson.pdf",
              sourcePath: UPLOADED_PDF_PATH,
              format: "pdf",
              alias: "Lesson.pdf",
              mime: "application/pdf",
            },
          },
        },
        {
          id: "prt_native_pdf",
          sessionID: SESSION_ID,
          messageID: MESSAGE_ID,
          type: "file",
          mime: "application/pdf",
          filename: "Lesson.pdf",
          url: "file:///notebook/uploads/Lesson--abcdefghij.pdf",
          source: {
            type: "file",
            path: UPLOADED_PDF_PATH,
            text: { value: "Lesson.pdf", start: 0, end: 10 },
          },
        },
      ],
    )

    await act(async () => {
      root.render(
        <TooltipProvider>
          <UserSection userMessage={message} providers={[]} />
        </TooltipProvider>,
      )
    })

    expect(
      container.querySelectorAll(
        '[data-component="file-attachment-chip"][data-filename="Lesson.pdf"]',
      ),
    ).toHaveLength(1)
    expect(container.textContent).not.toContain("Attached native learning resource metadata")
  })

  test("renders text files as chips while keeping their decoded contents out of the transcript", async () => {
    const message = createMessageWithParts(
      createUserMessageInfo({ id: MESSAGE_ID, sessionID: SESSION_ID }),
      [
        {
          id: "prt_user_prompt",
          sessionID: SESSION_ID,
          messageID: MESSAGE_ID,
          type: "text",
          text: "Summarize these files",
        },
        {
          id: "prt_markdown_attachment",
          sessionID: SESSION_ID,
          messageID: MESSAGE_ID,
          type: "text",
          text: "Attached file (analysis.md):\n# Private report body",
          metadata: {
            [BUDDY_PROMPT_PART_METADATA_KEY]: {
              type: TEXT_FILE_ATTACHMENT_PART_TYPE,
              filename: "analysis.md",
              mime: "text/plain",
            },
          },
        },
        {
          id: "prt_text_attachment",
          sessionID: SESSION_ID,
          messageID: MESSAGE_ID,
          type: "text",
          text: "Attached file (notes.txt):\nPrivate notes body",
          metadata: {
            [BUDDY_PROMPT_PART_METADATA_KEY]: {
              type: TEXT_FILE_ATTACHMENT_PART_TYPE,
              filename: "notes.txt",
              mime: "text/plain",
            },
          },
        },
      ],
    )

    await act(async () => {
      root.render(
        <TooltipProvider>
          <UserSection userMessage={message} providers={[]} />
        </TooltipProvider>,
      )
    })

    expect(
      container.querySelectorAll('[data-component="file-attachment-chip"]'),
    ).toHaveLength(2)
    expect(
      container.querySelector('[data-component="file-attachment-chip"][data-filename="analysis.md"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-component="file-attachment-chip"][data-filename="notes.txt"]'),
    ).not.toBeNull()
    expect(container.textContent).toContain("Summarize these files")
    expect(container.textContent).not.toContain("Private report body")
    expect(container.textContent).not.toContain("Private notes body")
  })
})
