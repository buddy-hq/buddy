import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { detectPlatform } from "@tanstack/react-hotkeys"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { PromptComposer } from "../src/components/prompt/prompt-composer"
import {
  PROMPT_PART_TYPE_TEXT,
  SELECTION_CONTEXT_PART_TYPE,
} from "../src/components/prompt/prompt-types"
import { quoteMessageIntoPromptDraft } from "../src/features/notes/quote-message-into-prompt-draft"
import {
  createTextPromptDraft,
  flushPromptStorePersistence,
  getPromptDraft,
  getPromptScopeKey,
  PROMPT_STORE_STORAGE_KEY,
  usePromptStore,
} from "../src/state/prompt-store"
import { useGameStore } from "../src/state/game-store"
import { createBrowserPlatform, setRuntimePlatform } from "../src/context/platform"
import {
  createTestQueryClient,
  seedSkillPresentations,
  TestQueryClientProvider,
} from "./query-test-utils"

const TEST_DIRECTORY = "/repo"
const DRAFT_TEXT = "Chlorophyll captures light energy."
const QUOTE_TEXT = "quoted passage"
const QUOTE_PART = {
  type: SELECTION_CONTEXT_PART_TYPE,
  source: "message" as const,
  text: QUOTE_TEXT,
  selectionKey: "message_message-1",
  quotedMessageID: "message-1",
}

function resetPromptStore() {
  setRuntimePlatform(createBrowserPlatform())
  usePromptStore.setState({
    draftsByKey: {},
    historyByDirectory: {},
    historyNavigationByKey: {},
  })
  flushPromptStorePersistence()
  localStorage.removeItem(PROMPT_STORE_STORAGE_KEY)
  useGameStore.setState({
    isGameVisible: false,
    isPaused: false,
    isMinimized: false,
  })
}

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function renderComposer(input: {
  onSubmit: () => void
  onDraftSmartNote?: (request: { focus?: string; signal?: AbortSignal }) => Promise<string>
  onSaveNote?: () => Promise<{ sessionID: string }>
  sessionID?: string
}) {
  return (
    <TestQueryClientProvider queryClient={queryClient}>
      <PromptComposer
        directory={TEST_DIRECTORY}
        isBusy={false}
        personaOptions={[{ name: "buddy", label: "Buddy" }]}
        mentionableAgents={[]}
        mentionableReferences={[]}
        slashCommands={[]}
        modelOptions={[{ key: "openai/gpt-5", label: "GPT-5", acceptsImages: true }]}
        selectedModelAcceptsImages
        selectedPersona="buddy"
        selectedModel="openai/gpt-5"
        thinkingOptions={[{ key: "default", label: "Default" }]}
        selectedThinking="default"
        selectorMode="native"
        onPersonaChange={() => undefined}
        onModelChange={() => undefined}
        onThinkingChange={() => undefined}
        sessionID={input.sessionID}
        onSubmit={input.onSubmit}
        onSaveNote={input.onSaveNote}
        onDraftSmartNote={input.onDraftSmartNote}
        onAbort={() => undefined}
        onNewSession={() => undefined}
        sessionContextUsage={<span data-testid="session-context" />}
      />
    </TestQueryClientProvider>
  )
}

let queryClient: ReturnType<typeof createTestQueryClient>
let container: HTMLDivElement
let root: Root

describe("smart note command", () => {
  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    resetPromptStore()
    queryClient = createTestQueryClient()
    seedSkillPresentations(queryClient, TEST_DIRECTORY)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    queryClient.clear()
    container.remove()
    resetPromptStore()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  test.each([" ", "\n", "\t"])(
    "drafts a note after %j without sending a chat turn",
    async (separator) => {
      const promptKey = getPromptScopeKey(TEST_DIRECTORY)
      usePromptStore
        .getState()
        .replaceDraft(promptKey, createTextPromptDraft(`/smart-note${separator}light reactions`))
      let submitted = false
      let focus: string | undefined
      let resolveDraft: ((text: string) => void) | undefined

      await act(async () => {
        root.render(
          renderComposer({
            onSubmit: () => {
              submitted = true
            },
            onSaveNote: () => Promise.resolve({ sessionID: "ses_note" }),
            onDraftSmartNote: (request) => {
              focus = request.focus
              return new Promise<string>((resolve) => {
                resolveDraft = resolve
              })
            },
          }),
        )
        await flushEffects()
      })

      await act(async () => {
        container
          .querySelector("#prompt-composer-form")
          ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        await flushEffects()
      })

      expect(submitted).toBe(false)
      expect(focus).toBe("light reactions")
      expect(
        container
          .querySelector<HTMLButtonElement>('[data-action="prompt-note-mode"]')
          ?.getAttribute("aria-pressed"),
      ).toBe("true")

      await act(async () => {
        resolveDraft?.(DRAFT_TEXT)
        await flushEffects()
      })

      expect(submitted).toBe(false)
      expect(container.querySelector('[data-component="prompt-editor"]')?.textContent?.trim()).toBe(
        DRAFT_TEXT,
      )
      expect(
        container
          .querySelector<HTMLButtonElement>('[data-action="prompt-note-mode"]')
          ?.getAttribute("aria-pressed"),
      ).toBe("true")
    },
  )

  test.each(["success", "empty", "failure"] as const)(
    "keeps a quote staged before a late %s result",
    async (outcome) => {
      const sessionID = "ses_note"
      const promptKey = getPromptScopeKey(TEST_DIRECTORY, sessionID)
      const command = "/smart-note light reactions"
      usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft(command))
      let resolveDraft: ((text: string) => void) | undefined
      let rejectDraft: ((error: Error) => void) | undefined
      let submitted = false

      await act(async () => {
        root.render(
          renderComposer({
            sessionID,
            onSubmit: () => {
              submitted = true
            },
            onSaveNote: () => Promise.resolve({ sessionID }),
            onDraftSmartNote: () =>
              new Promise<string>((resolve, reject) => {
                resolveDraft = resolve
                rejectDraft = reject
              }),
          }),
        )
        await flushEffects()
      })
      await act(async () => {
        container
          .querySelector("#prompt-composer-form")
          ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        await flushEffects()
      })

      expect(
        container
          .querySelector('[data-component="prompt-editor"]')
          ?.getAttribute("contenteditable"),
      ).toBe("false")
      expect(container.textContent).toContain("Drafting a note from this chat…")

      await act(async () => {
        quoteMessageIntoPromptDraft({
          directory: TEST_DIRECTORY,
          sessionID,
          messageID: "message-1",
          text: QUOTE_TEXT,
          replaceDraft: usePromptStore.getState().replaceDraft,
        })
        expect(getPromptDraft(usePromptStore.getState(), promptKey).parts).toContainEqual(
          QUOTE_PART,
        )
        if (outcome === "failure") rejectDraft?.(new Error("provider down"))
        else resolveDraft?.(outcome === "success" ? DRAFT_TEXT : "")
        await flushEffects()
      })

      const current = getPromptDraft(usePromptStore.getState(), promptKey)
      expect(current.parts).toContainEqual(QUOTE_PART)
      expect(current.parts).toContainEqual({
        type: PROMPT_PART_TYPE_TEXT,
        text: outcome === "success" ? DRAFT_TEXT : command,
      })
      expect(container.querySelector('[data-component="prompt-editor"]')?.textContent?.trim()).toBe(
        outcome === "success" ? DRAFT_TEXT : command,
      )
      expect(
        container
          .querySelector('[data-component="prompt-editor"]')
          ?.getAttribute("contenteditable"),
      ).toBe("true")
      expect(submitted).toBe(false)
    },
  )

  test("keeps Note Mode active when its toolbar and shortcut are used while drafting", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft("/smart-note"))
    let resolveDraft: ((text: string) => void) | undefined
    let submitted = false
    let saved = false

    await act(async () => {
      root.render(
        renderComposer({
          onSubmit: () => {
            submitted = true
          },
          onSaveNote: () => {
            saved = true
            return Promise.resolve({ sessionID: "ses_note" })
          },
          onDraftSmartNote: () =>
            new Promise<string>((resolve) => {
              resolveDraft = resolve
            }),
        }),
      )
      await flushEffects()
    })
    await act(async () => {
      container
        .querySelector("#prompt-composer-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="prompt-note-mode"]')?.click()
      await flushEffects()
    })
    expect(
      container.querySelector('[data-action="prompt-note-mode"]')?.getAttribute("aria-pressed"),
    ).toBe("true")
    await act(async () => {
      const mac = detectPlatform() === "mac"
      container.querySelector('[data-component="prompt-editor"]')?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          shiftKey: true,
          metaKey: mac,
          ctrlKey: !mac,
          bubbles: true,
          cancelable: true,
        }),
      )
      await flushEffects()
    })
    expect(
      container.querySelector('[data-action="prompt-note-mode"]')?.getAttribute("aria-pressed"),
    ).toBe("true")

    await act(async () => {
      resolveDraft?.(DRAFT_TEXT)
      await flushEffects()
    })
    await act(async () => {
      container
        .querySelector("#prompt-composer-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })
    expect(saved).toBe(true)
    expect(submitted).toBe(false)
  })

  test("locks submission, history, and automatic Note Mode exits until the draft is ready", async () => {
    const sessionID = "ses_note"
    const promptKey = getPromptScopeKey(TEST_DIRECTORY, sessionID)
    usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft("/smart-note"))
    usePromptStore
      .getState()
      .pushHistoryEntry(TEST_DIRECTORY, createTextPromptDraft("my previous prompt"))
    let resolveDraft: ((text: string) => void) | undefined
    let submitted = false
    let saved = false

    await act(async () => {
      root.render(
        renderComposer({
          sessionID,
          onSubmit: () => {
            submitted = true
          },
          onSaveNote: () => {
            saved = true
            return Promise.resolve({ sessionID })
          },
          onDraftSmartNote: () =>
            new Promise<string>((resolve) => {
              resolveDraft = resolve
            }),
        }),
      )
      await flushEffects()
    })

    const form = container.querySelector<HTMLFormElement>("#prompt-composer-form")
    const editor = container.querySelector<HTMLDivElement>('[data-component="prompt-editor"]')
    if (!form || !editor) throw new Error("Missing prompt composer")
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })
    expect(resolveDraft).toBeDefined()
    expect(editor.getAttribute("contenteditable")).toBe("false")

    await act(async () => {
      quoteMessageIntoPromptDraft({
        directory: TEST_DIRECTORY,
        sessionID,
        messageID: "message-1",
        text: QUOTE_TEXT,
        replaceDraft: usePromptStore.getState().replaceDraft,
      })
      await flushEffects()
    })
    const stagedDraft = getPromptDraft(usePromptStore.getState(), promptKey)
    expect(stagedDraft.parts).toContainEqual(QUOTE_PART)

    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      )
      await flushEffects()
    })
    expect(saved).toBe(false)
    expect(submitted).toBe(false)
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })
    expect(saved).toBe(false)
    expect(submitted).toBe(false)

    for (const key of ["ArrowUp", "ArrowDown"]) {
      await act(async () => {
        editor.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
          }),
        )
        await flushEffects()
      })
      expect(editor.textContent?.trim()).toBe("")
      expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe(stagedDraft.value)
      expect(getPromptDraft(usePromptStore.getState(), promptKey).parts).toEqual(stagedDraft.parts)
      expect(usePromptStore.getState().historyNavigationByKey[promptKey]).toBeUndefined()
    }

    const removeQuote = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove selected context"]',
    )
    if (!removeQuote) throw new Error("Missing staged quote removal button")
    await act(async () => {
      removeQuote.click()
      await flushEffects()
    })
    expect(getPromptDraft(usePromptStore.getState(), promptKey).parts).not.toContainEqual(
      QUOTE_PART,
    )
    expect(
      container.querySelector('[data-action="prompt-note-mode"]')?.getAttribute("aria-pressed"),
    ).toBe("true")

    await act(async () => {
      resolveDraft?.(DRAFT_TEXT)
      await flushEffects()
    })
    expect(saved).toBe(false)
    expect(submitted).toBe(false)
    expect(editor.textContent?.trim()).toBe(DRAFT_TEXT)
    expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe(DRAFT_TEXT)
    expect(editor.getAttribute("contenteditable")).toBe("true")
    expect(
      container.querySelector('[data-action="prompt-note-mode"]')?.getAttribute("aria-pressed"),
    ).toBe("true")

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })
    expect(saved).toBe(true)
    expect(submitted).toBe(false)
  })
})
