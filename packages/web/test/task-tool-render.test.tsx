import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { TooltipProvider } from "@buddy/ui"
import { renderTaskTool } from "../src/components/chat/tools/render/task"
import type { ToolPartProps } from "../src/components/chat/tools/registry"
import { useChatStore } from "../src/state/chat-store"
import { useUiPreferences } from "../src/state/ui-preferences"
import { useWorkspaceQuestionSetPanelStore } from "../src/state/workspace-question-set-panel-store"
import { createFetchStub, seedDirectoryChatState } from "./test-utils"

async function flushEffects() {
  await act(async () => {
    await Promise.resolve()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  })
}

describe("renderTaskTool", () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: Root
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient()
    useChatStore.persist.clearStorage()
    useUiPreferences.persist.clearStorage()
    useChatStore.setState((state) => ({
      ...state,
      directories: {},
    }))
    useUiPreferences.setState((state) => ({
      ...state,
      rightSidebarOpen: false,
      rightSidebarTab: "curriculum",
    }))
    useWorkspaceQuestionSetPanelStore.setState({
      selectedArtifactIDByDirectory: {},
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
    useChatStore.setState((state) => ({
      ...state,
      directories: {},
    }))
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

  test("shows the spawned child session details instead of only the generic task label", async () => {
    seedDirectoryChatState("/repo", {
      sessions: [
        {
          id: "child-session",
          title: "Read AGENTS.md (@Dalton subagent)",
          parentID: "root-session",
          time: {
            created: Date.now() - 60_000,
            updated: Date.now() - 60_000,
          },
        },
      ],
      isReady: true,
    })

    const props: ToolPartProps = {
      part: {
        id: "part-1",
        sessionID: "root-session",
        messageID: "message-1",
        type: "tool",
      },
      state: {
        status: "completed",
        input: {
          description: "Read AGENTS.md",
          subagent_type: "Dalton",
        },
        metadata: {
          sessionId: "child-session",
        },
        attachments: [],
      },
      info: {
        title: "Task",
      },
      tool: "task",
      directory: "/repo",
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>{renderTaskTool(props)}</TooltipProvider>
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Read AGENTS.md")
    expect(container.textContent).toContain("Dalton")
    expect(container.textContent).not.toContain("Read AGENTS.md (@Dalton subagent)")
  })

  test("projects flashcard decks created by the child flashcard-author session", async () => {
    globalThis.fetch = createFetchStub(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const requestUrl = new URL(url, "http://localhost")

      if (requestUrl.pathname === "/api/flashcard-decks") {
        expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
        return new Response(
          JSON.stringify({
            decks: [
              {
                deckID: "01JABCDEFGHJKMNPQRSTVWXYZ1",
                kind: "flashcard-deck.v1",
                title: "Cell Biology Basics",
                noteCount: 2,
                cardCount: 3,
                dueCounts: {
                  new: 3,
                  learning: 0,
                  review: 0,
                },
                reviewAvailable: true,
                createdAt: "2026-04-19T10:00:00.000Z",
                createdBy: {
                  sessionID: "child-session",
                  messageID: "msg-1",
                  callID: "call-1",
                  subagent: "flashcard-author",
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

      if (requestUrl.pathname === "/api/flashcard-decks/01JABCDEFGHJKMNPQRSTVWXYZ1") {
        expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
        return new Response(
          JSON.stringify({
            deckID: "01JABCDEFGHJKMNPQRSTVWXYZ1",
            kind: "flashcard-deck.v1",
            title: "Cell Biology Basics",
            config: {
              newPerDay: 20,
              reviewsPerDay: 200,
              learnSteps: [1, 10],
              relearnSteps: [10],
              graduatingIntervalGood: 1,
              graduatingIntervalEasy: 4,
              initialEaseFactor: 2500,
              hardMultiplier: 1.2,
              easyMultiplier: 1.3,
              lapseMultiplier: 0,
              maxInterval: 36500,
              leechThreshold: 8,
            },
            notes: [
              {
                noteID: "01JABCDEFGHJKMNPQRSTVWXYZ2",
                deckID: "01JABCDEFGHJKMNPQRSTVWXYZ1",
                type: "basic",
                fields: {
                  front: "What organelle produces ATP in eukaryotic cells?",
                  back: "The mitochondrion.",
                },
                tags: [],
              },
              {
                noteID: "01JABCDEFGHJKMNPQRSTVWXYZ3",
                deckID: "01JABCDEFGHJKMNPQRSTVWXYZ1",
                type: "cloze",
                fields: {
                  text: "The {{c1::nucleus}} stores the cell's {{c2::genetic material}}.",
                },
                tags: [],
              },
            ],
            cards: [
              {
                cardID: "01JABCDEFGHJKMNPQRSTVWXYZ4",
                noteID: "01JABCDEFGHJKMNPQRSTVWXYZ2",
                templateIdx: 0,
                state: "new",
                due: 0,
                interval: 0,
                easeFactor: 2500,
                reps: 0,
                lapses: 0,
                remainingSteps: 0,
              },
              {
                cardID: "01JABCDEFGHJKMNPQRSTVWXYZ5",
                noteID: "01JABCDEFGHJKMNPQRSTVWXYZ3",
                templateIdx: 0,
                state: "new",
                due: 0,
                interval: 0,
                easeFactor: 2500,
                reps: 0,
                lapses: 0,
                remainingSteps: 0,
              },
              {
                cardID: "01JABCDEFGHJKMNPQRSTVWXYZ6",
                noteID: "01JABCDEFGHJKMNPQRSTVWXYZ3",
                templateIdx: 1,
                state: "new",
                due: 0,
                interval: 0,
                easeFactor: 2500,
                reps: 0,
                lapses: 0,
                remainingSteps: 0,
              },
            ],
            source: "Biology lecture notes",
            createdAt: "2026-04-19T10:00:00.000Z",
            createdBy: {
              sessionID: "child-session",
              messageID: "msg-1",
              callID: "call-1",
              subagent: "flashcard-author",
            },
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

    seedDirectoryChatState("/repo", {
      sessions: [
        {
          id: "child-session",
          title: "Create flashcards (@flashcard-author subagent)",
          parentID: "root-session",
          time: {
            created: Date.now() - 60_000,
            updated: Date.now() - 60_000,
          },
        },
      ],
      isReady: true,
    })

    const props: ToolPartProps = {
      part: {
        id: "part-1",
        sessionID: "root-session",
        messageID: "message-1",
        type: "tool",
      },
      state: {
        status: "completed",
        input: {
          description: "Create flashcards",
          subagent_type: "flashcard-author",
        },
        metadata: {
          sessionId: "child-session",
        },
        output: [
          "task_id: child-session",
          "",
          "<task_result>",
          "Created a flashcard deck about cell biology.",
          "</task_result>",
        ].join("\n"),
        attachments: [],
      },
      info: {
        title: "Task",
      },
      tool: "task",
      directory: "/repo",
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>{renderTaskTool(props)}</TooltipProvider>
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    await flushEffects()
    await flushEffects()

    expect(container.textContent).toContain("Cell Biology Basics")
    expect(container.textContent).toContain("2 notes")
    expect(container.textContent).toContain("3 cards")
    expect(container.textContent).toContain("What organelle produces ATP in eukaryotic cells?")
    expect(container.textContent).toContain("Start Review")
  })

  test("hides start review when due counts exist but the deck is not reviewable now", async () => {
    globalThis.fetch = createFetchStub(async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input)
      const requestUrl = new URL(url, "http://localhost")

      if (requestUrl.pathname === "/api/flashcard-decks") {
        expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
        return new Response(
          JSON.stringify({
            decks: [
              {
                deckID: "01JLOCKEDDECKABCDEFGHJKLMN1",
                kind: "flashcard-deck.v1",
                title: "Locked Review Deck",
                noteCount: 1,
                cardCount: 2,
                dueCounts: {
                  new: 2,
                  learning: 0,
                  review: 0,
                },
                reviewAvailable: false,
                createdAt: "2026-04-19T10:00:00.000Z",
                createdBy: {
                  sessionID: "child-session",
                  messageID: "msg-1",
                  callID: "call-1",
                  subagent: "flashcard-author",
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

      if (requestUrl.pathname === "/api/flashcard-decks/01JLOCKEDDECKABCDEFGHJKLMN1") {
        expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
        return new Response(
          JSON.stringify({
            deckID: "01JLOCKEDDECKABCDEFGHJKLMN1",
            kind: "flashcard-deck.v1",
            title: "Locked Review Deck",
            config: {
              newPerDay: 0,
              reviewsPerDay: 200,
              learnSteps: [1, 10],
              relearnSteps: [10],
              graduatingIntervalGood: 1,
              graduatingIntervalEasy: 4,
              initialEaseFactor: 2500,
              hardMultiplier: 1.2,
              easyMultiplier: 1.3,
              lapseMultiplier: 0,
              maxInterval: 36500,
              leechThreshold: 8,
            },
            notes: [
              {
                noteID: "01JLOCKEDNOTEABCDEFGHJKLMN1",
                deckID: "01JLOCKEDDECKABCDEFGHJKLMN1",
                type: "basic",
                fields: {
                  front: "Prompt",
                  back: "Answer",
                },
                tags: [],
              },
            ],
            cards: [
              {
                cardID: "01JLOCKEDCARDABCDEFGHJKLMN1",
                noteID: "01JLOCKEDNOTEABCDEFGHJKLMN1",
                templateIdx: 0,
                state: "new",
                due: 0,
                interval: 0,
                easeFactor: 2500,
                reps: 0,
                lapses: 0,
                remainingSteps: 0,
              },
            ],
            source: "Testing",
            createdAt: "2026-04-19T10:00:00.000Z",
            createdBy: {
              sessionID: "child-session",
              messageID: "msg-1",
              callID: "call-1",
              subagent: "flashcard-author",
            },
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

    seedDirectoryChatState("/repo", {
      sessions: [
        {
          id: "child-session",
          title: "Create flashcards (@flashcard-author subagent)",
          parentID: "root-session",
          time: {
            created: Date.now() - 60_000,
            updated: Date.now() - 60_000,
          },
        },
      ],
      isReady: true,
    })

    const props: ToolPartProps = {
      part: {
        id: "part-availability",
        sessionID: "root-session",
        messageID: "message-availability",
        type: "tool",
      },
      state: {
        status: "completed",
        input: {
          description: "Create flashcards",
          subagent_type: "flashcard-author",
        },
        metadata: {
          sessionId: "child-session",
        },
        output: [
          "task_id: child-session",
          "",
          "<task_result>",
          "Created a flashcard deck with no review slot left today.",
          "</task_result>",
        ].join("\n"),
        attachments: [],
      },
      info: {
        title: "Task",
      },
      tool: "task",
      directory: "/repo",
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>{renderTaskTool(props)}</TooltipProvider>
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    await flushEffects()
    await flushEffects()

    expect(container.textContent).toContain("Locked Review Deck")
    expect(container.textContent).not.toContain("Start Review")
  })

  test("projects question sets created by the child question-set-author session and opens the selected set in the right sidebar", async () => {
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
                artifactID: "01JQUESTIONSETABCDEFGHJKLMN1",
                kind: "question-set.v1",
                groupType: "quiz",
                title: "Intro Algebra Check",
                createdAt: "2026-04-19T10:00:00.000Z",
                createdBy: {
                  sessionID: "question-child-session",
                  messageID: "msg-1",
                  callID: "call-1",
                  subagent: "question-set-author",
                },
                questions: [
                  {
                    id: "q1",
                    type: "mcq",
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

    seedDirectoryChatState("/repo", {
      sessions: [
        {
          id: "question-child-session",
          title: "Create quiz (@question-set-author subagent)",
          parentID: "root-session",
          time: {
            created: Date.now() - 60_000,
            updated: Date.now() - 60_000,
          },
        },
      ],
      isReady: true,
    })

    const props: ToolPartProps = {
      part: {
        id: "part-2",
        sessionID: "root-session",
        messageID: "message-2",
        type: "tool",
      },
      state: {
        status: "completed",
        input: {
          description: "Create quiz",
          subagent_type: "question-set-author",
        },
        metadata: {
          sessionId: "question-child-session",
        },
        output: [
          "task_id: question-child-session",
          "",
          "<task_result>",
          "Created a question set about introductory algebra.",
          "</task_result>",
        ].join("\n"),
        attachments: [],
      },
      info: {
        title: "Task",
      },
      tool: "task",
      directory: "/repo",
    }

    await act(async () => {
      root.render(<TooltipProvider>{renderTaskTool(props)}</TooltipProvider>)
      await flushEffects()
    })

    await flushEffects()
    await flushEffects()

    expect(container.textContent).toContain("Intro Algebra Check")
    expect(container.textContent).toContain("quiz")
    expect(container.textContent).toContain("1 question")
    expect(container.textContent).toContain("Open Question Set")

    const openButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Open Question Set",
    )
    expect(openButton).toBeDefined()

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flushEffects()
    })

    expect(useUiPreferences.getState().rightSidebarOpen).toBe(true)
    expect(useUiPreferences.getState().rightSidebarTab).toBe("question-set")
    expect(
      useWorkspaceQuestionSetPanelStore.getState().selectedArtifactIDByDirectory["/repo"],
    ).toBe("01JQUESTIONSETABCDEFGHJKLMN1")
  })
})
