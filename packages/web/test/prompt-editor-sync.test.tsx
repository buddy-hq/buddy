import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, type MutableRefObject } from "react"
import { createRoot, type Root } from "react-dom/client"
import { usePromptEditorSync } from "../src/components/prompt/use-prompt-editor-sync"
import type { PromptComposerPart } from "../src/components/prompt/prompt-types"

const RESTORED_TEXT = "what is this"
const LAGGING_TEXT = "what is this th"
const TYPED_TEXT = "what is this thing"

function textParts(text: string): PromptComposerPart[] {
  return [{ type: "text", text }]
}

function PromptEditorSyncHarness(props: {
  editorRef: MutableRefObject<HTMLDivElement | null>
  composerOriginated: boolean
  draftText: string
  onCursorOffset: (cursor: number) => void
}) {
  usePromptEditorSync({
    editorRef: props.editorRef,
    composerOriginated: props.composerOriginated,
    draft: {
      value: props.draftText,
      parts: textParts(props.draftText),
      cursor: props.draftText.length,
    },
    knownAgents: new Set(),
    skillPresentation: () => undefined,
    setCursorOffset: props.onCursorOffset,
  })

  return (
    <div
      ref={(element) => {
        props.editorRef.current = element
      }}
      contentEditable
    />
  )
}

describe("prompt editor sync", () => {
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
      await Promise.resolve()
    })
    container.remove()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  test("renders a draft the editor did not produce", async () => {
    const editorRef: MutableRefObject<HTMLDivElement | null> = { current: null }
    const cursorOffsets: number[] = []

    await act(async () => {
      root.render(
        <PromptEditorSyncHarness
          editorRef={editorRef}
          composerOriginated={false}
          draftText={RESTORED_TEXT}
          onCursorOffset={(cursor) => cursorOffsets.push(cursor)}
        />,
      )
      await Promise.resolve()
    })

    expect(editorRef.current?.textContent).toBe(RESTORED_TEXT)
    expect(cursorOffsets).toEqual([RESTORED_TEXT.length])
  })

  test("leaves the editor alone when its own draft lands behind what was typed", async () => {
    const editorRef: MutableRefObject<HTMLDivElement | null> = { current: null }
    const cursorOffsets: number[] = []
    const render = (draftText: string) =>
      root.render(
        <PromptEditorSyncHarness
          editorRef={editorRef}
          composerOriginated
          draftText={draftText}
          onCursorOffset={(cursor) => cursorOffsets.push(cursor)}
        />,
      )

    await act(async () => {
      render(RESTORED_TEXT)
      await Promise.resolve()
    })

    // The typist keeps going while the debounced draft is still in flight, so the
    // contenteditable runs ahead of every snapshot the composer has committed.
    const editor = editorRef.current
    if (!editor) throw new Error("editor did not mount")
    editor.textContent = TYPED_TEXT

    await act(async () => {
      render(LAGGING_TEXT)
      await Promise.resolve()
    })

    expect(editor.textContent).toBe(TYPED_TEXT)
    expect(cursorOffsets).toEqual([])
  })
})
