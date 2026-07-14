import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  BuddyChemistryPreview,
  MarkdownBenchChemistryViewProvider,
} from "../src/components/bench/markdown-bench-chemistry-plugin"

const FIRST_CHEMISTRY_METADATA =
  'alt="Ethanol skeletal structure" caption="A two-carbon alcohol" unknown="preserved"'

async function flushEffects(): Promise<void> {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("Markdown Bench chemistry previews", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = async () => ({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10"/></svg>',
    })
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

  test("renders generated chemistry without chemistry-specific editing controls", async () => {
    function Previews(): ReactElement {
      return (
        <MarkdownBenchChemistryViewProvider value={{ directory: "/workspace" }}>
          <BuddyChemistryPreview format="smiles" meta={FIRST_CHEMISTRY_METADATA} source="CCO" />
          <BuddyChemistryPreview
            format="ket"
            meta={null}
            source='{"root":{"nodes":[{"$ref":"mol0"}]},"mol0":{}}'
          />
        </MarkdownBenchChemistryViewProvider>
      )
    }

    await act(async () => {
      root.render(<Previews />)
      await flushEffects()
    })

    const renderedStructures = container.querySelectorAll('[role="img"]')
    expect(renderedStructures).toHaveLength(2)
    expect(renderedStructures[0]?.getAttribute("aria-label")).toBe("Ethanol skeletal structure")
    expect(renderedStructures[1]?.getAttribute("aria-label")).toContain("root")
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector("textarea")).toBeNull()
    expect(container.textContent).not.toContain("A two-carbon alcohol")
  })
})
