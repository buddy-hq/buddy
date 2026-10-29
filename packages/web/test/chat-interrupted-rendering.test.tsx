import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import type { Root } from "react-dom/client"
import type { TranscriptEvent } from "@buddy/transcript-contract/event"
import { createQueryTestRoot } from "./query-test-root"
import { AssistantTextPart } from "../src/components/chat/parts/assistant-part/text-part"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import type { ChatTextPart } from "../src/components/chat/utils/part-guards"
import type { MessageWithParts } from "../src/state/chat-types"
import { MARKDOWN_MATH_PLACEHOLDER_COMPONENT } from "../src/components/markdown/markdown-math-placeholder"
import { useChatStore } from "../src/state/chat-store"
import { useChatSync } from "../src/lib/directory-chat/use-chat-sync"
import { createBrowserPlatform, PlatformProvider } from "../src/context/platform"
import { getServerConnection, setRuntimeServerConnection } from "../src/context/server"
import {
  applyTranscriptMessageUpdated,
  applyTranscriptMessageRemoved,
  applyTranscriptPartUpdated,
  applyTranscriptPartRemoved,
  applyTranscriptPartDelta,
  resetTranscriptRepositoryForTests,
} from "../src/state/transcript-repository"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
  installTestFetch,
  restoreTestFetch,
  seedDirectoryChatState,
} from "./test-utils"
import {
  createChatTranscriptTestViewport,
  type ChatTranscriptTestViewport,
} from "./chat-transcript-harness"

const directory = "/repo"
const sessionID = "ses_interrupted"
const assistantMessageID = "msg_assistant_interrupted"
const assistantPartID = "prt_assistant_interrupted"

function noop() {}

function interruptedMessages(id: string) {
  return [1, 2].flatMap((turn) => interruptedTurn(id, turn))
}

function interruptedTurn(id: string, turn: number): MessageWithParts[] {
  return [
    createMessageWithParts(
      createUserMessageInfo({
        id: `msg_${id}_user_${turn}`,
        sessionID: id,
        time: { created: turn * 2 },
      }),
      [],
    ),
    createMessageWithParts(
      createAssistantMessageInfo({
        id: `msg_${id}_assistant_${turn}`,
        sessionID: id,
        parentID: `msg_${id}_user_${turn}`,
        time: { created: turn * 2 + 1, completed: turn * 2 + 2 },
        finish: "interrupted",
      }),
      [],
    ),
  ]
}

function ChatSyncHarness() {
  useChatSync({
    ...useChatStore.getState(),
    decodedDirectory: directory,
    hasRegisteredProject: true,
    applyMessageUpdated: applyTranscriptMessageUpdated,
    applyMessageRemoved: applyTranscriptMessageRemoved,
    applyPartUpdated: applyTranscriptPartUpdated,
    applyPartRemoved: applyTranscriptPartRemoved,
    applyPartDelta: applyTranscriptPartDelta,
    refreshSlashCommands: noop,
    refreshMcpStatus: noop,
  })
  return null
}

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
  await Promise.resolve()
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (condition()) return
    await act(async () => {
      await flushEffects(20)
    })
  }

  throw new Error("Timed out waiting for condition")
}

function interruptedTextPart(text: string): ChatTextPart {
  const part: ChatTextPart = {
    id: assistantPartID,
    sessionID,
    messageID: assistantMessageID,
    type: "text",
    text,
  }
  return part
}

describe("interrupted chat rendering", () => {
  let container: HTMLDivElement
  let root: Root
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined
  let transcriptViewport: ChatTranscriptTestViewport

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createQueryTestRoot(container)
    transcriptViewport = createChatTranscriptTestViewport()

    originalResizeObserver = globalThis.ResizeObserver
    class MockResizeObserver implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    useChatStore.setState({ directories: {} })
    resetTranscriptRepositoryForTests()
    transcriptViewport.cleanup()
    container.remove()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  test("treats interrupted assistant finishes as tolerant markdown", async () => {
    const incompleteMathText = [
      "(15) Neyman-Pearson lemma:",
      "",
      String.raw`$$ \frac{L(\theta_0 \mid x)}{L(\theta_1 \mid x)} ${"\\"}`,
    ].join("\n")

    await act(async () => {
      seedDirectoryChatState(directory, {
        sessionID,
        isReady: true,
        isBusy: false,
        sessionStatusByID: {
          [sessionID]: { type: "idle" },
        },
        messages: [
          createMessageWithParts(
            createAssistantMessageInfo({
              id: assistantMessageID,
              sessionID,
              time: {
                created: 1,
                completed: 2,
              },
              finish: "interrupted",
            }),
            [interruptedTextPart(incompleteMathText)],
          ),
        ],
      })
      root.render(
        <ChatTranscript directory={directory} scrollViewportRef={transcriptViewport.ref} />,
      )
      await flushEffects()
    })

    await waitFor(() => {
      return (
        container.querySelector(`[data-component="${MARKDOWN_MATH_PLACEHOLDER_COMPONENT}"]`) !==
        null
      )
    })

    expect(container.textContent).toContain("Neyman-Pearson lemma")
    expect(container.textContent).toContain("Stopped")
    expect(container.textContent).not.toContain("\\frac")
  })

  test.each([
    "missed start",
    "undo and redo",
    "retry notification",
    "live start",
    "no assistant",
    "replacement",
    "specialist notice",
  ] as const)("keeps an inactivity stop on its original turn: %s", async (scenario) => {
    const otherSessionID = "ses_other_interrupted"
    const originalFetch = globalThis.fetch
    const connection = getServerConnection()
    const sessions = [sessionID, otherSessionID].map((id) => ({
      id,
      title: id,
      directory,
      time: { created: 1, updated: 1 },
    }))
    const messagesBySessionID = {
      [sessionID]: interruptedMessages(sessionID).filter(
        (message) => scenario !== "no assistant" || message.info.role === "user",
      ),
      [otherSessionID]: interruptedMessages(otherSessionID),
    }
    const stream = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>()
    const notifications: (string | undefined)[] = []
    const transport = installTestFetch(async (input) => {
      const request = input instanceof Request ? input : new Request(input)
      const pathname = new URL(request.url).pathname
      if (pathname === "/api/event") {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              stream.resolve(controller)
              request.signal.addEventListener("abort", () => controller.close(), { once: true })
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        )
      }
      if (pathname === "/api/session") return Response.json(sessions)
      const session = sessions.find((item) => pathname.includes(item.id))
      if (pathname.endsWith("/message")) {
        return Response.json(
          session?.id === otherSessionID
            ? messagesBySessionID[otherSessionID]
            : messagesBySessionID[sessionID],
        )
      }
      if (session) return Response.json(session)
      if (pathname === "/api/session/status") return Response.json({})
      if (pathname === "/api/provider") return Response.json({ providers: [], default: {} })
      if (pathname === "/api/config" || pathname === "/api/mcp") return Response.json({})
      return Response.json([])
    })
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    try {
      seedDirectoryChatState(directory, {
        sessionID,
        sessions,
        isReady: true,
        messagesBySessionID,
      })
      await act(async () => {
        root.render(
          <PlatformProvider
            value={{
              ...createBrowserPlatform(),
              fetch: transport,
              async notify(_title, body) {
                notifications.push(body)
              },
            }}
          >
            <ChatSyncHarness />
            <section data-session="stopped">
              <ChatTranscript
                directory={directory}
                sessionID={sessionID}
                scrollViewportRef={transcriptViewport.ref}
              />
            </section>
            <section data-session="other">
              <ChatTranscript
                directory={directory}
                sessionID={otherSessionID}
                scrollViewportRef={transcriptViewport.ref}
              />
            </section>
          </PlatformProvider>,
        )
        await flushEffects()
      })
      const controller = await stream.promise
      const send = (...payloads: TranscriptEvent[]) => {
        controller.enqueue(
          new TextEncoder().encode(
            payloads
              .map((payload) => `data: ${JSON.stringify({ directory, payload })}\n\n`)
              .join(""),
          ),
        )
      }
      const dividers = (selector = '[data-session="stopped"]') =>
        Array.from(
          container.querySelectorAll(`${selector} [data-timeline-row="TurnDivider"]`),
          (element) => element.textContent,
        )
      await waitFor(
        () =>
          dividers().length === (scenario === "no assistant" ? 0 : 2) &&
          dividers('[data-session="other"]').length === 2,
      )
      await act(async () => {
        send({ type: "session.status", properties: { sessionID, status: { type: "busy" } } })
      })
      await waitFor(() => useChatStore.getState().directories[directory]?.isBusy === true)
      if (scenario === "specialist notice") {
        await act(async () => {
          applyTranscriptMessageUpdated(
            directory,
            createAssistantMessageInfo({
              id: "msg_latest_notice",
              sessionID,
              kind: "synthetic",
              finish: "stop",
              time: { created: 7, completed: 7 },
            }),
          )
          applyTranscriptPartUpdated(directory, {
            id: "prt_latest_notice",
            sessionID,
            messageID: "msg_latest_notice",
            type: "notice",
            text: "The specialist finished.",
            source: "subagent",
            status: "completed",
          })
        })
      }
      await act(async () => {
        send(
          { type: "session.stopped", properties: { sessionID, reason: "inactivity" } },
          { type: "session.status", properties: { sessionID, status: { type: "idle" } } },
        )
      })
      const explanation = "Stopped after an hour with no activity. Send a message to carry on."
      await waitFor(() => notifications.length > 0)
      expect(notifications).toEqual(["Stopped after an hour with no activity."])
      if (scenario === "no assistant") {
        await act(async () => {
          for (const message of interruptedMessages(sessionID))
            applyTranscriptMessageUpdated(directory, message.info)
        })
        await waitFor(() => dividers().length === 2)
        expect(dividers()).toEqual(["Stopped", "Stopped"])
        return
      }
      await waitFor(() => container.textContent?.includes(explanation) === true)
      expect(dividers()).toEqual(["Stopped", explanation])
      expect(dividers('[data-session="other"]')).toEqual(["Stopped", "Stopped"])
      if (scenario === "specialist notice") return

      if (scenario === "undo and redo") {
        const session = sessions[0]
        if (!session) throw new Error("Missing session fixture")
        await act(async () => {
          useChatStore.getState().applySessionUpdated(directory, {
            ...session,
            revert: { messageID: `msg_${sessionID}_user_2` },
          })
        })
        await waitFor(() => dividers().length === 1)
        expect(dividers()).toEqual(["Stopped"])
        await act(async () => {
          useChatStore.getState().applySessionUpdated(directory, session)
        })
        await waitFor(() => dividers().length === 2)
        expect(dividers()).toEqual(["Stopped", explanation])
        return
      }

      if (scenario === "live start") {
        await act(async () => {
          send({ type: "session.status", properties: { sessionID, status: { type: "busy" } } })
        })
        await waitFor(() => useChatStore.getState().directories[directory]?.isBusy === true)
        expect(dividers()).toEqual(["Stopped", explanation])
        return
      }

      const successor = interruptedTurn(sessionID, 3)
      const reply = successor.find((message) => message.info.role === "assistant")
      if (!reply || reply.info.role !== "assistant") throw new Error("Missing assistant fixture")
      const replyInfo = reply.info
      await act(async () => {
        useChatStore.getState().applySessionStatus(directory, sessionID, { type: "busy" })
        for (const message of successor) {
          applyTranscriptMessageUpdated(
            directory,
            message.info.role === "assistant"
              ? { ...replyInfo, time: { created: replyInfo.time.created }, finish: undefined }
              : message.info,
          )
        }
        useChatStore.getState().applySessionStatus(directory, sessionID, { type: "busy" })
      })
      if (scenario === "retry notification") {
        await act(async () => {
          send({
            type: "session.status",
            properties: {
              sessionID,
              status: { type: "retry", attempt: 1, message: "Retrying", next: 0 },
            },
          })
        })
        await waitFor(
          () =>
            useChatStore.getState().directories[directory]?.sessionStatusByID[sessionID]?.type ===
            "retry",
        )
      }
      await act(async () => {
        applyTranscriptMessageUpdated(directory, replyInfo)
        applyTranscriptPartUpdated(directory, {
          id: "prt_successor",
          sessionID,
          messageID: replyInfo.id,
          type: "text",
          text: "Ordinary response preview.",
        })
        if (scenario === "replacement") {
          send({ type: "session.stopped", properties: { sessionID, reason: "inactivity" } })
        }
        send({ type: "session.status", properties: { sessionID, status: { type: "idle" } } })
      })
      await waitFor(
        () =>
          useChatStore.getState().directories[directory]?.isBusy === false &&
          dividers().length === 3,
      )
      if (scenario === "replacement") {
        expect(dividers()).toEqual(["Stopped", "Stopped", explanation])
      } else if (scenario === "retry notification") {
        await waitFor(() => notifications.length === 2)
        expect(notifications).toEqual([
          "Stopped after an hour with no activity.",
          "Ordinary response preview.",
        ])
      } else {
        expect(dividers()).toEqual(["Stopped", explanation, "Stopped"])
      }
    } finally {
      await act(async () => {
        root.render(null)
      })
      restoreTestFetch(originalFetch)
      setRuntimeServerConnection(connection)
    }
  })

  test("renders latest text immediately when a live turn is interrupted", async () => {
    const firstText = "Short prefix."
    const finalText = `${firstText} ${"This response arrived in a large buffered chunk. ".repeat(30)}Final tail.`

    await act(async () => {
      root.render(
        <AssistantTextPart
          part={interruptedTextPart(firstText)}
          ownsActions={false}
          actionsEnabled={false}
          streaming
        />,
      )
      await flushEffects()
    })
    await waitFor(() => container.textContent?.includes(firstText) === true)

    await act(async () => {
      root.render(
        <AssistantTextPart
          part={interruptedTextPart(finalText)}
          ownsActions={false}
          actionsEnabled={false}
          streaming
        />,
      )
      await flushEffects(30)
    })

    expect(container.textContent).toContain("Final tail.")

    await act(async () => {
      root.render(
        <AssistantTextPart
          part={interruptedTextPart(finalText)}
          ownsActions={false}
          actionsEnabled={false}
          interrupted
          streaming
        />,
      )
      await flushEffects()
    })

    await waitFor(() => container.textContent?.includes("Final tail.") === true)
  })

  test("settles an ended text part while the surrounding turn is still busy", async () => {
    const firstText = "Short prefix."
    const finalText = `${firstText} ${"This response arrived before the task cards settled. ".repeat(30)}Final tail.`

    await act(async () => {
      seedDirectoryChatState(directory, {
        sessionID,
        isReady: true,
        isBusy: true,
        sessionStatusByID: {
          [sessionID]: { type: "busy" },
        },
        messages: [
          createMessageWithParts(
            createAssistantMessageInfo({
              id: assistantMessageID,
              sessionID,
              time: { created: 1 },
            }),
            [
              {
                ...interruptedTextPart(firstText),
                time: {
                  start: 1,
                },
              },
            ],
          ),
        ],
      })
      root.render(
        <ChatTranscript directory={directory} scrollViewportRef={transcriptViewport.ref} />,
      )
      await flushEffects()
    })

    await act(async () => {
      applyTranscriptPartUpdated(directory, {
        ...interruptedTextPart(finalText),
        time: {
          start: 1,
          end: 2,
        },
      })
      await flushEffects()
    })

    expect(container.textContent).toContain("Final tail.")
    expect(useChatStore.getState().directories[directory]?.isBusy).toBe(true)
  })
})
