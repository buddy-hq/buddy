import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChemistryErrorBoundary } from "../src/components/media/renderers/chemistry/chemistry-error-boundary"

let childShouldThrow = true

function UnstableChemistryChild(): ReactElement {
  if (childShouldThrow) throw new Error("Chemistry chunk failed")
  return <div data-component="recovered-chemistry">Recovered</div>
}

describe("chemistry-local error boundary", () => {
  let container: HTMLDivElement
  let root: Root
  let originalConsoleError: typeof console.error

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    childShouldThrow = true
    originalConsoleError = console.error
    console.error = () => undefined
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    console.error = originalConsoleError
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("contains a failed chemistry child and retries without removing siblings", async () => {
    await act(async () => {
      root.render(
        <div>
          <p>Before chemistry</p>
          <ChemistryErrorBoundary
            resetKeys={["smiles", "CCO"]}
            fallback={({ error, retry }) => (
              <div>
                <p>{error.message}</p>
                <button
                  type="button"
                  onClick={() => {
                    childShouldThrow = false
                    retry()
                  }}
                >
                  Retry
                </button>
              </div>
            )}
          >
            <UnstableChemistryChild />
          </ChemistryErrorBoundary>
          <p>After chemistry</p>
        </div>,
      )
    })
    expect(container.textContent).toContain("Before chemistry")
    expect(container.textContent).toContain("Chemistry chunk failed")
    expect(container.textContent).toContain("After chemistry")

    await act(async () => {
      container.querySelector("button")?.click()
    })
    expect(container.querySelector('[data-component="recovered-chemistry"]')).not.toBeNull()
    expect(container.textContent).toContain("Before chemistry")
    expect(container.textContent).toContain("After chemistry")
  })
})
