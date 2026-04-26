import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { PromptComposer } from "../src/components/prompt/prompt-composer"
import { getCursorPosition } from "../src/components/prompt/editor-dom"
import {
  getPromptDraft,
  getPromptScopeKey,
  PROMPT_STORE_STORAGE_KEY,
  usePromptStore,
} from "../src/state/prompt-store"

const DIRECTORY = "/repo"
const SESSION_ID = "session-1"
const PROMPT_KEY = getPromptScopeKey(DIRECTORY, SESSION_ID)

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function resetPromptStore() {
  localStorage.removeItem(PROMPT_STORE_STORAGE_KEY)
  usePromptStore.setState({
    draftsByKey: {},
    historyByDirectory: {},
    historyNavigationByKey: {},
  })
}

function setSelection(node: Node, offset: number) {
  const selection = window.getSelection()
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

describe("PromptComposer", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    resetPromptStore()
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
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  async function renderComposer() {
    await act(async () => {
      root.render(
        <PromptComposer
          directory={DIRECTORY}
          sessionID={SESSION_ID}
          isBusy={false}
          personaOptions={[{ name: "buddy" }]}
          mentionableAgents={[]}
          slashCommands={[{ name: "plan", description: "Run the plan command" }]}
          modelOptions={[{ key: "auto", label: "Auto" }]}
          selectedPersona="buddy"
          selectedModel="auto"
          thinkingOptions={[{ key: "default", label: "Default" }]}
          selectedThinking="default"
          onPersonaChange={() => undefined}
          onModelChange={() => undefined}
          onThinkingChange={() => undefined}
          onSubmit={() => undefined}
          onAbort={() => undefined}
          onNewSession={() => undefined}
        />,
      )
      await flushEffects()
    })
  }

  function getEditor() {
    const editor = container.querySelector("[role='textbox']")
    if (!(editor instanceof HTMLDivElement)) {
      throw new Error("Prompt editor not found")
    }
    return editor
  }

  test("keeps the caret after typing a slash", async () => {
    await renderComposer()
    const editor = getEditor()

    await act(async () => {
      editor.focus()
      editor.textContent = "/"
      const node = editor.firstChild
      if (!node) throw new Error("Missing text node after typing")
      setSelection(node, 1)
      editor.dispatchEvent(new Event("input", { bubbles: true }))
      await flushEffects()
    })

    expect(getCursorPosition(editor)).toBe(1)
    expect(getPromptDraft(usePromptStore.getState(), PROMPT_KEY).value).toBe("/")
  })

  test("keeps the caret after selecting a slash command", async () => {
    await renderComposer()
    const editor = getEditor()

    await act(async () => {
      editor.focus()
      editor.textContent = "/"
      const node = editor.firstChild
      if (!node) throw new Error("Missing text node after typing")
      setSelection(node, 1)
      editor.dispatchEvent(new Event("input", { bubbles: true }))
      await flushEffects()
    })

    const slashButton = Array.from(
      container.querySelectorAll<HTMLElement>("[data-component='prompt-slash-option']"),
    ).find((button) => button.textContent?.includes("/plan"))
    if (!slashButton) {
      throw new Error("Slash command button not found")
    }

    await act(async () => {
      slashButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      slashButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    expect(getCursorPosition(editor)).toBe("/plan ".length)
    expect(getPromptDraft(usePromptStore.getState(), PROMPT_KEY).value).toBe("/plan ")
  })

  test("restores history drafts without losing the caret position", async () => {
    usePromptStore.getState().pushHistoryEntry(DIRECTORY, {
      value: "saved draft",
      attachments: [],
      parts: [{ type: "text", text: "saved draft" }],
    })

    await renderComposer()
    const editor = getEditor()

    await act(async () => {
      editor.focus()
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }))
      await flushEffects()
    })

    expect(getPromptDraft(usePromptStore.getState(), PROMPT_KEY).value).toBe("saved draft")
    expect(getCursorPosition(editor)).toBe(0)

    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
      await flushEffects()
    })

    expect(getPromptDraft(usePromptStore.getState(), PROMPT_KEY).value).toBe("")
    expect(getCursorPosition(editor)).toBe(0)
  })
})
