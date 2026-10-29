import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { act, createRef, type RefObject } from "react"
import { createRoot, type Root } from "react-dom/client"
import { detectPlatform } from "@tanstack/react-hotkeys"
import type { Citation } from "@buddy/citation-contract"
import { REFERENCE_PART_TYPE } from "@buddy/transcript-contract/prompt"
import { toast } from "@buddy/ui"
import {
  resolveComposerAccessoryLayout,
  resolveComposerReplacementHeight,
} from "../src/components/prompt/composer-accessory-layout"
import { CitationCommentPopover } from "../src/components/prompt/citation-comment-popover"
import { useDirectoryErrorNotice } from "../src/components/directory-chat/use-directory-error-notice"
import {
  PromptComposer,
  type PromptComposerAttachmentsApi,
} from "../src/components/prompt/prompt-composer"
import { getCursorPosition } from "../src/components/prompt/editor-dom"
import { requestPromptComposerFocus } from "../src/components/prompt/prompt-composer-focus"
import { readPromptComposerLiveDraft } from "../src/components/prompt/prompt-composer-live-draft"
import {
  collectPromptParts,
  renderPromptParts,
  serializePromptParts,
} from "../src/components/prompt/prompt-parts"
import { appendCitationToDraft } from "../src/components/readers/utils/reading-selection-draft"
import { requestCitationComment } from "../src/lib/citations/comment-request"
import {
  SELECTION_CONTEXT_PART_TYPE,
  type PromptComposerPart,
} from "../src/components/prompt/prompt-types"
import { createBrowserPlatform, setRuntimePlatform } from "../src/context/platform"
import { buildPromptSubmissionParts } from "../src/lib/directory-chat/chat-prompt-helpers"
import { quoteMessageIntoPromptDraft } from "../src/features/notes/quote-message-into-prompt-draft"
import { sendPrompt } from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"
import { useGameStore } from "../src/state/game-store"
import {
  createTextPromptDraft,
  flushPromptStorePersistence,
  getPromptDraft,
  getPromptScopeKey,
  PROMPT_STORE_STORAGE_KEY,
  PROMPT_STORE_VERSION,
  usePromptStore,
} from "../src/state/prompt-store"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import {
  createTestQueryClient,
  seedSkillPresentations,
  TestQueryClientProvider,
} from "./query-test-utils"
import { installTestFetch, restoreTestFetch, seedDirectoryChatState } from "./test-utils"

const TEST_DIRECTORY = "/repo"
const TEST_PROMPT = "yeah nice"
const PROMPT_STORE_SYNC_SETTLE_MS = 300
const REJECTED_SESSION_ID = "ses_rejected"
const CONFIG_INVALID_MESSAGE =
  "Invalid config: /repo/.buddy/buddy.jsonc (models.gpt.settings.compaction)"
let queryClient: ReturnType<typeof createTestQueryClient>

function citation(id: string, comment?: string): Citation {
  const value: Citation = {
    schemaVersion: 1,
    id,
    excerpt: id,
    source: {
      kind: "chat",
      sessionID: "session-1",
      messageID: "message-1",
      partID: "part-1",
      selector: { version: 1, start: 0, end: id.length, prefix: "", suffix: "" },
    },
  }
  return comment ? { ...value, comment } : value
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
  selectedModelAcceptsImages?: boolean
  attachmentsApiRef?: RefObject<PromptComposerAttachmentsApi | null>
}) {
  const selectedModelAcceptsImages = input.selectedModelAcceptsImages ?? true
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
            acceptsImages: selectedModelAcceptsImages,
          },
        ]}
        selectedModelAcceptsImages={selectedModelAcceptsImages}
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
        attachmentsApiRef={input.attachmentsApiRef}
        sessionContextUsage={<span data-testid="session-context" />}
      />
    </TestQueryClientProvider>
  )
}

function RejectablePromptComposer() {
  const isBusy = useChatStore(
    (state) =>
      state.directories[TEST_DIRECTORY]?.sessionStatusByID[REJECTED_SESSION_ID]?.type === "busy",
  )
  useDirectoryErrorNotice({
    directory: TEST_DIRECTORY,
    onCloseNotebook: () => undefined,
    onOpenSettings: () => undefined,
  })
  return renderPromptComposer({
    sessionID: REJECTED_SESSION_ID,
    isBusy,
    onSubmit: async (draft) => {
      const promptKey = getPromptScopeKey(TEST_DIRECTORY, REJECTED_SESSION_ID)
      usePromptStore.getState().clearDraft(promptKey)
      try {
        await sendPrompt(TEST_DIRECTORY, draft.value)
      } catch {
        usePromptStore.getState().replaceDraft(promptKey, draft)
      }
    },
  })
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

  test("restores and sends a reference from a draft saved with the legacy part type", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    const reference = { name: "docs", path: "/reference-cache/docs" }
    localStorage.setItem(
      PROMPT_STORE_STORAGE_KEY,
      JSON.stringify({
        version: PROMPT_STORE_VERSION,
        state: {
          draftsByKey: {
            [promptKey]: {
              value: "Read @docs",
              parts: [
                { type: "text", text: "Read " },
                { type: "opencode-reference", ...reference },
              ],
              attachments: [],
              cursor: 10,
              updatedAt: 1,
            },
          },
          historyByDirectory: {},
        },
      }),
    )
    await usePromptStore.persist.rehydrate()
    let submitted: Parameters<Parameters<typeof PromptComposer>[0]["onSubmit"]>[0] | undefined

    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: (draft) => {
            submitted = draft
          },
        }),
      )
      await flushEffects()
    })

    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent).toContain(
      "Read @docs",
    )

    await act(async () => {
      container
        .querySelector("#prompt-composer-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })

    expect(submitted?.value).toBe("Read @docs")
    expect(
      submitted ? buildPromptSubmissionParts(submitted.parts, submitted.attachments) : undefined,
    ).toEqual([
      { type: "text", text: "Read " },
      { type: REFERENCE_PART_TYPE, ...reference },
    ])
  })

  test("keeps draft chips across a chat switch and persisted store reload", async () => {
    const sourceSessionID = "ses_reference_draft"
    const otherSessionID = "ses_other_draft"
    const promptKey = getPromptScopeKey(TEST_DIRECTORY, sourceSessionID)
    const parts: PromptComposerPart[] = [
      { type: "text", text: "Please use " },
      { type: REFERENCE_PART_TYPE, name: "docs", path: "/reference-cache/docs" },
      { type: "text", text: " " },
      { type: "agent", name: "code" },
      { type: "text", text: " " },
      { type: "skill", name: "review" },
      { type: "text", text: " " },
      { type: "workspace-file-reference", path: "notes/draft.md" },
      { type: "text", text: " " },
      { type: "resource-reference", key: "resource-1" },
      { type: "text", text: " " },
      {
        type: "notebook-reference",
        text: "Plan (note: plan.md)",
        title: "Plan",
        kind: "note",
      },
      { type: "text", text: " " },
    ]
    usePromptStore.getState().replaceDraft(
      promptKey,
      createTextPromptDraft(serializePromptParts(parts)),
    )
    let submitted: Parameters<Parameters<typeof PromptComposer>[0]["onSubmit"]>[0] | undefined
    const renderSession = (sessionID: string) =>
      renderPromptComposer({
        sessionID,
        onSubmit: (draft) => {
          submitted = draft
        },
      })
    const editor = () => {
      const element = container.querySelector<HTMLElement>('[data-component="prompt-editor"]')
      if (!element) throw new Error("Expected the prompt editor")
      return element
    }

    await act(async () => {
      root.render(renderSession(sourceSessionID))
    })
    act(() => {
      renderPromptParts(editor(), parts)
      editor().dispatchEvent(new Event("input", { bubbles: true }))
      expect(collectPromptParts(editor())).toEqual(parts)
      root.render(renderSession(otherSessionID))
    })
    await act(async () => {
      editor().textContent = "Reply in the other chat"
      editor().dispatchEvent(new Event("input", { bubbles: true }))
      container
        .querySelector("#prompt-composer-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(submitted?.value).toBe("Reply in the other chat")
    await act(async () => {
      root.render(renderSession(sourceSessionID))
    })
    expect(collectPromptParts(editor())).toEqual(parts)

    await act(async () => {
      root.render(null)
    })
    flushPromptStorePersistence()
    const saved = localStorage.getItem(PROMPT_STORE_STORAGE_KEY)
    if (!saved) throw new Error("Expected a persisted draft")
    usePromptStore.setState({ draftsByKey: {}, historyByDirectory: {}, historyNavigationByKey: {} })
    flushPromptStorePersistence()
    localStorage.setItem(PROMPT_STORE_STORAGE_KEY, saved)
    await usePromptStore.persist.rehydrate()
    expect(getPromptDraft(usePromptStore.getState(), promptKey).parts).toEqual(parts)

    await act(async () => {
      root.render(renderSession(sourceSessionID))
    })
    expect(collectPromptParts(editor())).toEqual(parts)
    await act(async () => {
      container
        .querySelector("#prompt-composer-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(submitted?.parts).toEqual(parts)
  })

  test("sends a live draft with earlier citations and the newly edited comment", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    const earlier = citation("earlier citation", "earlier comment")
    const current = citation("current citation")
    const withEarlier = appendCitationToDraft(createTextPromptDraft("Initial draft"), earlier)
    usePromptStore.getState().replaceDraft(promptKey, appendCitationToDraft(withEarlier, current))
    requestCitationComment(current.id)

    let submitted: Parameters<Parameters<typeof PromptComposer>[0]["onSubmit"]>[0] | undefined
    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: (draft) => {
            submitted = draft
          },
        }),
      )
      await flushEffects()
    })

    const commentEditor = document.body.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Comment on cited text"]',
    )
    expect(commentEditor).not.toBeNull()

    await act(async () => {
      commentEditor?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      )
      await flushEffects()
    })
    expect(submitted).toBeUndefined()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add citation comment"]')
        ?.click()
      await flushEffects()
    })

    const reopenedEditor = document.body.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Comment on cited text"]',
    )
    expect(reopenedEditor).not.toBeNull()
    await act(async () => {
      if (!reopenedEditor) return
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set
      valueSetter?.call(reopenedEditor, "new comment")
      reopenedEditor.dispatchEvent(new Event("input", { bubbles: true }))
      await flushEffects()
    })

    await act(async () => {
      const editor = container.querySelector<HTMLElement>('[data-component="prompt-editor"]')
      if (editor) {
        editor.textContent = "Live draft text"
        editor.dispatchEvent(new Event("input", { bubbles: true }))
      }
      reopenedEditor?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ...(detectPlatform() === "mac" ? { metaKey: true } : { ctrlKey: true }),
          bubbles: true,
          cancelable: true,
        }),
      )
      await flushEffects()
    })

    expect(submitted?.value).toBe("Live draft text")
    expect(submitted?.parts.flatMap((part) => ("citation" in part ? [part.citation] : []))).toEqual(
      [earlier, { ...current, comment: "new comment" }],
    )
    expect(getPromptDraft(usePromptStore.getState(), promptKey).parts).toEqual([])
  })

  test("right Command sends a citation when Enter includes extra modifier flags", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform")
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" })

    try {
      const promptKey = getPromptScopeKey(TEST_DIRECTORY)
      const earlier = citation("earlier citation", "earlier comment")
      const current = citation("current citation")
      const withEarlier = appendCitationToDraft(createTextPromptDraft("Draft text"), earlier)
      usePromptStore.getState().replaceDraft(promptKey, appendCitationToDraft(withEarlier, current))
      requestCitationComment(current.id)
      let submitted: Parameters<Parameters<typeof PromptComposer>[0]["onSubmit"]>[0] | undefined

      await act(async () => {
        root.render(
          renderPromptComposer({
            onSubmit: (draft) => {
              submitted = draft
            },
          }),
        )
        await flushEffects()
      })

      const commentEditor = document.body.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Comment on cited text"]',
      )
      expect(commentEditor).not.toBeNull()

      await act(async () => {
        if (!commentEditor) return
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set
        valueSetter?.call(commentEditor, "right command comment")
        commentEditor.dispatchEvent(new Event("input", { bubbles: true }))
        commentEditor.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Meta",
            code: "MetaRight",
            location: 2,
            metaKey: true,
            ctrlKey: true,
            altKey: true,
            shiftKey: true,
            bubbles: true,
          }),
        )
        commentEditor.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            metaKey: true,
            ctrlKey: true,
            altKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        )
        await flushEffects()
      })

      expect(
        submitted?.parts.flatMap((part) => ("citation" in part ? [part.citation] : [])),
      ).toEqual([earlier, { ...current, comment: "right command comment" }])
    } finally {
      if (originalPlatform) Object.defineProperty(navigator, "platform", originalPlatform)
      else Reflect.deleteProperty(navigator, "platform")
    }
  })

  test("Enter saves a citation comment without sending", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    const current = citation("current citation")
    usePromptStore
      .getState()
      .replaceDraft(promptKey, appendCitationToDraft(createTextPromptDraft("Draft text"), current))
    requestCitationComment(current.id)
    let sendCount = 0

    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: () => {
            sendCount += 1
          },
        }),
      )
      await flushEffects()
    })

    const commentEditor = document.body.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Comment on cited text"]',
    )
    await act(async () => {
      if (!commentEditor) return
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set
      valueSetter?.call(commentEditor, "saved comment")
      commentEditor.dispatchEvent(new Event("input", { bubbles: true }))
      commentEditor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      )
      await flushEffects()
    })

    expect(sendCount).toBe(0)
    expect(
      getPromptDraft(usePromptStore.getState(), promptKey).parts.flatMap((part) =>
        "citation" in part ? [part.citation.comment] : [],
      ),
    ).toEqual(["saved comment"])
    // The next Enter must reach the composer, not the chip's edit-comment trigger.
    await act(async () => {
      await flushEffects(20)
    })
    expect(document.activeElement).toBe(container.querySelector('[data-component="prompt-editor"]'))
  })

  test("modifier Enter saves a comment when sending is unavailable", async () => {
    const saved: string[] = []
    let sendCount = 0
    const modifier = detectPlatform() === "mac" ? { metaKey: true } : { ctrlKey: true }

    for (const canSend of [undefined, false]) {
      await act(async () => {
        root.render(
          <CitationCommentPopover
            citationID="citation-1"
            comment=""
            onSave={(comment) => saved.push(comment)}
            onSend={
              canSend === false
                ? () => {
                    sendCount += 1
                  }
                : undefined
            }
            canSend={canSend}
          />,
        )
        await flushEffects()
      })

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('button[aria-label="Add citation comment"]')
          ?.click()
        await flushEffects()
      })

      const commentEditor = document.body.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Comment on cited text"]',
      )
      expect(commentEditor).not.toBeNull()
      await act(async () => {
        if (!commentEditor) return
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set
        valueSetter?.call(commentEditor, "saved without sending")
        commentEditor.dispatchEvent(new Event("input", { bubbles: true }))
        commentEditor.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            ...modifier,
            bubbles: true,
            cancelable: true,
          }),
        )
        await flushEffects()
      })

      expect(document.body.querySelector('textarea[aria-label="Comment on cited text"]')).toBeNull()
    }

    expect(saved).toEqual(["saved without sending", "saved without sending"])
    expect(sendCount).toBe(0)
  })

  test("a rejected citation send keeps its comment editor open", async () => {
    const modifier = detectPlatform() === "mac" ? { metaKey: true } : { ctrlKey: true }
    await act(async () => {
      root.render(
        <CitationCommentPopover
          citationID="citation-1"
          comment=""
          onSave={() => undefined}
          onSend={() => false}
        />,
      )
      await flushEffects()
    })

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add citation comment"]')
        ?.click()
      await flushEffects()
    })

    const commentEditor = document.body.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Comment on cited text"]',
    )
    expect(commentEditor).not.toBeNull()
    await act(async () => {
      if (!commentEditor) return
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set
      valueSetter?.call(commentEditor, "unsent comment")
      commentEditor.dispatchEvent(new Event("input", { bubbles: true }))
      commentEditor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ...modifier,
          bubbles: true,
          cancelable: true,
        }),
      )
      await flushEffects()
    })

    expect(
      document.body.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Comment on cited text"]',
      )?.value,
    ).toBe("unsent comment")
  })

  test("the primary modifier plus Enter sends a draft with previously staged citations", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    const earlier = citation("earlier citation", "earlier comment")
    usePromptStore
      .getState()
      .replaceDraft(promptKey, appendCitationToDraft(createTextPromptDraft("Draft text"), earlier))
    let submitted: Parameters<Parameters<typeof PromptComposer>[0]["onSubmit"]>[0] | undefined

    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: (draft) => {
            submitted = draft
          },
        }),
      )
      await flushEffects()
    })

    await act(async () => {
      container.querySelector<HTMLElement>('[data-component="prompt-editor"]')?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ...(detectPlatform() === "mac" ? { metaKey: true } : { ctrlKey: true }),
          bubbles: true,
          cancelable: true,
        }),
      )
      await flushEffects()
    })

    expect(submitted?.value).toBe("Draft text")
    expect(submitted?.parts.flatMap((part) => ("citation" in part ? [part.citation] : []))).toEqual(
      [earlier],
    )
  })

  test("right Command sends from the composer with extra modifier flags", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform")
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" })

    try {
      const promptKey = getPromptScopeKey(TEST_DIRECTORY)
      usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft("Draft text"))
      let submittedValue: string | undefined

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

      await act(async () => {
        const editor = container.querySelector<HTMLElement>('[data-component="prompt-editor"]')
        const modifiers = { metaKey: true, ctrlKey: true, altKey: true, shiftKey: true }
        editor?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Meta",
            code: "MetaRight",
            location: 2,
            ...modifiers,
            bubbles: true,
          }),
        )
        editor?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
        editor?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            ...modifiers,
            bubbles: true,
            cancelable: true,
          }),
        )
        await flushEffects()
      })

      expect(submittedValue).toBe("Draft text")
    } finally {
      if (originalPlatform) Object.defineProperty(navigator, "platform", originalPlatform)
      else Reflect.deleteProperty(navigator, "platform")
    }
  })

  test("right Command released outside the editor cannot submit a later modified Enter", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform")
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" })

    try {
      const promptKey = getPromptScopeKey(TEST_DIRECTORY)
      usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft("Draft text"))
      let sendCount = 0

      await act(async () => {
        root.render(
          renderPromptComposer({
            onSubmit: () => {
              sendCount += 1
            },
          }),
        )
        await flushEffects()
      })

      await act(async () => {
        const editor = container.querySelector<HTMLElement>('[data-component="prompt-editor"]')
        const modifiers = { metaKey: true, ctrlKey: true, altKey: true, shiftKey: true }
        const rightCommand = new KeyboardEvent("keydown", {
          key: "Meta",
          code: "MetaRight",
          location: 2,
          ...modifiers,
          bubbles: true,
        })
        editor?.dispatchEvent(rightCommand)
        document.body.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "Meta",
            code: "MetaRight",
            location: 2,
            bubbles: true,
          }),
        )
        editor?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            ...modifiers,
            bubbles: true,
            cancelable: true,
          }),
        )

        editor?.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }))
        editor?.dispatchEvent(rightCommand)
        editor?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            ...modifiers,
            bubbles: true,
            cancelable: true,
          }),
        )
        await flushEffects()
      })

      expect(sendCount).toBe(0)
      expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe("Draft text")
    } finally {
      if (originalPlatform) Object.defineProperty(navigator, "platform", originalPlatform)
      else Reflect.deleteProperty(navigator, "platform")
    }
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

  test("shows an undone prompt at once when the undo also settles the turn", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft("/undo"))
    const pendingFrames = new Map<number, FrameRequestCallback>()
    let lastFrameID = 0
    const requestAnimationFrame = window.requestAnimationFrame
    const cancelAnimationFrame = window.cancelAnimationFrame
    window.requestAnimationFrame = (callback) => {
      lastFrameID += 1
      pendingFrames.set(lastFrameID, callback)
      return lastFrameID
    }
    window.cancelAnimationFrame = (frameID) => {
      pendingFrames.delete(frameID)
    }
    const runPendingFrames = () => {
      const callbacks = [...pendingFrames.values()]
      pendingFrames.clear()
      for (const callback of callbacks) callback(performance.now())
    }
    const renderComposer = (isBusy: boolean) =>
      root.render(renderPromptComposer({ isBusy, onSubmit: () => undefined }))

    try {
      await act(async () => {
        renderComposer(false)
        await flushEffects()
      })
      await act(async () => {
        container
          .querySelector("#prompt-composer-form")
          ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        renderComposer(true)
        await flushEffects()
      })
      await act(async () => {
        renderComposer(false)
        await flushEffects()
      })

      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", false)
      usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft(TEST_PROMPT))
      requestPromptComposerFocus(TEST_DIRECTORY)
      await Promise.resolve()
      runPendingFrames()
      await flushEffects()
      runPendingFrames()
    } finally {
      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
      window.requestAnimationFrame = requestAnimationFrame
      window.cancelAnimationFrame = cancelAnimationFrame
    }

    const editor = container.querySelector<HTMLElement>('[data-component="prompt-editor"]')
    expect(editor?.textContent).toBe(TEST_PROMPT)
    expect(document.activeElement).toBe(editor)
    expect(editor ? getCursorPosition(editor) : undefined).toBe(TEST_PROMPT.length)
  })

  test("keeps a prompt the server rejects in the composer and says why", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY, REJECTED_SESSION_ID)
    const draft = {
      value: "Read @docs",
      parts: [
        { type: "text" as const, text: "Read " },
        { type: REFERENCE_PART_TYPE, name: "docs", path: "/reference-cache/docs" },
      ],
      attachments: [
        {
          id: "attachment-image",
          filename: "diagram.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,iVBORw==",
          kind: "image" as const,
        },
      ],
      cursor: 10,
    }
    usePromptStore.getState().replaceDraft(promptKey, draft)
    const session = {
      id: REJECTED_SESSION_ID,
      title: "Rejected",
      directory: TEST_DIRECTORY,
      time: { created: 1, updated: 1 },
    }
    seedDirectoryChatState(TEST_DIRECTORY, { sessionID: REJECTED_SESSION_ID, sessions: [session] })
    const rejections = [
      Response.json(
        {
          error: CONFIG_INVALID_MESSAGE,
          code: "config.invalid",
          details: { path: "models.gpt.settings.compaction", file: "/repo/.buddy/buddy.jsonc" },
        },
        { status: 400 },
      ),
      Response.json(
        { error: "Internal server error", code: "internal", errorID: "err_7f3a" },
        { status: 500 },
      ),
    ]
    const originalFetch = globalThis.fetch
    installTestFetch(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://buddy.test")
      if (url.pathname.endsWith("/prompt_async")) {
        return rejections.shift() ?? new Response(null, { status: 204 })
      }
      if (url.pathname === `/api/session/${REJECTED_SESSION_ID}`) return Response.json(session)
      if (url.pathname === "/api/session") return Response.json([session])
      return Response.json([])
    })
    const errorToast = spyOn(toast, "error").mockImplementation(() => "test-toast")
    const submit = async () => {
      await act(async () => {
        container
          .querySelector("#prompt-composer-form")
          ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        await flushEffects()
      })
    }
    const expectDraftInComposer = () => {
      const editor = container.querySelector('[data-component="prompt-editor"]')
      expect(editor?.textContent).toContain("Read @docs")
      expect(editor?.querySelector(`[data-type="${REFERENCE_PART_TYPE}"]`)).not.toBeNull()
      expect(
        container.querySelector('[data-component="prompt-attachment-item"]')?.getAttribute(
          "data-filename",
        ),
      ).toBe("diagram.png")
    }

    try {
      await act(async () => {
        root.render(<RejectablePromptComposer />)
        await flushEffects()
      })

      await submit()
      expectDraftInComposer()
      expect(errorToast).toHaveBeenLastCalledWith(
        CONFIG_INVALID_MESSAGE,
        expect.objectContaining({
          action: expect.objectContaining({ label: "Open settings" }),
        }),
      )

      await submit()
      expectDraftInComposer()
      expect(errorToast).toHaveBeenLastCalledWith(
        "Something went wrong",
        expect.objectContaining({
          description: "Reference: err_7f3a",
          action: expect.objectContaining({ label: "Copy reference" }),
        }),
      )
    } finally {
      errorToast.mockRestore()
      restoreTestFetch(originalFetch)
      useChatStore.setState({ directories: {} })
      resetTranscriptRepositoryForTests()
    }
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

  test("accepts images and exposes an image-only picker in Note mode for a text-only model", async () => {
    const attachmentsApiRef = createRef<PromptComposerAttachmentsApi>()
    let savedImages: Parameters<
      NonNullable<Parameters<typeof PromptComposer>[0]["onSaveNote"]>
    >[0]["images"]

    await act(async () => {
      root.render(
        renderPromptComposer({
          attachmentsApiRef,
          selectedModelAcceptsImages: false,
          onSubmit: () => undefined,
          onSaveNote: (input) => {
            savedImages = input.images
            return Promise.resolve({ sessionID: "ses_note" })
          },
        }),
      )
      await flushEffects()
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="prompt-note-mode"]')?.click()
      await flushEffects()
    })
    await act(async () => {
      await attachmentsApiRef.current?.addAttachments([
        new File([new Uint8Array([137, 80, 78, 71])], "Screenshot.png", {
          type: "image/png",
        }),
      ])
      await flushEffects()
    })

    const attachButton = container.querySelector<HTMLButtonElement>('[data-action="prompt-attach"]')
    const fileInput = container.querySelector<HTMLInputElement>('[data-action="prompt-file-input"]')
    const saveButton = container.querySelector<HTMLButtonElement>('[data-action="prompt-submit"]')
    expect(attachButton?.title).toBe("Attach images")
    expect(fileInput?.accept).toBe("image/png,image/jpeg,image/gif,image/webp")
    expect(container.querySelector('[data-filename="Screenshot.png"]')).not.toBeNull()
    expect(saveButton?.disabled).toBe(false)

    await act(async () => {
      container
        .querySelector("#prompt-composer-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })

    expect(savedImages).toEqual([
      {
        filename: "Screenshot.png",
        mime: "image/png",
        data: "iVBORw==",
      },
    ])
  })

  test("explains why Save is disabled for a non-image note attachment", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    usePromptStore.getState().replaceDraft(promptKey, {
      ...createTextPromptDraft(TEST_PROMPT),
      attachments: [
        {
          id: "attachment-text",
          filename: "notes.txt",
          mime: "text/plain",
          dataUrl: "data:text/plain;base64,aGVsbG8=",
          kind: "file",
        },
      ],
    })

    await act(async () => {
      root.render(
        renderPromptComposer({
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

    const saveButton = container.querySelector<HTMLButtonElement>('[data-action="prompt-submit"]')
    expect(saveButton?.disabled).toBe(true)
    expect(saveButton?.title).toBe(
      "Only images can be saved in a note. Remove other attachments first.",
    )
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

  test("toggles Note mode with the composer-scoped shortcut", async () => {
    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: () => undefined,
          onSaveNote: () => Promise.resolve({ sessionID: "ses_note" }),
        }),
      )
      await flushEffects()
    })

    const editor = container.querySelector<HTMLElement>('[data-component="prompt-editor"]')
    const noteButton = container.querySelector<HTMLButtonElement>(
      '[data-action="prompt-note-mode"]',
    )
    const platform = detectPlatform()
    const primaryModifier = platform === "mac" ? { metaKey: true } : { ctrlKey: true }
    const toggleNoteMode = () =>
      editor?.dispatchEvent(
        new KeyboardEvent("keydown", {
          ...primaryModifier,
          bubbles: true,
          cancelable: true,
          code: "Enter",
          key: "Enter",
          shiftKey: true,
        }),
      )

    await act(async () => {
      editor?.focus()
      toggleNoteMode()
      await flushEffects()
    })
    expect(noteButton?.getAttribute("aria-pressed")).toBe("true")

    await act(async () => {
      toggleNoteMode()
      await flushEffects()
    })
    expect(noteButton?.getAttribute("aria-pressed")).toBe("false")
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
