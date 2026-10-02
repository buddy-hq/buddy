import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { act, createRef } from "react"
import type { Root } from "react-dom/client"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  INSERT_PARAGRAPH_COMMAND,
  KEY_SPACE_COMMAND,
  getNearestEditorFromDOMNode,
} from "lexical"
import { createQueryTestRoot } from "./query-test-root"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
} from "../src/components/bench/markdown/editor"
import { ThemeProvider } from "../src/theme"

function createMediaQueryList(matches: boolean): MediaQueryList {
  const mediaQueryList: MediaQueryList = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  }
  return mediaQueryList
}

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

const CONTENT_ROOT_SELECTOR = ".mdxeditor-root-contenteditable [contenteditable]"
const CALLOUT_CONTENT_SELECTOR =
  '[data-component="markdown-bench-obsidian-callout"] [contenteditable]'

const UNCHANGED_LIST_SPACING_CASES = [
  { name: "a loose list of two items", markdown: "- one\n\n- two" },
  { name: "a loose numbered list", markdown: "1. one\n\n2. two" },
  { name: "a loose task list", markdown: "- [ ] one\n\n- [x] two" },
  { name: "a loose list of three items", markdown: "- one\n\n- two\n\n- three" },
  { name: "a loose list inside a quote", markdown: "> - one\n>\n> - two" },
  { name: "a tight list", markdown: "- one\n- two\n- three" },
  { name: "a tight list with a quote", markdown: "- item\n  > quoted" },
  { name: "a loose item with a quote", markdown: "- item\n\n  > quoted" },
  { name: "a tight item with a code block", markdown: "- item\n  ```js\n  x = 1\n  ```" },
  { name: "a loose item with a code block", markdown: "- item\n\n  ```js\n  x = 1\n  ```" },
  { name: "a tight item with a table", markdown: "- item\n  | a | b |\n  | - | - |\n  | 1 | 2 |" },
  {
    name: "a loose item with a table",
    markdown: "- item\n\n  | a | b |\n  | - | - |\n  | 1 | 2 |",
  },
  { name: "an item with two paragraphs", markdown: "- one\n\n  two\n- three" },
  { name: "a loose item before a nested list", markdown: "- one\n\n  - nested\n- two" },
  { name: "a tight item before a loose nested list", markdown: "- one\n  - a\n\n  - b\n- two" },
  { name: "a loose list with a tight nested list", markdown: "- one\n  - nested\n\n- two" },
  { name: "a loose item deep in a nested list", markdown: "- a\n  - b\n\n    c\n- d" },
  {
    name: "loose and tight items side by side",
    markdown: "- one\n\n  two\n- three\n- item\n\n  > quoted",
  },
]

describe("MarkdownBenchEditor Markdown fidelity", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createQueryTestRoot(container)
    localStorage.clear()
    Object.defineProperty(window, "matchMedia", {
      value: () => createMediaQueryList(false),
      configurable: true,
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    window.getSelection()?.removeAllRanges()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    document.head.replaceChildren()
  })

  async function mountEditor(markdown: string) {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const changes: string[] = []
    const processingErrors: string[] = []
    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            ref={editorRef}
            markdown={markdown}
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-notes"
            documentFormat="markdown"
            path="Index.md"
            onChange={(next) => changes.push(next)}
            onProcessingResult={(result) => {
              if (result.error) processingErrors.push(result.error)
            }}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })
    return { editorRef, changes, processingErrors }
  }

  async function savedWithoutEditing(markdown: string) {
    const { editorRef, processingErrors } = await mountEditor(markdown)
    expect(processingErrors).toEqual([])
    return editorRef.current?.getMarkdown()
  }

  function contentRoot() {
    const element = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    if (!element) throw new Error("Expected the editable document")
    return element
  }

  function lexicalEditor() {
    const editor = getNearestEditorFromDOMNode(contentRoot())
    if (!editor) throw new Error("Expected the Lexical editor behind the document")
    return editor
  }

  async function appendToLastText(text: string) {
    const editor = lexicalEditor()
    await act(async () => {
      editor.update(() => {
        const lastText = $getRoot().getAllTextNodes().at(-1)
        if (!lastText) throw new Error("Expected text in the document")
        lastText.setTextContent(`${lastText.getTextContent()}${text}`)
      })
      await flushEffects()
    })
  }

  async function savedAfterEditingLastText(markdown: string, text: string) {
    const { changes, processingErrors } = await mountEditor(markdown)
    await appendToLastText(text)
    expect(processingErrors).toEqual([])
    return changes.at(-1)
  }

  async function addItemAfterLastText(text: string) {
    const editor = lexicalEditor()
    await act(async () => {
      editor.update(() => {
        const lastText = $getRoot().getAllTextNodes().at(-1)
        if (!lastText) throw new Error("Expected text in the document")
        lastText.selectEnd()
      })
      await flushEffects()
    })
    await act(async () => {
      editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined)
      await flushEffects()
    })
    await act(async () => {
      editor.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) throw new Error("Expected a caret in the new item")
        selection.insertText(text)
      })
      await flushEffects()
    })
  }

  async function savedAfterAddingItem(markdown: string, text: string) {
    const { changes, processingErrors } = await mountEditor(markdown)
    await addItemAfterLastText(text)
    expect(processingErrors).toEqual([])
    return changes.at(-1)
  }

  function itemWithText(text: string) {
    const item = Array.from(contentRoot().querySelectorAll<HTMLElement>("li")).find(
      (candidate) => candidate.textContent === text,
    )
    if (!item) throw new Error(`Expected a list item reading "${text}"`)
    return item
  }

  async function toggleTaskWithKeyboard(item: HTMLElement) {
    const editor = getNearestEditorFromDOMNode(item)
    if (!editor) throw new Error("Expected a Lexical editor behind the list item")
    await act(async () => {
      item.focus()
      editor.dispatchCommand(KEY_SPACE_COMMAND, new KeyboardEvent("keydown", { key: " " }))
      await flushEffects()
    })
  }

  async function placeCaretInItem(item: HTMLElement) {
    const text = item.querySelector("[data-lexical-text]")?.firstChild
    if (!text) throw new Error("Expected text inside the list item")
    await act(async () => {
      window.getSelection()?.collapse(text, 0)
      document.dispatchEvent(new Event("selectionchange"))
      await flushEffects()
    })
  }

  async function clickCheckbox(item: HTMLElement) {
    const checkboxMetrics = document.createElement("div").style
    checkboxMetrics.setProperty("width", "16px")
    checkboxMetrics.setProperty("zoom", "1")
    const computedStyleSpy = spyOn(window, "getComputedStyle").mockReturnValue(checkboxMetrics)
    try {
      await act(async () => {
        item.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 4 }),
        )
        item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 4 }))
        await flushEffects()
      })
    } finally {
      computedStyleSpy.mockRestore()
    }
  }

  async function focusAndLeaveCallouts() {
    const bodies = Array.from(container.querySelectorAll<HTMLElement>(CALLOUT_CONTENT_SELECTOR))
    expect(bodies.length).toBeGreaterThan(0)
    await act(async () => {
      for (const body of bodies) {
        body.focus()
        body.blur()
      }
      await flushEffects()
    })
  }

  describe("ordered list start numbers", () => {
    test("keeps a list that starts above one", async () => {
      const markdown = "5. five\n6. six"

      expect(await savedWithoutEditing(markdown)).toBe(markdown)

      const list = contentRoot().querySelector("ol")
      expect(list?.getAttribute("start")).toBe("5")
      expect(Array.from(list?.querySelectorAll("li") ?? []).map((item) => item.value)).toEqual([
        5, 6,
      ])
    })

    test("keeps a number that is content", async () => {
      const markdown = "2024. A year"

      expect(await savedWithoutEditing(markdown)).toBe(markdown)
    })

    test("keeps a list that starts at zero", async () => {
      const markdown = "0. zero\n1. one"

      expect(await savedWithoutEditing(markdown)).toBe(markdown)
    })

    test("keeps the start of a list that holds a nested list", async () => {
      const markdown = "3. three\n   - a\n   - b\n4. four"

      expect(await savedWithoutEditing(markdown)).toBe(markdown)
    })

    test("keeps the start of a list inside a quote", async () => {
      const markdown = "> 5. five\n> 6. six"

      expect(await savedWithoutEditing(markdown)).toBe(markdown)
    })

    test("leaves a list that starts at one alone", async () => {
      const markdown = "1. one\n2. two"

      expect(await savedWithoutEditing(markdown)).toBe(markdown)
      expect(contentRoot().querySelector("ol")?.hasAttribute("start")).toBe(false)
    })

    test("restarts a nested numbered list at one so it stays a list", async () => {
      expect(await savedWithoutEditing("- item\n\n  7. seven\n  8. eight")).toBe(
        "- item\n\n  1. seven\n  2. eight",
      )
    })

    test("keeps the start number when a nearby item is edited", async () => {
      expect(await savedAfterEditingLastText("5. five\n6. six", " edited")).toBe(
        "5. five\n6. six edited",
      )
    })
  })

  describe("plain items in task lists", () => {
    test("keeps a plain item plain next to a task", async () => {
      const markdown = "- [ ] task\n- plain item"

      expect(await savedWithoutEditing(markdown)).toBe(markdown)

      const items = Array.from(contentRoot().querySelectorAll("li"))
      expect(items.map((item) => item.textContent)).toEqual(["task", "plain item"])
    })

    test("keeps plain items plain at every level of a nested task list", async () => {
      const markdown = "- [x] done\n- plain\n  - [ ] sub\n  - subplain\n- [ ] open"

      expect(await savedWithoutEditing(markdown)).toBe(markdown)
    })

    test("leaves a list of only tasks alone", async () => {
      const markdown = "- [ ] open\n- [x] done"

      expect(await savedWithoutEditing(markdown)).toBe(markdown)
    })

    test("keeps the plain item plain when nearby text is edited", async () => {
      expect(await savedAfterEditingLastText("- plain item\n- [ ] task", " edited")).toBe(
        "- plain item\n- [ ] task edited",
      )
    })

    test("saves a plain item as a task once it is ticked", async () => {
      const { changes } = await mountEditor("- [ ] task\n- plain item")
      const plainItem = contentRoot().querySelectorAll<HTMLElement>("li").item(1)

      await toggleTaskWithKeyboard(plainItem)

      expect(plainItem.getAttribute("aria-checked")).toBe("true")
      expect(changes.at(-1)).toBe("- [ ] task\n- [x] plain item")
    })

    test("saves a plain item as a task once it is ticked and unticked", async () => {
      const { editorRef, changes } = await mountEditor("- [ ] task\n- plain item")
      const plainItem = contentRoot().querySelectorAll<HTMLElement>("li").item(1)

      await toggleTaskWithKeyboard(plainItem)
      await toggleTaskWithKeyboard(plainItem)

      expect(plainItem.getAttribute("aria-checked")).toBe("false")
      expect(changes.at(-1)).toBe("- [ ] task\n- [ ] plain item")
      expect(editorRef.current?.getMarkdown()).toBe("- [ ] task\n- [ ] plain item")
    })

    test("keeps a task once a plain item has been ticked, unticked and ticked again", async () => {
      const { changes } = await mountEditor("- [ ] task\n- plain item")
      const plainItem = contentRoot().querySelectorAll<HTMLElement>("li").item(1)

      await toggleTaskWithKeyboard(plainItem)
      await toggleTaskWithKeyboard(plainItem)
      await toggleTaskWithKeyboard(plainItem)

      expect(changes.at(-1)).toBe("- [ ] task\n- [x] plain item")
    })

    test("keeps an untouched plain item plain while a task beside it is toggled", async () => {
      const { changes } = await mountEditor("- [ ] task\n- plain item")
      const task = contentRoot().querySelectorAll<HTMLElement>("li").item(0)

      await toggleTaskWithKeyboard(task)
      expect(changes.at(-1)).toBe("- [x] task\n- plain item")

      await toggleTaskWithKeyboard(task)
      expect(changes.at(-1)).toBe("- [ ] task\n- plain item")
    })

    test("makes only the ticked plain item a task when several are plain", async () => {
      const { changes } = await mountEditor("- [ ] task\n- first\n- second")
      const second = itemWithText("second")

      await toggleTaskWithKeyboard(second)
      await toggleTaskWithKeyboard(second)

      expect(changes.at(-1)).toBe("- [ ] task\n- first\n- [ ] second")
    })

    test("makes a nested plain item a task once it is ticked and unticked", async () => {
      const markdown = "- [x] done\n- plain\n  - [ ] sub\n  - subplain\n- [ ] open"
      const { changes } = await mountEditor(markdown)
      const nestedPlain = itemWithText("subplain")

      await toggleTaskWithKeyboard(nestedPlain)
      expect(changes.at(-1)).toBe("- [x] done\n- plain\n  - [ ] sub\n  - [x] subplain\n- [ ] open")

      await toggleTaskWithKeyboard(nestedPlain)
      expect(changes.at(-1)).toBe("- [x] done\n- plain\n  - [ ] sub\n  - [ ] subplain\n- [ ] open")
    })

    test("makes a top-level plain item a task without touching nested plain items", async () => {
      const markdown = "- [x] done\n- plain\n  - [ ] sub\n  - subplain\n- [ ] open"
      const { changes } = await mountEditor(markdown)
      const topPlain = itemWithText("plain")

      await toggleTaskWithKeyboard(topPlain)
      await toggleTaskWithKeyboard(topPlain)

      expect(changes.at(-1)).toBe("- [x] done\n- [ ] plain\n  - [ ] sub\n  - subplain\n- [ ] open")
    })
  })

  describe("plain items in task lists inside a callout", () => {
    test("saves a plain item as a task once it is ticked", async () => {
      const { editorRef } = await mountEditor("> [!note] T\n> - [ ] task\n> - plain item")

      await toggleTaskWithKeyboard(itemWithText("plain item"))
      await focusAndLeaveCallouts()

      expect(editorRef.current?.getMarkdown()).toBe("> [!note] T\n> - [ ] task\n> - [x] plain item")
    })

    test("saves a plain item as a task once it is ticked and unticked", async () => {
      const { editorRef } = await mountEditor("> [!note] T\n> - [ ] task\n> - plain item")
      const plainItem = itemWithText("plain item")

      await placeCaretInItem(plainItem)
      await toggleTaskWithKeyboard(plainItem)
      await toggleTaskWithKeyboard(plainItem)
      await focusAndLeaveCallouts()

      expect(editorRef.current?.getMarkdown()).toBe("> [!note] T\n> - [ ] task\n> - [ ] plain item")
    })

    test("ticks a plain item with one click", async () => {
      const { editorRef } = await mountEditor("> [!note] T\n> - [ ] task\n> - plain item")

      await clickCheckbox(itemWithText("plain item"))
      await focusAndLeaveCallouts()

      expect(editorRef.current?.getMarkdown()).toBe("> [!note] T\n> - [ ] task\n> - [x] plain item")
    })

    test("saves a task after a tick and untick by click before the callout was ever focused", async () => {
      const { editorRef, changes } = await mountEditor("> [!note] T\n> - [ ] task\n> - plain item")
      const plainItem = itemWithText("plain item")

      await clickCheckbox(plainItem)
      expect(plainItem.getAttribute("aria-checked")).toBe("true")
      expect(changes.at(-1)).toBe("> [!note] T\n> - [ ] task\n> - [x] plain item")
      await clickCheckbox(plainItem)

      expect(plainItem.getAttribute("aria-checked")).toBe("false")
      expect(changes.at(-1)).toBe("> [!note] T\n> - [ ] task\n> - [ ] plain item")
      expect(editorRef.current?.getMarkdown()).toBe("> [!note] T\n> - [ ] task\n> - [ ] plain item")
    })

    test("persists a cold checkbox click through both levels of nested callouts", async () => {
      const { editorRef, changes } = await mountEditor(
        "> [!note] Outer\n> > [!todo] Inner\n> > - [ ] task\n> > - plain item",
      )
      const task = itemWithText("task")

      await clickCheckbox(task)

      expect(task.getAttribute("aria-checked")).toBe("true")
      expect(changes.at(-1)).toBe(
        "> [!note] Outer\n> > [!todo] Inner\n> > - [x] task\n> > - plain item",
      )
      expect(editorRef.current?.getMarkdown()).toBe(changes.at(-1))
    })

    test("undoes and redoes a cold callout checkbox change with the document history controls", async () => {
      const markdown = "> [!note] T\n> - [ ] task\n> - plain item"
      const { editorRef } = await mountEditor(markdown)
      await clickCheckbox(itemWithText("task"))
      const checked = "> [!note] T\n> - [x] task\n> - plain item"
      expect(editorRef.current?.getMarkdown()).toBe(checked)

      await act(async () => {
        editorRef.current?.undo()
        await flushEffects()
      })
      expect(editorRef.current?.getMarkdown()).toBe(markdown)
      expect(itemWithText("task").getAttribute("aria-checked")).toBe("false")

      await act(async () => {
        editorRef.current?.redo()
        await flushEffects()
      })
      expect(itemWithText("task").getAttribute("aria-checked")).toBe("true")
      expect(editorRef.current?.getMarkdown()).toBe(checked)
    })

    test("keeps an untouched plain item plain while a task beside it is toggled", async () => {
      const { editorRef } = await mountEditor("> [!note] T\n> - [ ] task\n> - plain item")
      const task = itemWithText("task")

      await toggleTaskWithKeyboard(task)
      await toggleTaskWithKeyboard(task)
      await focusAndLeaveCallouts()

      expect(editorRef.current?.getMarkdown()).toBe("> [!note] T\n> - [ ] task\n> - plain item")
    })
  })

  describe("blank lines in lists", () => {
    for (const listSpacingCase of UNCHANGED_LIST_SPACING_CASES) {
      test(`keeps ${listSpacingCase.name}`, async () => {
        expect(await savedWithoutEditing(listSpacingCase.markdown)).toBe(listSpacingCase.markdown)
      })
    }

    test("blanks every gap once any gap between items is blank", async () => {
      expect(await savedWithoutEditing("- one\n\n- two\n- three")).toBe("- one\n\n- two\n\n- three")
    })

    test("keeps a loose list loose when an item is edited", async () => {
      expect(await savedAfterEditingLastText("- one\n\n- two", " edited")).toBe(
        "- one\n\n- two edited",
      )
    })

    test("keeps a loose item loose when its text is edited", async () => {
      expect(await savedAfterEditingLastText("- item\n\n  > quoted", " edited")).toBe(
        "- item\n\n  > quoted edited",
      )
    })

    test("gives an item added to a loose list a blank line before it", async () => {
      expect(await savedAfterAddingItem("- one\n\n- two", "three")).toBe(
        "- one\n\n- two\n\n- three",
      )
    })

    test("gives an item added to a loose numbered list a blank line before it", async () => {
      expect(await savedAfterAddingItem("1. one\n\n2. two", "three")).toBe(
        "1. one\n\n2. two\n\n3. three",
      )
    })

    test("keeps an item added to a tight list tight", async () => {
      expect(await savedAfterAddingItem("- one\n- two", "three")).toBe("- one\n- two\n- three")
    })

    test("keeps an item added to a list with a loose item tight between items", async () => {
      expect(await savedAfterAddingItem("- item\n\n  > quoted\n- two", "three")).toBe(
        "- item\n\n  > quoted\n- two\n- three",
      )
    })

    test("keeps an item added to a nested loose list loose", async () => {
      expect(await savedAfterAddingItem("- one\n  - a\n\n  - b", "c")).toBe(
        "- one\n  - a\n\n  - b\n\n  - c",
      )
    })
  })
})
