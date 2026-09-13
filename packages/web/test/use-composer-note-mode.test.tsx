import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  SELECTION_CONTEXT_PART_TYPE,
  type PromptMessageSelectionContextPart,
} from "../src/components/prompt/prompt-types"
import { useComposerNoteMode } from "../src/features/notes/use-composer-note-mode"

const quotedMessage: PromptMessageSelectionContextPart = {
  type: SELECTION_CONTEXT_PART_TYPE,
  source: "message",
  text: "Embeddings turn tokens into vectors.",
  selectionKey: "message:msg_1",
  quotedMessageID: "msg_1",
}

type HarnessProps = {
  quotedMessage?: PromptMessageSelectionContextPart
  noteText: string
}

describe("useComposerNoteMode", () => {
  let container: HTMLDivElement
  let root: Root
  let noteModeActive = false

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    noteModeActive = false
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  function Harness(props: HarnessProps) {
    const noteMode = useComposerNoteMode({
      directory: "/notebook",
      promptKey: "prompt-1",
      activePromptKey: { current: "prompt-1" },
      quotedMessage: props.quotedMessage,
      clearDraft: () => {},
      clearComposer: () => {},
      readDraft: () => ({
        value: props.noteText,
        parts: [],
        attachments: [],
        cursor: props.noteText.length,
      }),
      removeQuotedMessage: () => {},
    })
    noteModeActive = noteMode.active
    return null
  }

  async function render(props: HarnessProps) {
    await act(async () => root.render(<Harness {...props} />))
  }

  test("removing the quote from an empty note leaves Note mode", async () => {
    await render({ quotedMessage, noteText: "" })
    expect(noteModeActive).toBe(true)

    await render({ noteText: "" })
    expect(noteModeActive).toBe(false)
  })

  test("removing the quote keeps Note mode once a note is typed", async () => {
    await render({ quotedMessage, noteText: "" })
    expect(noteModeActive).toBe(true)

    await render({ noteText: "Vectors carry meaning." })
    expect(noteModeActive).toBe(true)
  })
})
