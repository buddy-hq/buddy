import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createElement, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { resolveInlineToolRenderer } from "../src/components/chat/tools/registry"
import { renderSavedQuestionSetTool } from "../src/components/chat/tools/render/question-set/saved-question-set-tool"
import { PlatformProvider, createBrowserPlatform } from "../src/context/platform"
import { ServerProvider } from "../src/context/server"
import type { ToolPartProps } from "../src/components/chat/tools/registry"
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

function SavedQuestionSetToolHost(props: { toolProps: ToolPartProps }) {
  return renderSavedQuestionSetTool(props.toolProps)
}

function SavedQuestionSetTestProviders(props: { children?: ReactNode }) {
  return PlatformProvider({
    value: createBrowserPlatform(),
    children: ServerProvider({
      value: {
        url: "",
        username: null,
        password: null,
        isSidecar: false,
      },
      children: props.children ?? null,
    }),
  })
}

describe("tool registry", () => {
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

  test("keeps the saved question-set renderer registered for persisted sessions", () => {
    expect(resolveInlineToolRenderer("render_saved_question_set").card).toBe(
      renderSavedQuestionSetTool,
    )
  })

  test("fetches metadata-only saved question sets once before rendering them", async () => {
    let artifactReads = 0

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const requestUrl = new URL(url, "http://localhost")

      if (requestUrl.pathname === "/api/question-set-artifacts/01JSAVEDQUESTIONSETABCDEFGH1") {
        artifactReads += 1
        expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
        return new Response(
          JSON.stringify({
            artifactID: "01JSAVEDQUESTIONSETABCDEFGH1",
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
            artifactID: "01JSAVEDQUESTIONSETABCDEFGH1",
            groupType: "quiz",
            title: "Intro Algebra Check",
            questionCount: 1,
          },
        },
        attachments: [],
      },
      info: {
        title: "Saved question set",
      },
      tool: "render_saved_question_set",
      directory: "/repo",
    }

    await act(async () => {
      root.render(
        createElement(
          SavedQuestionSetTestProviders,
          undefined,
          createElement(SavedQuestionSetToolHost, { toolProps: props }),
        ),
      )
      await flushEffects()
    })

    await waitForAssertion(() => {
      expect(container.textContent).toContain("What is 2 + 2?")
    })

    await flushEffects()
    await flushEffects()
    await flushEffects()

    expect(artifactReads).toBe(1)
  })

  test("refetches metadata-only saved question sets when the workspace directory changes", async () => {
    const seenDirectories: string[] = []

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const requestUrl = new URL(url, "http://localhost")

      if (requestUrl.pathname === "/api/question-set-artifacts/01JSAVEDQUESTIONSETABCDEFGH1") {
        const directory = new Headers(init?.headers).get("x-buddy-directory")
        seenDirectories.push(directory ?? "")

        return new Response(
          JSON.stringify({
            artifactID: "01JSAVEDQUESTIONSETABCDEFGH1",
            title: directory === "/repo-b" ? "Workspace B Quiz" : "Workspace A Quiz",
            groupType: "quiz",
            questions: [
              {
                id: "q1",
                prompt: directory === "/repo-b" ? "What is 3 + 3?" : "What is 2 + 2?",
                goalIds: ["goal-1"],
                payload: {
                  multipleSelect: false,
                  choices: [
                    { id: "a", content: "4" },
                    { id: "b", content: "6" },
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
        id: "part-2",
        sessionID: "session-1",
        messageID: "message-2",
        type: "tool",
      },
      state: {
        status: "completed",
        input: {},
        metadata: {
          artifact: "RenderSavedQuestionSetOutput",
          value: {
            artifactID: "01JSAVEDQUESTIONSETABCDEFGH1",
            groupType: "quiz",
            title: "Saved quiz",
            questionCount: 1,
          },
        },
        attachments: [],
      },
      info: {
        title: "Saved question set",
      },
      tool: "render_saved_question_set",
      directory: "/repo-a",
    }

    async function renderTool(directory: string) {
      await act(async () => {
        root.render(
          createElement(
            SavedQuestionSetTestProviders,
            undefined,
            createElement(SavedQuestionSetToolHost, {
              toolProps: {
                ...props,
                directory,
              },
            }),
          ),
        )
        await flushEffects()
      })
    }

    await renderTool("/repo-a")

    await waitForAssertion(() => {
      expect(container.textContent).toContain("What is 2 + 2?")
    })

    await renderTool("/repo-b")

    await waitForAssertion(() => {
      expect(container.textContent).toContain("What is 3 + 3?")
    })

    expect(seenDirectories).toEqual(["/repo-a", "/repo-b"])
  })
})
