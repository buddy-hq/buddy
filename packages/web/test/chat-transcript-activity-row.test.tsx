import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import { useChatSettings } from "../src/state/chat-settings"
import { useChatStore } from "../src/state/chat-store"
import type { MessagePart } from "../src/state/chat-types"
import {
  applyTranscriptPartDelta,
  applyTranscriptPartUpdated,
} from "../src/state/transcript-repository"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
  seedDirectoryChatState,
} from "./test-utils"
import {
  createChatTranscriptTestViewport,
  type ChatTranscriptTestViewport,
} from "./chat-transcript-harness"
import { inlinePresentation, presentationMetadata } from "./tool-presentation-fixtures"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function assistantArticleByText(container: HTMLElement, text: string) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-timeline-row="AssistantPart"]'),
  ).find((element) => element.textContent?.includes(text))
}

function activityArticleByText(container: HTMLElement, text: string) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-timeline-row="Activity"]'),
  ).find((element) => element.textContent?.includes(text))
}

describe("chat transcript ActivityRow", () => {
  let container: HTMLDivElement
  let root: Root
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined
  let transcriptViewport: ChatTranscriptTestViewport

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
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
    useChatSettings.setState({ showReasoningSummaries: true })
    transcriptViewport.cleanup()
    container.remove()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("shows inline thinking when an active session has no visible assistant events yet", async () => {
    await act(async () => {
      seedDirectoryChatState("/repo", {
        sessionID: "ses_busy",
        isBusy: true,
        sessionStatusByID: {
          ses_busy: { type: "busy" },
        },
        messages: [],
      })
      root.render(<ChatTranscript directory="/repo" scrollViewportRef={transcriptViewport.ref} />)
      await flushEffects()
    })

    expect(container.querySelector("[data-activity-row]")).not.toBeNull()
  })

  test("keeps immediate thinking on a normal optimistic send", async () => {
    await act(async () => {
      seedDirectoryChatState("/repo", {
        sessionID: "ses_busy",
        isBusy: false,
        sessionStatusByID: {
          ses_busy: { type: "idle" },
        },
        messages: [
          createMessageWithParts(
            createUserMessageInfo({
              id: "msg_user_optimistic",
              sessionID: "ses_busy",
            }),
            [
              {
                id: "prt_user_optimistic",
                sessionID: "ses_busy",
                messageID: "msg_user_optimistic",
                type: "text",
                text: "Normal prompt",
                optimistic: true,
              },
            ],
          ),
        ],
      })
      root.render(<ChatTranscript directory="/repo" scrollViewportRef={transcriptViewport.ref} />)
      await flushEffects()
    })

    const placeholders = container.querySelectorAll("[data-activity-row]")
    const articles = Array.from(container.querySelectorAll("article"))

    expect(placeholders).toHaveLength(1)
    expect(articles).toHaveLength(2)
    expect(articles[0]?.textContent).toContain("Normal prompt")
    expect(articles[1]?.textContent).toContain("Thinking")
    const virtualSlots = Array.from(container.querySelectorAll<HTMLElement>("[data-timeline-key]"))
    expect(virtualSlots.length).toBeGreaterThan(0)
    expect(virtualSlots.every((slot) => slot.style.overflow === "clip")).toBe(true)
    expect(virtualSlots.every((slot) => slot.querySelector(":scope > [data-index]"))).toBe(true)
  })

  test("keeps active thinking visible when reasoning summaries are disabled and text has started", async () => {
    await act(async () => {
      useChatSettings.setState({ showReasoningSummaries: false })
      seedDirectoryChatState("/repo-reasoning", {
        sessionID: "ses_reasoning",
        isBusy: true,
        sessionStatusByID: {
          ses_reasoning: { type: "busy" },
        },
        messages: [
          createMessageWithParts(
            createUserMessageInfo({
              id: "msg_001_user_reasoning",
              sessionID: "ses_reasoning",
            }),
            [
              {
                id: "prt_user_reasoning",
                sessionID: "ses_reasoning",
                messageID: "msg_001_user_reasoning",
                type: "text",
                text: "What do you mean?",
              },
            ],
          ),
          createMessageWithParts(
            createAssistantMessageInfo({
              id: "msg_002_assistant_reasoning",
              sessionID: "ses_reasoning",
              parentID: "msg_001_user_reasoning",
            }),
            [
              {
                id: "prt_assistant_reasoning",
                sessionID: "ses_reasoning",
                messageID: "msg_002_assistant_reasoning",
                type: "reasoning",
                text: "# Considering context\n\nThe model is thinking.",
                time: { start: 1 },
              },
              {
                id: "prt_assistant_text",
                sessionID: "ses_reasoning",
                messageID: "msg_002_assistant_reasoning",
                type: "text",
                text: "Partial response",
                time: { start: 2 },
              },
            ],
          ),
        ],
      })
      root.render(
        <ChatTranscript directory="/repo-reasoning" scrollViewportRef={transcriptViewport.ref} />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Partial response")
    expect(container.textContent).toContain("Considering context")
    expect(container.querySelector("[data-activity-row]")).not.toBeNull()
    expect(container.querySelectorAll('[data-timeline-row="AssistantPart"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-timeline-row="Activity"]')).toHaveLength(1)
  })

  test("replaces active thinking when an empty assistant text part receives its first delta", async () => {
    await act(async () => {
      seedDirectoryChatState("/repo-empty-text-delta", {
        sessionID: "ses_empty_text_delta",
        isBusy: true,
        sessionStatusByID: {
          ses_empty_text_delta: { type: "busy" },
        },
        messages: [
          createMessageWithParts(
            createUserMessageInfo({
              id: "msg_001_user_empty_delta",
              sessionID: "ses_empty_text_delta",
            }),
            [
              {
                id: "prt_user_empty_delta",
                sessionID: "ses_empty_text_delta",
                messageID: "msg_001_user_empty_delta",
                type: "text",
                text: "Stream a response",
              },
            ],
          ),
          createMessageWithParts(
            createAssistantMessageInfo({
              id: "msg_002_assistant_empty_delta",
              sessionID: "ses_empty_text_delta",
              parentID: "msg_001_user_empty_delta",
            }),
            [
              {
                id: "prt_assistant_empty_delta",
                sessionID: "ses_empty_text_delta",
                messageID: "msg_002_assistant_empty_delta",
                type: "text",
                text: "",
                time: { start: 1 },
              },
            ],
          ),
        ],
      })
      root.render(
        <ChatTranscript
          directory="/repo-empty-text-delta"
          scrollViewportRef={transcriptViewport.ref}
        />,
      )
      await flushEffects()
    })

    expect(container.querySelector("[data-activity-row]")).not.toBeNull()
    expect(assistantArticleByText(container, "First streamed token")).toBeUndefined()

    await act(async () => {
      applyTranscriptPartDelta("/repo-empty-text-delta", {
        sessionID: "ses_empty_text_delta",
        messageID: "msg_002_assistant_empty_delta",
        partID: "prt_assistant_empty_delta",
        field: "text",
        delta: "First streamed token",
      })
      await flushEffects()
    })

    expect(assistantArticleByText(container, "First streamed token")).not.toBeUndefined()
    expect(container.querySelector("[data-activity-row]")).toBeNull()
  })

  test("renders completed reasoning summary as an expandable row when summaries are enabled", async () => {
    await act(async () => {
      useChatSettings.setState({ showReasoningSummaries: true })
      seedDirectoryChatState("/repo-completed-reasoning", {
        sessionID: "ses_completed_reasoning",
        isBusy: false,
        sessionStatusByID: {
          ses_completed_reasoning: { type: "idle" },
        },
        messages: [
          createMessageWithParts(
            createUserMessageInfo({
              id: "msg_001_user_completed_reasoning",
              sessionID: "ses_completed_reasoning",
            }),
            [
              {
                id: "prt_user_completed_reasoning",
                sessionID: "ses_completed_reasoning",
                messageID: "msg_001_user_completed_reasoning",
                type: "text",
                text: "hey whats up",
              },
            ],
          ),
          createMessageWithParts(
            createAssistantMessageInfo({
              id: "msg_002_assistant_completed_reasoning",
              sessionID: "ses_completed_reasoning",
              parentID: "msg_001_user_completed_reasoning",
              finish: "stop",
            }),
            [
              {
                id: "prt_assistant_completed_reasoning",
                sessionID: "ses_completed_reasoning",
                messageID: "msg_002_assistant_completed_reasoning",
                type: "reasoning",
                text: "The model thought about the greeting.",
              },
              {
                id: "prt_assistant_completed_text",
                sessionID: "ses_completed_reasoning",
                messageID: "msg_002_assistant_completed_reasoning",
                type: "text",
                text: "Final response",
              },
            ],
          ),
        ],
      })
      root.render(
        <ChatTranscript
          directory="/repo-completed-reasoning"
          scrollViewportRef={transcriptViewport.ref}
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Thought")
    expect(container.textContent).toContain("Final response")
    expect(container.querySelector('[data-timeline-row="AssistantPart"]')).not.toBeNull()
  })

  test("keeps collapsed thought row spacing measured and head-equivalent", async () => {
    await act(async () => {
      useChatSettings.setState({ showReasoningSummaries: true })
      seedDirectoryChatState("/repo-completed-reasoning-spacing", {
        sessionID: "ses_completed_reasoning_spacing",
        isBusy: false,
        sessionStatusByID: {
          ses_completed_reasoning_spacing: { type: "idle" },
        },
        messages: [
          createMessageWithParts(
            createUserMessageInfo({
              id: "msg_001_user_completed_reasoning_spacing",
              sessionID: "ses_completed_reasoning_spacing",
            }),
            [
              {
                id: "prt_user_completed_reasoning_spacing",
                sessionID: "ses_completed_reasoning_spacing",
                messageID: "msg_001_user_completed_reasoning_spacing",
                type: "text",
                text: "hi",
              },
            ],
          ),
          createMessageWithParts(
            createAssistantMessageInfo({
              id: "msg_002_assistant_completed_reasoning_spacing",
              sessionID: "ses_completed_reasoning_spacing",
              parentID: "msg_001_user_completed_reasoning_spacing",
              finish: "stop",
            }),
            [
              {
                id: "prt_assistant_completed_reasoning_spacing",
                sessionID: "ses_completed_reasoning_spacing",
                messageID: "msg_002_assistant_completed_reasoning_spacing",
                type: "reasoning",
                text: "The model thought about the greeting.",
                time: { start: 1, end: 3_001 },
              },
              {
                id: "prt_assistant_completed_text_spacing",
                sessionID: "ses_completed_reasoning_spacing",
                messageID: "msg_002_assistant_completed_reasoning_spacing",
                type: "text",
                text: "Final response",
              },
            ],
          ),
        ],
      })
      root.render(
        <ChatTranscript
          directory="/repo-completed-reasoning-spacing"
          scrollViewportRef={transcriptViewport.ref}
        />,
      )
      await flushEffects()
    })

    const thoughtArticle = activityArticleByText(container, "Thought")
    const textArticle = assistantArticleByText(container, "Final response")
    const thoughtMeasuredRow = thoughtArticle?.closest<HTMLElement>("[data-index]")
    const thoughtContent = thoughtArticle?.querySelector<HTMLElement>(":scope > div")
    const textContent = textArticle?.querySelector<HTMLElement>(":scope > div")

    expect(thoughtArticle).not.toBeUndefined()
    expect(textArticle).not.toBeUndefined()
    expect(thoughtMeasuredRow?.className).toContain("flow-root")
    expect(thoughtContent?.className).toContain("pt-5")
    expect(textContent?.className).toContain("pt-3")
    expect(thoughtContent?.className).not.toContain("mt-5")
    expect(textContent?.className).not.toContain("mt-5")
    expect(thoughtContent?.className).not.toContain("pb-2")
    expect(textContent?.className).not.toContain("pb-2")
  })

  test("renders completed reasoning summary as an expandable row when summaries are disabled", async () => {
    await act(async () => {
      useChatSettings.setState({ showReasoningSummaries: false })
      seedDirectoryChatState("/repo-completed-reasoning-disabled", {
        sessionID: "ses_completed_reasoning_disabled",
        isBusy: false,
        sessionStatusByID: {
          ses_completed_reasoning_disabled: { type: "idle" },
        },
        messages: [
          createMessageWithParts(
            createUserMessageInfo({
              id: "msg_001_user_completed_reasoning_disabled",
              sessionID: "ses_completed_reasoning_disabled",
            }),
            [
              {
                id: "prt_user_completed_reasoning_disabled",
                sessionID: "ses_completed_reasoning_disabled",
                messageID: "msg_001_user_completed_reasoning_disabled",
                type: "text",
                text: "hey whats up",
              },
            ],
          ),
          createMessageWithParts(
            createAssistantMessageInfo({
              id: "msg_002_assistant_completed_reasoning_disabled",
              sessionID: "ses_completed_reasoning_disabled",
              parentID: "msg_001_user_completed_reasoning_disabled",
              finish: "stop",
            }),
            [
              {
                id: "prt_assistant_completed_reasoning_disabled",
                sessionID: "ses_completed_reasoning_disabled",
                messageID: "msg_002_assistant_completed_reasoning_disabled",
                type: "reasoning",
                text: "The model thought about the greeting.",
              },
              {
                id: "prt_assistant_completed_text_disabled",
                sessionID: "ses_completed_reasoning_disabled",
                messageID: "msg_002_assistant_completed_reasoning_disabled",
                type: "text",
                text: "Final response",
              },
            ],
          ),
        ],
      })
      root.render(
        <ChatTranscript
          directory="/repo-completed-reasoning-disabled"
          scrollViewportRef={transcriptViewport.ref}
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Thought")
    expect(container.textContent).toContain("Final response")
    expect(container.querySelector("[data-activity-row]")).not.toBeNull()
    expect(container.querySelector('[data-timeline-row="Activity"]')).not.toBeNull()
  })

  test("reprojects a live inline tool into activity when its streamed phase fails", async () => {
    const runningPart: MessagePart = {
      id: "prt_live_tool",
      sessionID: "ses_live_tool",
      messageID: "msg_live_tool",
      type: "tool",
      tool: "imagegen",
      callID: "call_live_tool",
      metadata: presentationMetadata(
        inlinePresentation({
          phase: "running",
          action: "Generating image",
          icon: "image",
          renderer: "generic",
          layoutRole: "media-output",
        }),
      ),
      state: {
        status: "running",
        input: {},
        time: { start: 1 },
      },
    }

    await act(async () => {
      seedDirectoryChatState("/repo-live-tool", {
        sessionID: "ses_live_tool",
        isBusy: true,
        sessionStatusByID: {
          ses_live_tool: { type: "busy" },
        },
        messages: [
          createMessageWithParts(
            createAssistantMessageInfo({
              id: "msg_live_tool",
              sessionID: "ses_live_tool",
            }),
            [runningPart],
          ),
        ],
      })
      root.render(
        <ChatTranscript
          directory="/repo-live-tool"
          scrollViewportRef={transcriptViewport.ref}
        />,
      )
      await flushEffects()
    })

    expect(assistantArticleByText(container, "Generating image")).not.toBeUndefined()
    expect(container.querySelector('[data-timeline-row="Activity"]')).toBeNull()

    await act(async () => {
      applyTranscriptPartUpdated("/repo-live-tool", {
        ...runningPart,
        metadata: presentationMetadata(
          inlinePresentation({
            phase: "error",
            action: "Failed to generate image",
            icon: "image",
            renderer: "generic",
            layoutRole: "media-output",
            outcome: { type: "failure" },
          }),
        ),
        state: {
          status: "error",
          input: {},
          error: "generation failed",
          time: { start: 1, end: 2 },
        },
      })
      await flushEffects()
    })

    expect(container.querySelector('[data-timeline-row="Activity"]')).not.toBeNull()
    expect(assistantArticleByText(container, "Failed to generate image")).toBeUndefined()
  })

  test("reprojects a running tool when its streamed presentation snapshot arrives late", async () => {
    const partWithoutPresentation: MessagePart = {
      id: "prt_late_presentation",
      sessionID: "ses_late_presentation",
      messageID: "msg_late_presentation",
      type: "tool",
      tool: "imagegen",
      callID: "call_late_presentation",
      state: {
        status: "running",
        input: {},
        time: { start: 1 },
      },
    }

    await act(async () => {
      seedDirectoryChatState("/repo-late-presentation", {
        sessionID: "ses_late_presentation",
        isBusy: true,
        sessionStatusByID: {
          ses_late_presentation: { type: "busy" },
        },
        messages: [
          createMessageWithParts(
            createAssistantMessageInfo({
              id: "msg_late_presentation",
              sessionID: "ses_late_presentation",
            }),
            [partWithoutPresentation],
          ),
        ],
      })
      root.render(
        <ChatTranscript
          directory="/repo-late-presentation"
          scrollViewportRef={transcriptViewport.ref}
        />,
      )
      await flushEffects()
    })

    expect(assistantArticleByText(container, "Generating image")).toBeUndefined()

    await act(async () => {
      applyTranscriptPartUpdated("/repo-late-presentation", {
        ...partWithoutPresentation,
        metadata: presentationMetadata(
          inlinePresentation({
            phase: "running",
            action: "Generating image",
            icon: "image",
            renderer: "generic",
            layoutRole: "media-output",
          }),
        ),
      })
      await flushEffects()
    })

    expect(assistantArticleByText(container, "Generating image")).not.toBeUndefined()
  })
})
