import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { WorkspaceMermaidPanel } from "../src/components/layout/workspace-mermaid-panel"
import { PlatformProvider, createBrowserPlatform } from "../src/context/platform"
import { ServerProvider } from "../src/context/server"

const originalFetch = globalThis.fetch

async function flushEffects() {
  await act(async () => {
    await Promise.resolve()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  })
}

async function waitForAssertion(assertion: () => void, timeoutMs = 2500) {
  const start = Date.now()
  while (true) {
    try {
      assertion()
      return
    } catch (error) {
      if (Date.now() - start >= timeoutMs) {
        throw error
      }
      await flushEffects()
    }
  }
}

describe("WorkspaceMermaidPanel", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    globalThis.__BUDDY_TEST_MERMAID_RUNTIME__ = {
      initialize() {},
      async render(_id, source) {
        return {
          svg: `<svg xmlns="http://www.w3.org/2000/svg"><text>${source.length}</text></svg>`,
        }
      },
    }
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    globalThis.fetch = originalFetch
    globalThis.__BUDDY_TEST_MERMAID_RUNTIME__ = undefined
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("loads and renders persisted Mermaid artifacts for the workspace", async () => {
    globalThis.fetch = (async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const requestUrl = new URL(url, "http://localhost")

      if (requestUrl.pathname === "/api/mermaid-artifacts") {
        expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
        expect(requestUrl.searchParams.get("directory")).toBe("/repo")
        return new Response(
          JSON.stringify({
            artifacts: [
              {
                artifactID: "a".repeat(64),
                kind: "mermaid.v1",
                diagramType: "flowchart",
                alt: "Release workflow",
                caption: "Workspace-wide diagram",
                repairAttempts: 0,
                repairLog: [],
                source: "flowchart TD\nA --> B",
                createdAt: "2026-03-24T10:00:00.000Z",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      throw new Error(`Unexpected request: ${url}`)
    }) as typeof fetch

    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <ServerProvider
            value={{
              url: "",
              username: null,
              password: null,
              isSidecar: false,
            }}
          >
            <WorkspaceMermaidPanel directory="/repo" />
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Workspace Diagrams")
      expect(container.textContent).toContain("Release workflow")
      expect(container.textContent).toContain("Workspace-wide diagram")
      expect(container.querySelector('[data-component="mermaid-diagram"] svg')).not.toBeNull()
    })
  })
})
