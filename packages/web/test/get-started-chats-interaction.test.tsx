import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { GetStartedChats } from "../src/components/layout/chat-left-sidebar/get-started-chats"
import { createGetStartedChatDraft } from "../src/lib/get-started-chat-draft"
import { getStartedChatsForPrimaryUse } from "../src/lib/get-started-chats"
import { createTextPromptDraft, type PromptDraftState } from "../src/state/prompt-store"

describe("get-started chat interactions", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("sidebar suggestions synchronously lock out duplicate activations", async () => {
    const chat = getStartedChatsForPrimaryUse("learn")[0]
    if (!chat) throw new Error("Expected a learner get-started chat")

    let activationCount = 0
    let finishActivation: (() => void) | undefined
    const activation = new Promise<void>((resolve) => {
      finishActivation = resolve
    })

    await act(async () => {
      root.render(
        <GetStartedChats
          chats={[chat]}
          onStage={() => {
            activationCount += 1
            return activation
          }}
          onDismiss={() => {}}
        />,
      )
    })

    const surface = container.querySelector<HTMLElement>(
      '[data-component="get-started-chats"][data-variant="sidebar"]',
    )
    const suggestion = container.querySelector<HTMLButtonElement>(
      '[data-action="get-started-chat"]',
    )
    expect(surface?.classList.contains("composer-surface")).toBe(true)
    expect(surface?.classList.contains("composer-grain")).toBe(true)
    expect(surface?.classList.contains("border")).toBe(false)
    expect(suggestion).not.toBeNull()

    act(() => {
      suggestion?.click()
      suggestion?.click()
    })

    expect(activationCount).toBe(1)
    expect(suggestion?.disabled).toBe(true)

    await act(async () => {
      finishActivation?.()
      await activation
    })

    expect(suggestion?.disabled).toBe(false)
  })

  test("empty-board suggestions start the selected chat immediately", async () => {
    const chat = getStartedChatsForPrimaryUse("learn")[0]
    if (!chat) throw new Error("Expected a learner get-started chat")

    let startedChatID: string | undefined
    await act(async () => {
      root.render(
        <GetStartedChats
          variant="board"
          chats={[chat]}
          onStart={(selectedChat) => {
            startedChatID = selectedChat.id
          }}
          onDismiss={() => {}}
        />,
      )
    })

    const suggestion = container.querySelector<HTMLButtonElement>(
      '[data-action="get-started-chat"]',
    )
    expect(suggestion).not.toBeNull()

    await act(async () => {
      suggestion?.click()
    })

    expect(startedChatID).toBe(chat.id)
  })

  test("staging replaces prompt text without submitting anything", () => {
    const chat = getStartedChatsForPrimaryUse("learn")[0]
    if (!chat) throw new Error("Expected a learner get-started chat")

    const currentDraft: PromptDraftState = {
      ...createTextPromptDraft("Existing draft"),
      updatedAt: 1,
    }

    const stagedDraft = createGetStartedChatDraft(chat, currentDraft)

    expect(stagedDraft.value).toBe(chat.prompt)
    expect(stagedDraft.cursor).toBe(chat.prompt.length)
    expect(stagedDraft.attachments).toBe(currentDraft.attachments)
  })
})
