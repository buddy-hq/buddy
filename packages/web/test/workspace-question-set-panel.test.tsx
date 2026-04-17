import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { WorkspaceQuestionSetPanel } from "../src/components/layout/workspace-question-set-panel"
import { PlatformProvider, createBrowserPlatform } from "../src/context/platform"
import { ServerProvider } from "../src/context/server"
import { createFetchStub } from "./test-utils"

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

describe("WorkspaceQuestionSetPanel", () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    queryClient.clear()
    globalThis.fetch = originalFetch
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("loads and renders persisted workspace question sets", async () => {
    globalThis.fetch = createFetchStub(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const requestUrl = new URL(url, "http://localhost")

      if (requestUrl.pathname === "/api/question-set-artifacts") {
        expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
        return new Response(
          JSON.stringify({
            artifacts: [
              {
                artifactID: "01JQ3D6PHT5D9M0XW1Q9NHV62F",
                kind: "question-set.v1",
                groupType: "quiz",
                title: "Fractions Check",
                createdAt: "2026-04-04T00:30:00.000Z",
                questions: [{ id: "q1" }, { id: "q2" }],
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
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <PlatformProvider value={createBrowserPlatform()}>
            <ServerProvider
              value={{
                url: "",
                username: null,
                password: null,
                isSidecar: false,
              }}
            >
              <WorkspaceQuestionSetPanel directory="/repo" />
            </ServerProvider>
          </PlatformProvider>
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Fractions Check")
      expect(container.textContent).toContain("quiz")
      expect(container.textContent).toContain("2 questions")
    })
  })
})
