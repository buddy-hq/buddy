import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { $getRoot, createEditor, type LexicalEditor } from "lexical"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { KetcherChemistryFormat } from "../src/components/bench/markdown-bench-chemistry-formats"

type MockKetcherEditorProps = {
  format: KetcherChemistryFormat
  source: string
  onCancel(): void
  onSave(source: string): void
}

let mockKetcherShouldThrow = false
const FIRST_CHEMISTRY_METADATA =
  'alt="Ethanol skeletal structure" caption="A two-carbon alcohol" unknown="preserved"'

mock.module("@/components/bench/markdown-bench-ketcher-editor", () => ({
  default: (props: MockKetcherEditorProps): ReactElement => {
    if (mockKetcherShouldThrow) {
      throw new Error("Mock Ketcher render failure")
    }
    return (
      <div data-component="mock-ketcher-editor" data-source={props.source}>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" onClick={() => props.onSave(`${props.source}-saved`)}>
          Save structure
        </button>
      </div>
    )
  },
}))

async function flushEffects(): Promise<void> {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return
    await act(flushEffects)
  }
  throw new Error("Expected chemistry authoring UI to settle.")
}

function buttonsWithText(container: HTMLElement, text: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter(
    (button) => button.textContent?.trim() === text,
  )
}

describe("Markdown Bench chemistry authoring", () => {
  let container: HTMLDivElement
  let root: Root
  let editor: LexicalEditor

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = async () => ({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10"/></svg>',
    })
    mockKetcherShouldThrow = false
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
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = undefined
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function renderTwoChemistryNodes(): Promise<void> {
    const { BuddyChemistryEditor, BuddyChemistryNode, MarkdownBenchChemistryViewProvider } =
      await import("../src/components/bench/markdown-bench-chemistry-plugin")
    editor = createEditor({
      namespace: "markdown-bench-chemistry-authoring-test",
      nodes: [BuddyChemistryNode],
      onError(error) {
        throw error
      },
    })
    let first: InstanceType<typeof BuddyChemistryNode> | undefined
    let second: InstanceType<typeof BuddyChemistryNode> | undefined
    editor.update(
      () => {
        first = new BuddyChemistryNode("smiles", "smiles", "CCO", FIRST_CHEMISTRY_METADATA)
        second = new BuddyChemistryNode("smiles", "smiles", "CCC", null)
        $getRoot().append(first, second)
      },
      { discrete: true },
    )
    if (!first || !second) throw new Error("Expected two chemistry nodes.")
    const firstNode = first
    const secondNode = second
    await act(async () => {
      root.render(
        <MarkdownBenchChemistryViewProvider
          value={{
            directory: "/workspace",
            documentPath: "lesson.md",
            presentation: "interactive",
          }}
        >
          <BuddyChemistryEditor
            editor={editor}
            format="smiles"
            meta={FIRST_CHEMISTRY_METADATA}
            node={firstNode}
            source="CCO"
          />
          <BuddyChemistryEditor
            editor={editor}
            format="smiles"
            meta={null}
            node={secondNode}
            source="CCC"
          />
        </MarkdownBenchChemistryViewProvider>,
      )
      await flushEffects()
    })
  }

  test("keeps one active structure editor and blocks a lossy switch", async () => {
    await renderTwoChemistryNodes()
    await waitFor(() => container.querySelectorAll('[role="img"]').length === 2)
    const renderedStructures = container.querySelectorAll('[role="img"]')
    expect(renderedStructures[0]?.getAttribute("aria-label")).toBe("Ethanol skeletal structure")
    expect(renderedStructures[1]?.getAttribute("aria-label")).toContain("CCC")
    expect(container.textContent).not.toContain("A two-carbon alcohol")
    expect(container.textContent).not.toContain("SMILES")
    for (const preview of container.querySelectorAll(
      '[data-component="markdown-bench-chemistry-preview"]',
    )) {
      expect(preview.classList).not.toContain("bg-surface-weak")
      expect(preview.classList).not.toContain("border")
      expect(preview.classList).not.toContain("rounded-md")
    }
    const initialTriggers = buttonsWithText(container, "Edit structure")
    expect(initialTriggers).toHaveLength(2)
    await act(async () => {
      initialTriggers[0]?.click()
      await flushEffects()
    })
    await waitFor(() => container.querySelector('[data-source="CCO"]') !== null)

    const activeRegion = container.querySelector(
      '[data-component="markdown-bench-chemistry-structure-region"]',
    )
    expect(document.activeElement).toBe(activeRegion)
    const remainingTrigger = buttonsWithText(container, "Edit structure")[0]
    await act(async () => {
      remainingTrigger?.click()
      await flushEffects()
    })
    expect(container.querySelector('[data-source="CCO"]')).not.toBeNull()
    expect(container.querySelector('[data-source="CCC"]')).toBeNull()
    expect(document.activeElement).toBe(activeRegion)

    await act(async () => {
      buttonsWithText(container, "Cancel")[0]?.click()
      await flushEffects()
    })
    await waitFor(() => buttonsWithText(container, "Edit structure").length === 2)
    expect(document.activeElement).toBe(buttonsWithText(container, "Edit structure")[0])
  })

  test("restores source-editor focus after its keyboard exit", async () => {
    await renderTwoChemistryNodes()
    const sourceTriggers = buttonsWithText(container, "Edit source")
    await act(async () => {
      sourceTriggers[1]?.click()
      await flushEffects()
    })
    const textarea = container.querySelector("textarea")
    expect(document.activeElement).toBe(textarea)
    await act(async () => {
      textarea?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))
      await flushEffects()
    })
    expect(document.activeElement).toBe(buttonsWithText(container, "Edit source")[1])
  })

  test("contains Ketcher failures locally and preserves source-edit recovery", async () => {
    const originalConsoleError = console.error
    console.error = () => undefined
    try {
      mockKetcherShouldThrow = true
      await renderTwoChemistryNodes()
      await act(async () => {
        buttonsWithText(container, "Edit structure")[0]?.click()
        await flushEffects()
      })
      await waitFor(() => container.textContent?.includes("Structure editor unavailable") === true)
      expect(
        container.querySelectorAll('[data-component="markdown-bench-chemistry"]'),
      ).toHaveLength(2)
      expect(container.textContent).toContain("Mock Ketcher render failure")
      expect(container.textContent).toContain("CCO")

      await act(async () => {
        buttonsWithText(container, "Edit source")[0]?.click()
        await flushEffects()
      })
      const textarea = container.querySelector("textarea")
      expect(textarea?.value).toBe("CCO")
      expect(document.activeElement).toBe(textarea)
    } finally {
      console.error = originalConsoleError
    }
  })
})
