import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  SELECTION_CONTEXT_PART_TYPE,
  type PromptComposerAttachment,
  type PromptMessageSelectionContextPart,
} from "../src/components/prompt/prompt-types"
import {
  parseComposerNoteImages,
  useComposerNoteMode,
  type SaveComposerNote,
} from "../src/features/notes/use-composer-note-mode"

const quotedMessage: PromptMessageSelectionContextPart = {
  type: SELECTION_CONTEXT_PART_TYPE,
  source: "message",
  text: "Embeddings turn tokens into vectors.",
  selectionKey: "message:msg_1",
  quotedMessageID: "msg_1",
}

const screenshot: PromptComposerAttachment = {
  id: "attachment-screenshot",
  filename: "Screenshot.png",
  mime: "image/png",
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  kind: "image",
}

const textFile: PromptComposerAttachment = {
  id: "attachment-text",
  filename: "notes.txt",
  mime: "text/plain",
  dataUrl: "data:text/plain;base64,aGVsbG8=",
  kind: "file",
}

type HarnessProps = {
  quotedMessage?: PromptMessageSelectionContextPart
  noteText: string
  attachments?: PromptComposerAttachment[]
  saveNote?: SaveComposerNote
}

type SavedNote = Parameters<SaveComposerNote>[0]

function composerDraft(props: HarnessProps) {
  return {
    value: props.noteText,
    parts: [],
    attachments: props.attachments ?? [],
    cursor: props.noteText.length,
  }
}

function recordSavedNotes() {
  const saved: SavedNote[] = []
  const saveNote: SaveComposerNote = (input) => {
    saved.push(input)
    return Promise.resolve({ sessionID: "ses_1" })
  }
  return { saved, saveNote }
}

describe("useComposerNoteMode", () => {
  let container: HTMLDivElement
  let root: Root
  let noteMode: ReturnType<typeof useComposerNoteMode> | undefined

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    noteMode = undefined
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  function Harness(props: HarnessProps) {
    noteMode = useComposerNoteMode({
      directory: "/notebook",
      promptKey: "prompt-1",
      activePromptKey: { current: "prompt-1" },
      quotedMessage: props.quotedMessage,
      saveNote: props.saveNote,
      clearDraft: () => {},
      clearComposer: () => {},
      readDraft: () => composerDraft(props),
      removeQuotedMessage: () => {},
    })
    return null
  }

  async function render(props: HarnessProps) {
    await act(async () => root.render(<Harness {...props} />))
  }

  async function saveNoteFromComposer(props: HarnessProps) {
    await render(props)
    await act(async () => noteMode?.enter())
    await act(async () => {
      await noteMode?.submit(composerDraft(props))
    })
  }

  test("removing the quote from an empty note leaves Note mode", async () => {
    await render({ quotedMessage, noteText: "" })
    expect(noteMode?.active).toBe(true)

    await render({ noteText: "" })
    expect(noteMode?.active).toBe(false)
  })

  test("removing the quote keeps Note mode once a note is typed", async () => {
    await render({ quotedMessage, noteText: "" })
    expect(noteMode?.active).toBe(true)

    await render({ noteText: "Vectors carry meaning." })
    expect(noteMode?.active).toBe(true)
  })

  test("removing the quote keeps Note mode when only an image remains", async () => {
    await render({ quotedMessage, noteText: "", attachments: [screenshot] })
    expect(noteMode?.active).toBe(true)

    await render({ noteText: "", attachments: [screenshot] })
    expect(noteMode?.active).toBe(true)
  })

  test("saves an image-only note with its screenshot", async () => {
    const { saved, saveNote } = recordSavedNotes()
    await saveNoteFromComposer({ noteText: "", attachments: [screenshot], saveNote })

    expect(saved).toEqual([
      {
        text: "",
        images: [{ filename: "Screenshot.png", mime: "image/png", data: "iVBORw0KGgo=" }],
      },
    ])
  })

  test("saves a quoted message on its own without any typed text", async () => {
    const { saved, saveNote } = recordSavedNotes()
    await render({ quotedMessage, noteText: "", saveNote })
    await act(async () => {
      await noteMode?.submit({ ...composerDraft({ noteText: "" }), parts: [quotedMessage] })
    })

    expect(saved).toEqual([{ text: "", messageID: "msg_1" }])
  })

  test("does not save an empty note without a quote", async () => {
    const { saved, saveNote } = recordSavedNotes()
    await saveNoteFromComposer({ noteText: "  ", saveNote })

    expect(saved).toEqual([])
  })

  test("does not save a note that has a non-image attachment", async () => {
    const { saved, saveNote } = recordSavedNotes()
    await saveNoteFromComposer({
      noteText: "Read this later",
      attachments: [screenshot, textFile],
      saveNote,
    })

    expect(saved).toEqual([])
  })

  test("rejects image count, size, and filename limits before saving", () => {
    const tooMany = Array.from({ length: 11 }, (_, index) => ({
      ...screenshot,
      id: `attachment-${index}`,
    }))
    expect(parseComposerNoteImages(tooMany)).toEqual({
      status: "error",
      message: "You can save up to 10 images in a note.",
    })

    const oversizedPayload = "A".repeat(Math.ceil((20 * 1024 * 1024 + 1) / 3) * 4)
    expect(
      parseComposerNoteImages([
        { ...screenshot, dataUrl: `data:image/png;base64,${oversizedPayload}` },
      ]),
    ).toEqual({ status: "error", message: "Each note image must be 20 MB or smaller." })

    expect(
      parseComposerNoteImages([{ ...screenshot, filename: `${"a".repeat(256)}.png` }]),
    ).toEqual({
      status: "error",
      message: "Image filenames must be 255 characters or fewer.",
    })
  })
})
