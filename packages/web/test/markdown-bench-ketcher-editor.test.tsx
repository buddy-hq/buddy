import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, useEffect, useState, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"

type MockEditorProps = {
  onInit(ketcher: typeof mockKetcher): void
}

let resolveExport: ((source: string) => void) | undefined
let initializationShouldFail = false
let providerConstructionCount = 0

const mockKetcher = {
  setMolecule: () =>
    initializationShouldFail
      ? Promise.reject(new Error("Initialization failed"))
      : Promise.resolve(),
  getSmiles: () =>
    new Promise<string>((resolve) => {
      resolveExport = resolve
    }),
}

mock.module("ketcher-react", () => ({
  Editor: (props: MockEditorProps): ReactElement => {
    const { onInit } = props
    useEffect(() => {
      onInit(mockKetcher)
    }, [onInit])
    return <div data-component="mock-ketcher-canvas" />
  },
}))

mock.module("ketcher-standalone", () => ({
  StandaloneStructServiceProvider: class StandaloneStructServiceProvider {
    readonly kind = "mock-standalone-provider"

    constructor() {
      providerConstructionCount += 1
    }
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
  throw new Error("Expected Ketcher editor state to settle.")
}

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  )
}

describe("Markdown Bench Ketcher editor reliability", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    resolveExport = undefined
    initializationShouldFail = false
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
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("keeps Cancel available during save and ignores a late export", async () => {
    const { default: MarkdownBenchKetcherEditor } = await import(
      "../src/components/bench/markdown-bench-ketcher-editor"
    )
    let saveCount = 0
    let cancelCount = 0

    function Harness(): ReactElement {
      const [open, setOpen] = useState(true)
      return open ? (
        <MarkdownBenchKetcherEditor
          format="smiles"
          source="CCO"
          onCancel={() => {
            cancelCount += 1
            setOpen(false)
          }}
          onSave={() => {
            saveCount += 1
            setOpen(false)
          }}
        />
      ) : (
        <div data-component="editor-closed" />
      )
    }

    await act(async () => {
      root.render(<Harness />)
      await flushEffects()
    })
    await waitFor(() => container.textContent?.includes("Changes stay local") === true)
    expect(providerConstructionCount).toBe(1)
    await act(async () => {
      buttonWithText(container, "Save structure")?.click()
      await flushEffects()
    })
    expect(container.textContent).toContain("Saving…")
    const cancel = buttonWithText(container, "Cancel")
    expect(cancel?.disabled).toBe(false)

    await act(async () => {
      cancel?.click()
      await flushEffects()
    })
    expect(cancelCount).toBe(1)
    expect(container.querySelector('[data-component="editor-closed"]')).not.toBeNull()

    await act(async () => {
      resolveExport?.("late-source")
      await flushEffects()
    })
    expect(saveCount).toBe(0)
  })

  test("bounds a never-resolving operation with a named timeout", async () => {
    const { withKetcherOperationTimeout } = await import(
      "../src/components/bench/markdown-bench-ketcher-editor"
    )
    await expect(
      withKetcherOperationTimeout(
        new Promise<string>(() => undefined),
        "Structure export",
        5,
      ),
    ).rejects.toThrow("Structure export exceeded 5 milliseconds")
  })

  test("never enables Save after initialization fails", async () => {
    const { default: MarkdownBenchKetcherEditor } = await import(
      "../src/components/bench/markdown-bench-ketcher-editor"
    )
    initializationShouldFail = true
    await act(async () => {
      root.render(
        <MarkdownBenchKetcherEditor
          format="smiles"
          source="CCO"
          onCancel={() => undefined}
          onSave={() => undefined}
        />,
      )
      await flushEffects()
    })
    await waitFor(() => container.textContent?.includes("Initialization failed") === true)
    expect(buttonWithText(container, "Save structure")?.disabled).toBe(true)
    expect(buttonWithText(container, "Cancel")?.disabled).toBe(false)
  })
})
