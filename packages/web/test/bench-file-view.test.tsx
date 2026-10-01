import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BenchFileView } from "../src/components/bench/bench-file-view"

describe("Bench file view", () => {
  let container: HTMLDivElement
  let root: Root
  let measuredWidth: number
  let originalClientWidth: PropertyDescriptor | undefined

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    measuredWidth = 800
    originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")
    // HappyDOM has no layout engine; supply the measured container width at that boundary.
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => measuredWidth,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth)
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientWidth")
    }
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test.each([
    { width: 540, maximumListWidth: 200, minimumPreviewWidth: 340 },
    { width: 320, maximumListWidth: 120, minimumPreviewWidth: 200 },
  ])("keeps most of a $width px view available to the preview", async (scenario) => {
    measuredWidth = scenario.width
    await act(async () => {
      root.render(
        <BenchFileView directory="/workspace/repo" drawer={<input aria-label="Filter files" />}>
          <textarea aria-label="File contents" />
        </BenchFileView>,
      )
    })
    const separator = container.querySelector('[role="separator"][aria-label="Resize file tree"]')
    if (!separator) throw new Error("Expected the open file tree resize control")
    const listWidth = Number(separator.getAttribute("aria-valuenow"))
    expect(listWidth).toBeGreaterThan(0)
    expect(listWidth).toBeLessThanOrEqual(scenario.maximumListWidth)
    expect(scenario.width - listWidth).toBeGreaterThanOrEqual(scenario.minimumPreviewWidth)
  })

  test("defaults to a compact list in a wide view and allows deliberate resizing", async () => {
    measuredWidth = 1000
    await act(async () => {
      root.render(
        <BenchFileView directory="/workspace/repo" drawer={<input aria-label="Filter files" />}>
          <textarea aria-label="File contents" />
        </BenchFileView>,
      )
    })
    const separator = container.querySelector('[role="separator"][aria-label="Resize file tree"]')
    if (!separator) throw new Error("Expected the open file tree resize control")
    expect(separator.getAttribute("aria-valuenow")).toBe("240")
    await act(async () => {
      separator.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }))
    })
    expect(separator.getAttribute("aria-valuenow")).toBe("320")
    await act(async () => {
      separator.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }))
    })
    expect(separator.getAttribute("aria-valuenow")).toBe("160")
  })

  test("preserves an edited preview when Files becomes empty or inactive", async () => {
    async function render(active: boolean, showEmpty: boolean) {
      await act(async () => {
        root.render(
          <BenchFileView
            directory="/workspace/repo"
            path="/workspace/repo/src/main.tsx"
            drawer={<input aria-label="Filter files" />}
            active={active}
            showEmpty={showEmpty}
            initialTreeOpen={false}
          >
            <textarea aria-label="File contents" defaultValue="Initial content" />
          </BenchFileView>,
        )
      })
    }

    await render(true, false)
    const preview = container.querySelector("textarea")
    if (!preview) throw new Error("Expected the mounted file preview")
    preview.value = "An unsaved edit"
    expect(container.querySelector('nav[aria-label="File path"]')?.textContent).toContain(
      "main.tsx",
    )

    await render(true, true)
    expect(container.textContent).toContain("Open file")
    expect(container.textContent).toContain("Select a file from the workspace tree.")
    expect(preview.closest("[hidden]")).not.toBeNull()
    expect(container.querySelector("textarea")).toBe(preview)

    await render(false, true)
    expect(container.textContent).not.toContain("Open file")
    expect(preview.closest("[hidden]")).toBeNull()
    expect(container.querySelector("textarea")).toBe(preview)
    expect(container.querySelector("button[aria-controls]")?.closest("[hidden]")).not.toBeNull()

    await render(true, false)
    expect(container.querySelector("textarea")).toBe(preview)
    expect(preview.value).toBe("An unsaved edit")
    expect(preview.closest("[hidden]")).toBeNull()
  })

  test.each([
    {
      kind: "file",
      showLabel: "Show file tree",
      hideLabel: "Hide file tree",
      listLabel: "Workspace files",
      title: "Open file",
      description: "Select a file from the workspace tree.",
    },
    {
      kind: "note",
      showLabel: "Show notes",
      hideLabel: "Hide notes",
      listLabel: "Notes",
      title: "Open note",
      description: "Select a note from the list.",
    },
    {
      kind: "board",
      showLabel: "Show boards",
      hideLabel: "Hide boards",
      listLabel: "Boards",
      title: "Open board",
      description: "Select a board from the list.",
    },
    {
      kind: "resource",
      showLabel: "Show resources",
      hideLabel: "Hide resources",
      listLabel: "Resources",
      title: "Open resource",
      description: "Select a resource from the list.",
    },
    {
      kind: "practice",
      showLabel: "Show practice",
      hideLabel: "Hide practice",
      listLabel: "Practice",
      title: "Open exercise",
      description: "Select an exercise from the list.",
    },
    {
      kind: "creation",
      showLabel: "Show creations",
      hideLabel: "Hide creations",
      listLabel: "Creations",
      title: "Open creation",
      description: "Select a creation from the list.",
    },
  ] as const)(
    "$kind controls expose their state, focus the filter, and close with Escape",
    async (scenario) => {
      await act(async () => {
        root.render(
          <BenchFileView
            kind={scenario.kind}
            directory="/workspace/repo"
            drawer={<input aria-label="Filter files" />}
            initialTreeOpen={false}
          />,
        )
      })
      expect(container.textContent).toContain(scenario.title)
      expect(container.textContent).toContain(scenario.description)
      const toggle = container.querySelector<HTMLButtonElement>(
        `button[aria-label="${scenario.showLabel}"]`,
      )
      const filter = container.querySelector<HTMLInputElement>('input[aria-label="Filter files"]')
      const tree = container.querySelector(`aside[aria-label="${scenario.listLabel}"]`)
      if (!toggle || !filter || !tree) throw new Error("Expected the file tree controls")
      expect(toggle.getAttribute("aria-expanded")).toBe("false")
      expect(toggle.getAttribute("aria-controls")).toBe(tree.id)
      expect(tree.getAttribute("aria-hidden")).toBe("true")
      expect(tree.hasAttribute("inert")).toBe(true)

      await act(async () => toggle.click())
      expect(toggle.getAttribute("aria-expanded")).toBe("true")
      expect(toggle.getAttribute("aria-label")).toBe(scenario.hideLabel)
      expect(tree.getAttribute("aria-hidden")).toBe("false")
      expect(tree.hasAttribute("inert")).toBe(false)
      expect(document.activeElement).toBe(filter)

      await act(async () => {
        filter.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      })
      expect(toggle.getAttribute("aria-expanded")).toBe("false")
      expect(tree.getAttribute("aria-hidden")).toBe("true")
      expect(tree.hasAttribute("inert")).toBe(true)
      expect(document.activeElement).toBe(toggle)
    },
  )

  test.each([
    { kind: "board", rootLabel: "Boards", pathLabel: "Board path" },
    { kind: "resource", rootLabel: "Resources", pathLabel: "Resource path" },
  ] as const)("shows the $kind display title in its breadcrumb", async (scenario) => {
    await act(async () => {
      root.render(
        <BenchFileView
          kind={scenario.kind}
          directory="/workspace/repo"
          path="objects/internal-id"
          title="Solar system"
          drawer={null}
          initialTreeOpen={false}
        >
          <div>Selected object</div>
        </BenchFileView>,
      )
    })
    const breadcrumb = container.querySelector(`nav[aria-label="${scenario.pathLabel}"]`)
    expect(breadcrumb?.textContent).toBe(`${scenario.rootLabel}Solar system`)
    expect(breadcrumb?.querySelector("svg[aria-hidden]")).toBeTruthy()
    expect(breadcrumb?.textContent).not.toContain("internal-id")
  })
})
