import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  resolveComposerAccessoryLayout,
  resolveComposerReplacementHeight,
} from "../src/components/prompt/composer-accessory-layout"
import { PromptComposer } from "../src/components/prompt/prompt-composer"
import { readPromptComposerLiveDraft } from "../src/components/prompt/prompt-composer-live-draft"
import { SELECTION_CONTEXT_PART_TYPE } from "../src/components/prompt/prompt-types"
import { createBrowserPlatform, setRuntimePlatform } from "../src/context/platform"
import { quoteMessageIntoPromptDraft } from "../src/features/notes/quote-message-into-prompt-draft"
import { useGameStore } from "../src/state/game-store"
import {
  createTextPromptDraft,
  flushPromptStorePersistence,
  getPromptDraft,
  getPromptScopeKey,
  PROMPT_STORE_STORAGE_KEY,
  usePromptStore,
} from "../src/state/prompt-store"
import {
  createTestQueryClient,
  seedSkillPresentations,
  TestQueryClientProvider,
} from "./query-test-utils"

const TEST_DIRECTORY = "/repo"
const TEST_PROMPT = "yeah nice"
const PROMPT_STORE_SYNC_SETTLE_MS = 300
let queryClient: ReturnType<typeof createTestQueryClient>

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

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function renderPromptComposer(input: {
  onSubmit: Parameters<typeof PromptComposer>[0]["onSubmit"]
  onSaveNote?: Parameters<typeof PromptComposer>[0]["onSaveNote"]
  sessionID?: string
  compact?: boolean
  accessoryLayout?: Parameters<typeof PromptComposer>[0]["accessoryLayout"]
  isBusy?: boolean
  onAbort?: Parameters<typeof PromptComposer>[0]["onAbort"]
}) {
  return (
    <TestQueryClientProvider queryClient={queryClient}>
      <PromptComposer
        directory={TEST_DIRECTORY}
        sessionID={input.sessionID}
        isBusy={input.isBusy ?? false}
        personaOptions={[
          { name: "buddy", label: "Buddy" },
          { name: "code", label: "Code" },
        ]}
        mentionableAgents={[]}
        mentionableReferences={[]}
        slashCommands={[]}
        modelOptions={[
          {
            key: "openai/gpt-5",
            label: "GPT-5",
            acceptsImages: true,
          },
        ]}
        selectedModelAcceptsImages
        selectedPersona="buddy"
        selectedModel="openai/gpt-5"
        thinkingOptions={[{ key: "default", label: "Default" }]}
        selectedThinking="default"
        selectorMode="native"
        onPersonaChange={() => undefined}
        onModelChange={() => undefined}
        onThinkingChange={() => undefined}
        onSubmit={input.onSubmit}
        onSaveNote={input.onSaveNote}
        onAbort={input.onAbort ?? (() => undefined)}
        onNewSession={() => undefined}
        compact={input.compact}
        accessoryLayout={input.accessoryLayout}
        sessionContextUsage={<span data-testid="session-context" />}
      />
    </TestQueryClientProvider>
  )
}

describe("prompt composer submit", () => {
  let container: HTMLDivElement
  let root: Root

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

  test("clears the local editor immediately while preserving the store draft for submit", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft(TEST_PROMPT))

    let submittedValue = ""

    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: (draft) => {
            submittedValue = draft.value
          },
        }),
      )
      await flushEffects()
    })

    const form = container.querySelector("#prompt-composer-form")

    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent).toContain(
      TEST_PROMPT,
    )
    expect(form).not.toBeNull()

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })

    expect(submittedValue).toBe(TEST_PROMPT)
    expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe("")
    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent?.trim()).toBe(
      "",
    )
  })

  test("quotes the live editor draft before its debounced store write", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY, "session-1")

    await act(async () => {
      root.render(
        renderPromptComposer({
          sessionID: "session-1",
          onSubmit: () => undefined,
        }),
      )
      await flushEffects()
    })

    const editor = container.querySelector<HTMLElement>('[data-component="prompt-editor"]')
    expect(editor).not.toBeNull()

    await act(async () => {
      if (!editor) return
      editor.textContent = "typed after the last store sync"
      editor.dispatchEvent(new Event("input", { bubbles: true }))
      expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe("")

      quoteMessageIntoPromptDraft({
        directory: TEST_DIRECTORY,
        sessionID: "session-1",
        messageID: "message-1",
        text: "quoted message",
        replaceDraft: usePromptStore.getState().replaceDraft,
      })
      await flushEffects(PROMPT_STORE_SYNC_SETTLE_MS)
    })

    const draft = getPromptDraft(usePromptStore.getState(), promptKey)
    expect(draft.value).toContain("typed after the last store sync")
    expect(draft.parts).toContainEqual({
      type: SELECTION_CONTEXT_PART_TYPE,
      source: "message",
      text: "quoted message",
      selectionKey: "message_message-1",
      quotedMessageID: "message-1",
    })
  })

  test("persists a live draft read when its caller has no replacement", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY, "session-1")

    await act(async () => {
      root.render(
        renderPromptComposer({
          sessionID: "session-1",
          onSubmit: () => undefined,
        }),
      )
      await flushEffects()
    })

    const editor = container.querySelector<HTMLElement>('[data-component="prompt-editor"]')
    expect(editor).not.toBeNull()

    await act(async () => {
      if (!editor) return
      editor.textContent = "draft read without a follow-up write"
      editor.dispatchEvent(new Event("input", { bubbles: true }))
      expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe("")

      expect(readPromptComposerLiveDraft(promptKey).value).toBe(
        "draft read without a follow-up write",
      )
    })

    expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe(
      "draft read without a follow-up write",
    )
  })

  test("restores the editor when the submit flow restores the draft in the store", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    const store = usePromptStore.getState()
    store.replaceDraft(promptKey, createTextPromptDraft(TEST_PROMPT))

    let restoreDraft: (() => void) | undefined

    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: () => {
            usePromptStore.getState().clearDraft(promptKey)
            restoreDraft = () => {
              usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft(TEST_PROMPT))
            }
          },
        }),
      )
      await flushEffects()
    })

    const form = container.querySelector("#prompt-composer-form")

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })

    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent?.trim()).toBe(
      "",
    )

    await act(async () => {
      restoreDraft?.()
      await flushEffects()
    })

    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent).toContain(
      TEST_PROMPT,
    )
  })

  test("saves Note mode text without sending it to the model", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    const targetSessionID = "ses_note_destination"
    const targetPromptKey = getPromptScopeKey(TEST_DIRECTORY, targetSessionID)
    usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft(TEST_PROMPT))
    let submitted = false
    let savedNote = ""

    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: () => {
            submitted = true
          },
          onSaveNote: ({ text }) => {
            savedNote = text
            usePromptStore.getState().replaceDraft(targetPromptKey, createTextPromptDraft(text))
            return Promise.resolve({ sessionID: targetSessionID })
          },
        }),
      )
      await flushEffects()
    })

    const noteButton = container.querySelector<HTMLButtonElement>(
      '[data-action="prompt-note-mode"]',
    )
    await act(async () => {
      noteButton?.click()
      await flushEffects()
    })

    expect(noteButton?.getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector('[data-action="prompt-model-select"]')).toBeNull()

    await act(async () => {
      container
        .querySelector("#prompt-composer-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })

    expect(savedNote).toBe(TEST_PROMPT)
    expect(submitted).toBe(false)
    expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe("")
    expect(getPromptDraft(usePromptStore.getState(), targetPromptKey).value).toBe("")
    expect(noteButton?.getAttribute("aria-pressed")).toBe("false")
  })

  test("enters Note mode from the /note command", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft("/note"))

    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: () => undefined,
          onSaveNote: () => Promise.resolve({ sessionID: "ses_note" }),
        }),
      )
      await flushEffects()
    })

    const noteOption = container.querySelector<HTMLElement>(
      '[data-component="prompt-slash-option"][data-value="note"]',
    )
    expect(noteOption).not.toBeNull()

    await act(async () => {
      noteOption?.click()
      await flushEffects()
    })

    const noteButton = container.querySelector<HTMLButtonElement>(
      '[data-action="prompt-note-mode"]',
    )
    expect(noteButton?.getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent?.trim()).toBe(
      "",
    )
  })

  test("omits the /note command when the composer cannot save notes", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft("/note"))

    await act(async () => {
      root.render(renderPromptComposer({ onSubmit: () => undefined }))
      await flushEffects()
    })

    expect(
      container.querySelector('[data-component="prompt-slash-option"][data-value="note"]'),
    ).toBeNull()
  })

  test("keeps the Note mode draft when saving fails", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft(TEST_PROMPT))

    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: () => undefined,
          onSaveNote: () => Promise.reject(new Error("save failed")),
        }),
      )
      await flushEffects()
    })

    const noteButton = container.querySelector<HTMLButtonElement>(
      '[data-action="prompt-note-mode"]',
    )
    await act(async () => {
      noteButton?.click()
      await flushEffects()
    })
    await act(async () => {
      container
        .querySelector("#prompt-composer-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })

    expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe(TEST_PROMPT)
    expect(noteButton?.getAttribute("aria-pressed")).toBe("true")
  })

  test("keeps Stop available while taking a note during a running turn", async () => {
    let abortCount = 0
    await act(async () => {
      root.render(
        renderPromptComposer({
          isBusy: true,
          onAbort: () => {
            abortCount += 1
          },
          onSubmit: () => undefined,
          onSaveNote: () => Promise.resolve({ sessionID: "ses_note" }),
        }),
      )
      await flushEffects()
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="prompt-note-mode"]')?.click()
      await flushEffects()
    })

    const stopButton = container.querySelector<HTMLButtonElement>('[data-action="prompt-stop"]')
    expect(stopButton).not.toBeNull()
    await act(async () => {
      stopButton?.click()
      await flushEffects()
    })
    expect(abortCount).toBe(1)
  })

  test("does not clear a different chat draft when a Note save finishes late", async () => {
    const sourceSessionID = "ses_note_source"
    const destinationSessionID = "ses_note_destination"
    const otherSessionID = "ses_note_other"
    const sourcePromptKey = getPromptScopeKey(TEST_DIRECTORY, sourceSessionID)
    const destinationPromptKey = getPromptScopeKey(TEST_DIRECTORY, destinationSessionID)
    const otherPromptKey = getPromptScopeKey(TEST_DIRECTORY, otherSessionID)
    const otherDraft = "draft for another chat"
    usePromptStore.getState().replaceDraft(sourcePromptKey, createTextPromptDraft(TEST_PROMPT))

    let finishSave: ((value: { sessionID: string }) => void) | undefined
    const onSaveNote = () =>
      new Promise<{ sessionID: string }>((resolve) => {
        finishSave = resolve
      })
    const renderSession = (sessionID: string) =>
      renderPromptComposer({
        sessionID,
        onSubmit: () => undefined,
        onSaveNote,
      })

    await act(async () => {
      root.render(renderSession(sourceSessionID))
      await flushEffects()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="prompt-note-mode"]')?.click()
      container
        .querySelector("#prompt-composer-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })

    usePromptStore.getState().replaceDraft(otherPromptKey, createTextPromptDraft(otherDraft))
    await act(async () => {
      root.render(renderSession(otherSessionID))
      await flushEffects()
    })
    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent).toContain(
      otherDraft,
    )

    await act(async () => {
      finishSave?.({ sessionID: destinationSessionID })
      await flushEffects()
    })

    expect(getPromptDraft(usePromptStore.getState(), sourcePromptKey).value).toBe("")
    expect(getPromptDraft(usePromptStore.getState(), destinationPromptKey).value).toBe("")
    expect(getPromptDraft(usePromptStore.getState(), otherPromptKey).value).toBe(otherDraft)
    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent).toContain(
      otherDraft,
    )
  })

  test("leaves Note mode when the active chat changes", async () => {
    const firstSessionID = "ses_note_first"
    const secondSessionID = "ses_note_second"
    const renderSession = (sessionID: string) =>
      renderPromptComposer({
        sessionID,
        onSubmit: () => undefined,
        onSaveNote: () => Promise.resolve({ sessionID }),
      })

    await act(async () => {
      root.render(renderSession(firstSessionID))
      await flushEffects()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="prompt-note-mode"]')?.click()
      await flushEffects()
    })
    expect(
      container
        .querySelector<HTMLButtonElement>('[data-action="prompt-note-mode"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true")

    await act(async () => {
      root.render(renderSession(secondSessionID))
      await flushEffects()
    })
    expect(
      container
        .querySelector<HTMLButtonElement>('[data-action="prompt-note-mode"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false")
  })

  test("uses compact editor bounds only when requested", async () => {
    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: () => undefined,
        }),
      )
      await flushEffects()
    })

    const regularEditor = container.querySelector('[data-component="prompt-editor"]')
    expect(regularEditor?.classList.contains("min-h-[72px]")).toBe(true)
    expect(regularEditor?.classList.contains("max-h-[240px]")).toBe(true)
    expect(regularEditor?.classList.contains("pb-12")).toBe(true)

    await act(async () => {
      root.render(
        renderPromptComposer({
          compact: true,
          onSubmit: () => undefined,
        }),
      )
      await flushEffects()
    })

    const compactEditor = container.querySelector('[data-component="prompt-editor"]')
    expect(compactEditor?.classList.contains("min-h-[56px]")).toBe(true)
    expect(compactEditor?.classList.contains("max-h-[120px]")).toBe(true)
    expect(compactEditor?.classList.contains("pb-3")).toBe(true)
  })

  test("keeps the active game mounted when responsive placement changes", async () => {
    const expandedLayout = resolveComposerAccessoryLayout({
      paneHeight: 956,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })
    const replacementLayout = resolveComposerAccessoryLayout({
      paneHeight: 360,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })
    const renderWithLayout = (accessoryLayout: typeof expandedLayout) =>
      renderPromptComposer({
        accessoryLayout,
        onSubmit: () => undefined,
      })

    await act(async () => {
      root.render(renderWithLayout(expandedLayout))
      await flushEffects()
    })

    const arcadeButton = container.querySelector<HTMLButtonElement>(
      '[data-action="prompt-open-arcade"]',
    )
    expect(arcadeButton).not.toBeNull()

    await act(async () => {
      arcadeButton?.click()
      await flushEffects()
    })

    const initialGameDock = container.querySelector<HTMLElement>(
      '[data-component="prompt-game-dock"]',
    )
    expect(initialGameDock).not.toBeNull()

    await act(async () => {
      root.render(renderWithLayout(replacementLayout))
      await flushEffects()
    })

    const replacementGameDock = container.querySelector<HTMLElement>(
      '[data-component="prompt-game-dock"]',
    )
    expect(replacementGameDock).toBe(initialGameDock)
    expect(replacementGameDock?.style.height).toBe(
      `${resolveComposerReplacementHeight(replacementLayout)}px`,
    )
    expect(
      container.querySelector<HTMLElement>(
        '[data-component="prompt-composer-replacement-motion-host"]',
      )?.style.height,
    ).toBe("")

    await act(async () => {
      root.render(renderWithLayout(expandedLayout))
      await flushEffects()
    })

    expect(container.querySelector<HTMLElement>('[data-component="prompt-game-dock"]')).toBe(
      initialGameDock,
    )
  })
})
