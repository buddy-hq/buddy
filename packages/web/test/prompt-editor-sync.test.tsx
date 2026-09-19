import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, type MutableRefObject } from "react"
import { createRoot, type Root } from "react-dom/client"
import { usePromptEditorSync } from "../src/components/prompt/use-prompt-editor-sync"

const RESTORED_TEXT = "what is this"

function PromptEditorSyncHarness(props: {
  editorRef: MutableRefObject<HTMLDivElement | null>
  mirrorInputRef: MutableRefObject<boolean>
}) {
  usePromptEditorSync({
    editorRef: props.editorRef,
    mirrorInputRef: props.mirrorInputRef,
    draft: {
      value: RESTORED_TEXT,
      parts: [{ type: "text", text: RESTORED_TEXT }],
      cursor: RESTORED_TEXT.length,
    },
    knownAgents: new Set(),
    skillPresentation: () => undefined,
    setCursorOffset: () => undefined,
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

  test("renders an external draft when a stale mirror flag finds different DOM", async () => {
    const editorRef: MutableRefObject<HTMLDivElement | null> = { current: null }
    const mirrorInputRef = { current: true }

    await act(async () => {
      root.render(<PromptEditorSyncHarness editorRef={editorRef} mirrorInputRef={mirrorInputRef} />)
      await Promise.resolve()
    })

    expect(editorRef.current?.textContent).toBe(RESTORED_TEXT)
    expect(mirrorInputRef.current).toBe(false)
  })
})
