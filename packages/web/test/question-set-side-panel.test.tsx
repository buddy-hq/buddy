import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QuestionSetSidePanel } from "../src/components/chat/tools/render/question-set/question-set-side-panel"
import { PlatformProvider, createBrowserPlatform } from "../src/context/platform"
import { ServerProvider } from "../src/context/server"
import { useUiPreferences } from "../src/state/ui-preferences"
import { useWorkspaceQuestionSetPanelStore } from "../src/state/workspace-question-set-panel-store"
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

describe("QuestionSetSidePanel", () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient()
    useUiPreferences.persist.clearStorage()
    useUiPreferences.setState((state) => ({
      ...state,
      rightSidebarOpen: true,
      rightSidebarTab: "question-set",
    }))
    useWorkspaceQuestionSetPanelStore.setState({
      selectedArtifactIDByDirectory: {
        "/repo": "01JQUESTIONSETABCDEFGHJKLMN1",
      },
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    queryClient.clear()
    globalThis.fetch = originalFetch
    useUiPreferences.setState((state) => ({
      ...state,
      rightSidebarOpen: false,
      rightSidebarTab: "curriculum",
    }))
    useWorkspaceQuestionSetPanelStore.setState({
      selectedArtifactIDByDirectory: {},
    })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("preserves selected answers across panel unmount and remount", async () => {
    globalThis.fetch = createFetchStub(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const requestUrl = new URL(url, "http://localhost")

      expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")

      if (requestUrl.pathname === "/api/question-set-artifacts/01JQUESTIONSETABCDEFGHJKLMN1") {
        return new Response(
          JSON.stringify({
            artifactID: "01JQUESTIONSETABCDEFGHJKLMN1",
            title: "Intro Algebra Check",
            groupType: "quiz",
            questions: [
              {
                id: "q1",
                prompt: "What is 2 + 2?",
                goalIds: ["goal-1"],
                payload: {
                  multipleSelect: false,
                  choices: [
                    { id: "a", content: "3" },
                    { id: "b", content: "4" },
                  ],
                },
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

    async function renderPanel() {
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
                <QuestionSetSidePanel
                  artifactID="01JQUESTIONSETABCDEFGHJKLMN1"
                  directory="/repo"
                  onClose={() => {}}
                />
              </ServerProvider>
            </PlatformProvider>
          </QueryClientProvider>,
        )
        await flushEffects()
      })
    }

    await renderPanel()

    await waitForAssertion(() => {
      expect(container.textContent).toContain("What is 2 + 2?")
    })

    await act(async () => {
      const inputs = document.querySelectorAll('input[name="question-q1"]')
      ;(inputs[1] as HTMLInputElement).click()
      await flushEffects()
    })

    expect(
      (document.querySelectorAll('input[name="question-q1"]')[1] as HTMLInputElement).checked,
    ).toBe(true)

    await act(async () => {
      root.unmount()
      await flushEffects()
    })

    root = createRoot(container)
    await renderPanel()

    await waitForAssertion(() => {
      expect(
        (document.querySelectorAll('input[name="question-q1"]')[1] as HTMLInputElement).checked,
      ).toBe(true)
    })
  })

  test("back clears the selected artifact and closes the right sidebar", async () => {
    globalThis.fetch = createFetchStub(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const requestUrl = new URL(url, "http://localhost")

      expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")

      if (requestUrl.pathname === "/api/question-set-artifacts/01JQUESTIONSETABCDEFGHJKLMN1") {
        return new Response(
          JSON.stringify({
            artifactID: "01JQUESTIONSETABCDEFGHJKLMN1",
            title: "Intro Algebra Check",
            groupType: "quiz",
            questions: [],
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
              <QuestionSetSidePanel
                artifactID="01JQUESTIONSETABCDEFGHJKLMN1"
                directory="/repo"
                onClose={() => {
                  useUiPreferences.setState((state) => ({
                    ...state,
                    rightSidebarOpen: false,
                    rightSidebarTab: "curriculum",
                  }))
                }}
              />
            </ServerProvider>
          </PlatformProvider>
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Intro Algebra Check")
    })

    await act(async () => {
      const backButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Back"),
      )
      if (!backButton) {
        throw new Error("Back button not found")
      }
      backButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    expect(useUiPreferences.getState().rightSidebarOpen).toBe(false)
    expect(useUiPreferences.getState().rightSidebarTab).toBe("curriculum")
    expect(
      useWorkspaceQuestionSetPanelStore.getState().selectedArtifactIDByDirectory["/repo"],
    ).toBeUndefined()
  })
})
