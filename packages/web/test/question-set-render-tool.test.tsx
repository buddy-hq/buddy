import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderRenderSavedQuestionSetTool } from "../src/components/chat/tools/render/question-set"
import type { ToolPartProps } from "../src/components/chat/tools/registry"
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

describe("renderRenderSavedQuestionSetTool", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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
    globalThis.fetch = originalFetch
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("fetches a missing artifact only once", async () => {
    let artifactReadCount = 0

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const requestUrl = new URL(url, "http://localhost")

      if (requestUrl.pathname === "/api/question-set-artifacts/artifact-1") {
        artifactReadCount += 1
        expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
        return new Response(
          JSON.stringify({
            artifactID: "artifact-1",
            title: "Quick Check",
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

    const props: ToolPartProps = {
      part: {
        id: "part-1",
        sessionID: "session-1",
        messageID: "message-1",
        type: "tool",
      },
      state: {
        status: "completed",
        input: {},
        metadata: {
          artifact: "RenderSavedQuestionSetOutput",
          value: {
            artifactID: "artifact-1",
            groupType: "quiz",
            title: "Quick Check",
            questionCount: 1,
          },
        },
        attachments: [],
      },
      info: {
        title: "Question Set",
      },
      tool: "render_saved_question_set",
      directory: "/repo",
    }

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
            {renderRenderSavedQuestionSetTool(props)}
          </ServerProvider>
        </PlatformProvider>,
      )
      await flushEffects()
    })

    await waitForAssertion(() => {
      expect(container.textContent).toContain("What is 2 + 2?")
    })

    await flushEffects()
    await flushEffects()
    await flushEffects()

    expect(artifactReadCount).toBe(1)
  })
})
