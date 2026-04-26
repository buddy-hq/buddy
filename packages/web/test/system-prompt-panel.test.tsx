import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { SystemPromptPanel } from "../src/components/debug/system-prompt-panel"
import { PlatformProvider, createBrowserPlatform } from "../src/context/platform"
import { ServerProvider } from "../src/context/server"
import { useChatStore } from "../src/state/chat-store"
import { BUSY_SESSION_STATUS } from "../src/state/session-status"
import { createFetchStub } from "./test-utils"

const originalFetch = globalThis.fetch

function resetStore() {
  useChatStore.setState({
    openProjects: [],
    activeDirectory: undefined,
    pendingActiveDirectory: undefined,
    entryError: undefined,
    lastSessionByDirectory: {},
    selectedModelByDirectory: {},
    directories: {},
    streamStatus: "idle",
  })
}

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

describe("SystemPromptPanel", () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    resetStore()
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
    resetStore()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("polls while the active session is busy and renders the captured prompt when it becomes available", async () => {
    const directory = "/repo"
    const sessionID = "ses_busy"
    let teachingStateRequests = 0

    const store = useChatStore.getState()
    store.ensureOpenProject(directory)
    store.setSessionInfo(directory, {
      id: sessionID,
      title: "Test session",
      time: {
        created: 1,
        updated: 1,
      },
    })
    store.applySessionStatus(directory, sessionID, BUSY_SESSION_STATUS)

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const method = init?.method ?? "GET"
      const headers = new Headers(init?.headers)

      if (url.endsWith(`/api/session/${sessionID}/teaching-state`) && method === "GET") {
        teachingStateRequests += 1
        expect(headers.get("x-buddy-directory")).toBe(directory)

        if (teachingStateRequests === 1) {
          return new Response(null, { status: 204 })
        }

        return new Response(
          JSON.stringify({
            sessionId: sessionID,
            persona: "buddy",
            currentSurface: "curriculum",
            workspaceState: "chat",
            focusGoalIds: [],
            lastLlmOutbound: {
              kind: "message",
              createdAt: new Date().toISOString(),
              payload: {},
              fullSystemPrompt: "You are Buddy, a learning companion.",
            },
            llmOutboundHistory: [],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      throw new Error(`Unexpected request ${method} ${url}`)
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
              <SystemPromptPanel directory={directory} sessionID={sessionID} />
            </ServerProvider>
          </PlatformProvider>
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    await waitForAssertion(() => {
      expect(container.textContent?.includes("Capturing the latest system prompt...")).toBe(true)
    })

    await waitForAssertion(() => {
      expect(container.textContent?.includes("You are Buddy, a learning companion.")).toBe(true)
      expect(teachingStateRequests).toBeGreaterThanOrEqual(2)
    })
  })

  test("shows a prompt diff after the captured prompt changes", async () => {
    const directory = "/repo"
    const sessionID = "ses_diff"
    let teachingStateRequests = 0

    const store = useChatStore.getState()
    store.ensureOpenProject(directory)
    store.setSessionInfo(directory, {
      id: sessionID,
      title: "Diff session",
      time: {
        created: 1,
        updated: 1,
      },
    })
    store.applySessionStatus(directory, sessionID, BUSY_SESSION_STATUS)

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const method = init?.method ?? "GET"
      const headers = new Headers(init?.headers)

      if (url.endsWith(`/api/session/${sessionID}/teaching-state`) && method === "GET") {
        teachingStateRequests += 1
        expect(headers.get("x-buddy-directory")).toBe(directory)

        const prompt =
          teachingStateRequests === 1
            ? "You are Buddy, a learning companion."
            : "You are Buddy, a learning companion. Keep responses short."

        return new Response(
          JSON.stringify({
            sessionId: sessionID,
            persona: "buddy",
            currentSurface: "curriculum",
            workspaceState: "chat",
            focusGoalIds: [],
            lastLlmOutbound: {
              kind: "message",
              createdAt: new Date().toISOString(),
              payload: {},
              fullSystemPrompt: prompt,
            },
            llmOutboundHistory: [],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      throw new Error(`Unexpected request ${method} ${url}`)
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
              <SystemPromptPanel directory={directory} sessionID={sessionID} />
            </ServerProvider>
          </PlatformProvider>
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    await waitForAssertion(() => {
      expect(container.textContent?.includes("Diff")).toBe(true)
    })

    const diffButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Diff"),
    )
    expect(diffButton).toBeDefined()

    await act(async () => {
      diffButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    await waitForAssertion(() => {
      expect(container.textContent?.includes("-You are Buddy, a learning companion.")).toBe(true)
      expect(
        container.textContent?.includes(
          "+You are Buddy, a learning companion. Keep responses short.",
        ),
      ).toBe(true)
    })
  })
})
