import {
  Dialog,
  DialogContent,
  NativeSelect,
  NativeSelectOption,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@buddy/ui"
import { XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { language } from "@/context/language"
import { shouldSubmitComposer } from "../../lib/chat-input"
import {
  createTextFragment,
  getCursorPosition,
  setCursorPosition,
  setRangeEdge,
} from "./editor-dom"
import {
  canNavigateHistoryAtCursor,
  navigatePromptHistory,
  type PromptHistoryEntry,
} from "./prompt-history"
import {
  type MentionOption,
  type MentionableAgent,
  type MentionableFile,
} from "./mention-autocomplete"
import {
  clonePromptParts,
  collectPromptParts,
  createPromptPartsFromValue,
  renderPromptParts,
  serializePromptEditorParts,
} from "./prompt-parts"
import { type SlashCommandOption, type SlashCommandSource } from "./slash-autocomplete"
import { PromptAutocompleteMenu } from "./components/prompt-autocomplete-menu"
import { PromptComposerToolbar } from "./components/prompt-composer-toolbar"
import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_TEXT,
  READING_SELECTION_PART_TYPE,
  type PromptComposerPart,
  RESOURCE_REFERENCE_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "./prompt-types"
import {
  ACCEPTED_FILE_TYPES,
  ACCEPTED_NON_IMAGE_FILE_TYPES,
  attachmentRequiresVisionInput,
  cloneAttachments,
} from "./attachment-utils"
import { ImageAttachments } from "./image-attachments"
import { usePromptComposerAttachments } from "./use-prompt-composer-attachments"
import { usePromptComposerViewState } from "./use-prompt-composer-view-state"
import { usePromptEditorSync } from "./use-prompt-editor-sync"
import type { PromptSelectMode } from "./prompt-select-performance"
import {
  getPromptDraft,
  getPromptHistoryEntries,
  getPromptHistoryNavigation,
  getPromptScopeKey,
  usePromptStore,
  type PromptDraftState,
} from "../../state/prompt-store"

const IMMEDIATE_BUILTIN_SLASH_COMMANDS = new Set(["new", "persona", "model", "mcp"])

type PromptComposerProps = {
  directory: string
  sessionID?: string
  isBusy: boolean
  personaOptions: Array<{
    name: string
    label?: string
  }>
  mentionableAgents: MentionableAgent[]
  slashCommands: Array<{
    name: string
    description?: string
    source?: SlashCommandSource
  }>
  modelOptions: Array<{
    key: string
    label: string
    group?: string
    disabled?: boolean
    acceptsImages: boolean
  }>
  selectedModelAcceptsImages: boolean
  selectedPersona: string
  selectedModel: string
  pendingSteerLabel?: string
  thinkingOptions: Array<{
    key: string
    label: string
  }>
  selectedThinking: string
  onPersonaChange: (persona: string) => void
  onClearPendingSteer?: () => void
  onModelChange: (model: string) => void
  onThinkingChange: (thinking: string) => void
  onSubmit: () => void
  onAbort: () => void
  onNewSession: () => void
  onOpenMcpDialog?: () => void
  onSearchFiles?: (query: string) => Promise<MentionableFile[]>
  onRefreshSlashCommands?: () => void
  selectorMode?: PromptSelectMode
  className?: string
  sessionContextUsage?: React.ReactNode
}

const NON_EMPTY_TEXT = /[^\s\u200B]/

function hasSubmittablePromptParts(parts: PromptComposerPart[]) {
  return parts.some((part) => part.type !== PROMPT_PART_TYPE_TEXT || part.text.trim().length > 0)
}

function buildReadingSelectionEntryKey(
  part: Extract<PromptComposerPart, { type: typeof READING_SELECTION_PART_TYPE }>,
) {
  return (
    part.selectionKey ??
    `${part.cfi ?? ""}:${part.index ?? ""}:${part.tocLabel ?? ""}:${part.pageLabel ?? ""}:${part.text}`
  )
}

type DismissedSelectionPreview = {
  key: string
  text: string
}

export function PromptComposer(props: PromptComposerProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const modelNativeTriggerRef = useRef<HTMLSelectElement>(null)
  const modelRadixTriggerRef = useRef<HTMLButtonElement>(null)
  const mirrorInputRef = useRef(false)
  const historyApplyingRef = useRef(false)
  const previousBusyRef = useRef(props.isBusy)
  const promptKey = useMemo(
    () => getPromptScopeKey(props.directory, props.sessionID),
    [props.directory, props.sessionID],
  )
  const draft = usePromptStore((state) => getPromptDraft(state, promptKey))
  const historyEntries = usePromptStore((state) => getPromptHistoryEntries(state, props.directory))
  const historyNavigation = usePromptStore((state) => getPromptHistoryNavigation(state, promptKey))
  const replaceDraft = usePromptStore((state) => state.replaceDraft)
  const setDraftAttachments = usePromptStore((state) => state.setAttachments)
  const setDraftCursor = usePromptStore((state) => state.setCursor)
  const clearDraft = usePromptStore((state) => state.clearDraft)
  const pushHistoryEntry = usePromptStore((state) => state.pushHistoryEntry)
  const setHistoryNavigation = usePromptStore((state) => state.setHistoryNavigation)
  const clearHistoryNavigation = usePromptStore((state) => state.resetHistoryNavigation)
  const readingSelectionEntries = useMemo(
    () =>
      draft.parts.flatMap((part) =>
        part.type === READING_SELECTION_PART_TYPE
          ? [{ part, key: buildReadingSelectionEntryKey(part) }]
          : [],
      ),
    [draft.parts],
  )
  const draftEditorParts = useMemo(
    () => draft.parts.filter((part) => part.type !== READING_SELECTION_PART_TYPE),
    [draft.parts],
  )
  const draftEditorValue = useMemo(() => serializePromptEditorParts(draft.parts), [draft.parts])
  const hasSubmittableParts = useMemo(() => hasSubmittablePromptParts(draft.parts), [draft.parts])
  const unsupportedImageAttachments = useMemo(
    () =>
      props.selectedModelAcceptsImages
        ? []
        : draft.attachments.filter((attachment) => attachmentRequiresVisionInput(attachment.mime)),
    [draft.attachments, props.selectedModelAcceptsImages],
  )
  const unsupportedImageAttachmentIds = useMemo(
    () => new Set(unsupportedImageAttachments.map((attachment) => attachment.id)),
    [unsupportedImageAttachments],
  )
  const hasUnsupportedImageAttachments = unsupportedImageAttachments.length > 0
  const canSubmit = useMemo(
    () =>
      !hasUnsupportedImageAttachments &&
      (draftEditorValue.trim().length > 0 || draft.attachments.length > 0 || hasSubmittableParts),
    [
      draft.attachments.length,
      draftEditorValue,
      hasSubmittableParts,
      hasUnsupportedImageAttachments,
    ],
  )
  const [cursorOffset, setCursorOffset] = useState(() => draft.cursor)
  const [dragging, setDragging] = useState(false)
  const [modelMenuOpenRequest, setModelMenuOpenRequest] = useState(0)
  const [dismissedSelectionPreviews, setDismissedSelectionPreviews] = useState<
    DismissedSelectionPreview[]
  >([])
  const historyIndex = historyNavigation.historyIndex
  const savedHistoryDraft = historyNavigation.savedDraft

  const viewState = usePromptComposerViewState({
    cursorOffset,
    draftValue: draftEditorValue,
    selectedPersona: props.selectedPersona,
    personaOptions: props.personaOptions,
    mentionableAgents: props.mentionableAgents,
    slashCommands: props.slashCommands,
    modelOptions: props.modelOptions,
    onSearchFiles: props.onSearchFiles,
    onRefreshSlashCommands: props.onRefreshSlashCommands,
  })

  useEffect(() => {
    if (cursorOffset <= draftEditorValue.length) return
    setCursorOffset(draftEditorValue.length)
  }, [cursorOffset, draftEditorValue])

  const attachmentState = usePromptComposerAttachments({
    promptKey,
    attachments: draft.attachments,
    setDraftAttachments,
    resetHistoryNavigation,
    acceptsImages: props.selectedModelAcceptsImages,
    onUnsupportedImages: () => {
      toast.error("This model cannot accept image attachments.")
    },
  })

  usePromptEditorSync({
    editorRef,
    mirrorInputRef,
    draft: {
      ...draft,
      value: draftEditorValue,
      parts: draftEditorParts,
    },
    knownAgents: viewState.knownAgents,
    setCursorOffset,
  })

  const previousReadingSelectionCountRef = useRef(readingSelectionEntries.length)

  useEffect(() => {
    const previous = previousReadingSelectionCountRef.current
    previousReadingSelectionCountRef.current = readingSelectionEntries.length
    if (readingSelectionEntries.length <= previous) return

    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const nextCursor = Math.max(0, Math.min(draft.cursor, draftEditorValue.length))
    setCursorPosition(editor, nextCursor)
    setCursorOffset(nextCursor)
    setDraftCursor(promptKey, nextCursor)
  }, [
    draft.cursor,
    draftEditorValue.length,
    promptKey,
    readingSelectionEntries.length,
    setDraftCursor,
  ])

  useEffect(() => {
    const wasBusy = previousBusyRef.current
    previousBusyRef.current = props.isBusy

    if (!wasBusy || props.isBusy) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const editor = editorRef.current
      if (!editor) return

      editor.focus()
      const nextCursor = Math.max(0, Math.min(draft.cursor, draftEditorValue.length))
      setCursorPosition(editor, nextCursor)
      setCursorOffset(nextCursor)
      setDraftCursor(promptKey, nextCursor)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [draft.cursor, draftEditorValue.length, promptKey, props.isBusy, setDraftCursor])

  function replaceDraftFromComposer(draftState: Omit<typeof draft, "updatedAt">) {
    mirrorInputRef.current = true
    replaceDraft(promptKey, draftState)
  }

  function renderEditorAtCursor(parts: PromptComposerPart[], cursor: number, focus = false) {
    const editor = editorRef.current
    if (!editor) return
    renderPromptParts(editor, parts)
    if (focus) {
      editor.focus()
    }
    setCursorPosition(editor, cursor)
    setCursorOffset(cursor)
  }

  function resetHistoryNavigation() {
    if (historyApplyingRef.current) return
    if (historyNavigation.historyIndex < 0 && historyNavigation.savedDraft === null) return
    clearHistoryNavigation(promptKey)
  }

  function applyDraftSnapshot(next: PromptHistoryEntry, cursor: "start" | "end") {
    historyApplyingRef.current = true
    const nextParts =
      next.parts.length > 0
        ? clonePromptParts(next.parts)
        : createPromptPartsFromValue(next.value, viewState.knownAgents)
    const readingSelectionParts = nextParts.filter(
      (part): part is Extract<PromptComposerPart, { type: typeof READING_SELECTION_PART_TYPE }> =>
        part.type === READING_SELECTION_PART_TYPE,
    )
    const editorParts = nextParts.filter((part) => part.type !== READING_SELECTION_PART_TYPE)
    const nextValue = next.parts.length > 0 ? serializePromptEditorParts(nextParts) : next.value
    const nextCursor = cursor === "start" ? 0 : nextValue.length
    renderEditorAtCursor(editorParts, nextCursor, true)
    replaceDraftFromComposer({
      value: nextValue,
      parts: [...readingSelectionParts, ...editorParts],
      attachments: cloneAttachments(next.attachments),
      cursor: nextCursor,
    })
    window.requestAnimationFrame(() => {
      historyApplyingRef.current = false
    })
  }

  function readEditorDraft() {
    const editor = editorRef.current
    const readingSelectionParts = draft.parts.filter(
      (part): part is Extract<PromptComposerPart, { type: typeof READING_SELECTION_PART_TYPE }> =>
        part.type === READING_SELECTION_PART_TYPE,
    )
    if (!editor) {
      return {
        value: draftEditorValue,
        parts: clonePromptParts(draft.parts),
        attachments: cloneAttachments(draft.attachments),
        cursor: draft.cursor,
      }
    }

    const editorParts = collectPromptParts(editor)
    const parts = [...readingSelectionParts, ...editorParts]
    const value = serializePromptEditorParts(editorParts)
    const cursor = getCursorPosition(editor)
    return {
      value,
      parts,
      attachments: cloneAttachments(draft.attachments),
      cursor,
    }
  }

  function removeReadingSelectionByKey(key: string) {
    const dismissedSelection = readingSelectionEntries.find((entry) => entry.key === key)
    if (dismissedSelection) {
      setDismissedSelectionPreviews((current) => [
        ...current,
        { key, text: dismissedSelection.part.text },
      ])
      window.setTimeout(() => {
        setDismissedSelectionPreviews((current) =>
          current.filter((selection) => selection.key !== key),
        )
      }, 220)
    }

    const currentDraft = getPromptDraft(usePromptStore.getState(), promptKey)
    const nextParts = currentDraft.parts.filter((part) => {
      if (part.type !== READING_SELECTION_PART_TYPE) return true
      if (part.selectionKey) {
        return part.selectionKey !== key
      }
      return buildReadingSelectionEntryKey(part) !== key
    })
    const nextValue = serializePromptEditorParts(nextParts)
    const nextCursor = Math.max(0, Math.min(currentDraft.cursor, nextValue.length))
    replaceDraftFromComposer({
      value: nextValue,
      parts: nextParts,
      attachments: currentDraft.attachments,
      cursor: nextCursor,
    })
  }

  function commitDraftToHistory(input: Omit<PromptDraftState, "updatedAt"> = draft) {
    pushHistoryEntry(props.directory, {
      value: input.value,
      attachments: cloneAttachments(input.attachments),
      parts: clonePromptParts(input.parts),
    })
    clearHistoryNavigation(promptKey)
  }

  function handleEditorInput() {
    const editor = editorRef.current
    if (!editor) return

    const readingSelectionParts = draft.parts.filter(
      (part): part is Extract<PromptComposerPart, { type: typeof READING_SELECTION_PART_TYPE }> =>
        part.type === READING_SELECTION_PART_TYPE,
    )
    const nextEditorParts = collectPromptParts(editor)
    const nextParts = [...readingSelectionParts, ...nextEditorParts]
    const nextValue = serializePromptEditorParts(nextEditorParts)
    const nextCursor = getCursorPosition(editor)
    const shouldReset =
      !NON_EMPTY_TEXT.test(nextValue) &&
      draft.attachments.length === 0 &&
      !Array.from(
        editor.querySelectorAll(
          `[data-type='${PROMPT_PART_TYPE_AGENT}'], [data-type='${WORKSPACE_FILE_REFERENCE_PART_TYPE}'], [data-type='${RESOURCE_REFERENCE_PART_TYPE}']`,
        ),
      ).length

    setCursorOffset(nextCursor)
    viewState.setDismissedMentionKey(undefined)
    viewState.setDismissedSlashKey(undefined)

    if (shouldReset && readingSelectionParts.length === 0) {
      resetHistoryNavigation()
      replaceDraftFromComposer({
        value: "",
        parts: [],
        attachments: draft.attachments,
        cursor: 0,
      })
      return
    }

    if (shouldReset) {
      resetHistoryNavigation()
      replaceDraftFromComposer({
        value: "",
        parts: readingSelectionParts,
        attachments: draft.attachments,
        cursor: 0,
      })
      return
    }

    resetHistoryNavigation()
    replaceDraftFromComposer({
      value: nextValue,
      parts: nextParts,
      attachments: draft.attachments,
      cursor: nextCursor,
    })
  }

  function insertTextAtSelection(text: string) {
    const editor = editorRef.current
    if (!editor) return

    let selection = window.getSelection()
    if (!selection) return

    if (selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      editor.focus()
      setCursorPosition(editor, draft.cursor)
      selection = window.getSelection()
      if (!selection) return
    }

    if (selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.startContainer)) return
    const fragment = createTextFragment(text)
    const lastNode = fragment.lastChild
    range.deleteContents()
    range.insertNode(fragment)

    if (lastNode?.nodeType === Node.TEXT_NODE) {
      range.setStart(lastNode, lastNode.textContent?.length ?? 0)
    } else if (lastNode) {
      range.setStartAfter(lastNode)
    }
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    handleEditorInput()
  }

  function applyMention(option: MentionOption) {
    const editor = editorRef.current
    if (!editor || !viewState.mentionMatch) return

    const selection = window.getSelection()
    if (!selection) return

    if (selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      editor.focus()
      setCursorPosition(editor, cursorOffset)
    }

    if (selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.startContainer)) return

    const pill = document.createElement("span")
    pill.className =
      "mx-0.5 inline-flex max-w-full items-center rounded-md border border-border-base/70 bg-surface-weak px-1.5 py-0.5 text-xs font-medium text-text-base"
    if (option.type === "agent") {
      pill.textContent = `@${option.name}`
      pill.dataset.type = PROMPT_PART_TYPE_AGENT
      pill.dataset.name = option.name
    } else {
      pill.textContent = `@${option.path}`
      pill.dataset.type = WORKSPACE_FILE_REFERENCE_PART_TYPE
      pill.dataset.path = option.path
      viewState.appendRecentMentionFile({ path: option.path, recent: true })
    }
    pill.setAttribute("contenteditable", "false")

    setRangeEdge(editor, range, "start", viewState.mentionMatch.start)
    setRangeEdge(editor, range, "end", viewState.mentionMatch.end)
    range.deleteContents()

    const gap = document.createTextNode(" ")
    range.insertNode(gap)
    range.insertNode(pill)
    range.setStartAfter(gap)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    viewState.setDismissedMentionKey(undefined)
    handleEditorInput()
  }

  function clearComposer() {
    resetHistoryNavigation()
    renderEditorAtCursor([], 0)
    clearDraft(promptKey)
  }

  function runBuiltinSlashCommand(name: string) {
    switch (name) {
      case "new":
        clearComposer()
        props.onNewSession()
        return true
      case "persona": {
        if (viewState.personaOptions.length <= 1) return false
        const currentIndex = viewState.personaOptions.findIndex(
          (option) => option.name === props.selectedPersona,
        )
        const nextIndex =
          currentIndex >= 0 ? (currentIndex + 1) % viewState.personaOptions.length : 0
        const nextPersona = viewState.personaOptions[nextIndex]
        if (!nextPersona) return false
        clearComposer()
        props.onPersonaChange(nextPersona.name)
        return true
      }
      case "model":
        clearComposer()
        setModelMenuOpenRequest((current) => current + 1)
        return true
      case "mcp":
        clearComposer()
        props.onOpenMcpDialog?.()
        return true
      default:
        return false
    }
  }

  function applySlash(command: SlashCommandOption) {
    if (command.type === "builtin" && IMMEDIATE_BUILTIN_SLASH_COMMANDS.has(command.name)) {
      runBuiltinSlashCommand(command.name)
      return
    }

    const nextValue = `/${command.name} `
    const nextCursor = command.name.length + 2
    viewState.setDismissedSlashKey(undefined)
    const nextParts = createPromptPartsFromValue(nextValue, viewState.knownAgents)
    renderEditorAtCursor(nextParts, nextCursor, true)
    replaceDraftFromComposer({
      value: nextValue,
      parts: nextParts,
      attachments: draft.attachments,
      cursor: nextCursor,
    })
  }

  function handleSubmit() {
    if (props.isBusy) return
    if (hasUnsupportedImageAttachments) return

    const currentDraft = readEditorDraft()
    const currentHasSubmittableParts = hasSubmittablePromptParts(currentDraft.parts)

    if (
      !currentDraft.value.trim() &&
      currentDraft.attachments.length === 0 &&
      !currentHasSubmittableParts
    ) {
      return
    }

    replaceDraftFromComposer(currentDraft)
    mirrorInputRef.current = false
    commitDraftToHistory(currentDraft)
    props.onSubmit()
  }

  const slashMenuVisible =
    viewState.slashMatch !== undefined && viewState.slashKey !== viewState.dismissedSlashKey
  const mentionMenuVisible =
    viewState.mentionMatch !== undefined && viewState.mentionKey !== viewState.dismissedMentionKey

  return (
    <div className={props.className ?? "mx-4 mb-4"}>
      {readingSelectionEntries.length > 0 || dismissedSelectionPreviews.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {readingSelectionEntries.map(({ part, key }) => (
            <div
              key={key}
              className="animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-300 transition-all ease-out flex max-w-[min(72%,56ch)] items-center gap-1.5 rounded-md border border-border-base bg-surface-weak px-2 py-1"
            >
              <div className="min-w-0 flex-1 truncate text-[11px] leading-4 text-text-base">
                {part.text}
              </div>
              <button
                type="button"
                onClick={() => removeReadingSelectionByKey(key)}
                aria-label="Remove selected passage"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-text-weak transition-colors hover:bg-surface-strong hover:text-text-base"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
          {dismissedSelectionPreviews.map((selection) => (
            <div
              key={`dismissed_${selection.key}`}
              className="animate-out fade-out slide-out-to-top-1 zoom-out-95 duration-200 pointer-events-none flex max-w-[min(72%,56ch)] items-center gap-1.5 rounded-md border border-border-base bg-surface-weak px-2 py-1 opacity-0"
            >
              <div className="min-w-0 flex-1 truncate text-[11px] leading-4 text-text-base">
                {selection.text}
              </div>
              <span className="inline-flex size-5 shrink-0" />
            </div>
          ))}
        </div>
      ) : null}
      <form
        id="prompt-composer-form"
        data-component="prompt-composer"
        className="group/prompt-input relative z-10 rounded-[12px] rounded-b-none border border-b-0 bg-surface-raised-base shadow-none"
        onSubmit={(event) => {
          event.preventDefault()
          if (props.isBusy) return
          handleSubmit()
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!dragging) setDragging(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void attachmentState.addAttachments(event.dataTransfer.files)
        }}
      >
        <div className="relative">
          <PromptAutocompleteMenu
            slashVisible={slashMenuVisible}
            mentionVisible={mentionMenuVisible}
            showMentionLoading={viewState.showMentionLoading}
            slashOptions={viewState.slashOptions}
            slashIndex={viewState.slashIndex}
            mentionOptions={viewState.mentionOptions}
            mentionIndex={viewState.mentionIndex}
            onApplySlash={applySlash}
            onApplyMention={applyMention}
            onSetSlashIndex={viewState.setSlashIndex}
            onSetMentionIndex={viewState.setMentionIndex}
          />

          {dragging ? (
            <div className="absolute inset-2 z-10 flex items-center justify-center rounded-xl border border-dashed border-border-interactive-base/40 bg-background-base/95 text-sm text-text-base shadow-sm">
              {language.t("prompt.composer.draggingHint")}
            </div>
          ) : null}

          {!draftEditorValue && draft.attachments.length === 0 && !hasSubmittableParts ? (
            <div
              className="pointer-events-none absolute left-3 top-3 right-20 text-sm leading-6 text-text-weak transition-opacity duration-250 ease-out"
              style={{ opacity: viewState.placeholderOpacity }}
            >
              {viewState.displayedPlaceholder}
            </div>
          ) : null}

          <div
            ref={editorRef}
            data-component="prompt-editor"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            className="min-h-[84px] max-h-[240px] w-full overflow-y-auto rounded-[12px] border-0 bg-transparent px-3 pt-3 pb-12 text-sm leading-6 text-text-base focus:outline-none"
            onInput={() => {
              handleEditorInput()
            }}
            onFocus={() => {
              const editor = editorRef.current
              if (!editor) return

              const selection = window.getSelection()
              if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
                const currentCursor = getCursorPosition(editor)
                setCursorOffset(currentCursor)
                setDraftCursor(promptKey, currentCursor)
                return
              }

              const nextCursor = Math.max(0, Math.min(draft.cursor, draftEditorValue.length))
              setCursorPosition(editor, nextCursor)
              setCursorOffset(nextCursor)
              setDraftCursor(promptKey, nextCursor)
            }}
            onClick={() => {
              const editor = editorRef.current
              if (!editor) return
              const currentCursor = getCursorPosition(editor)
              setCursorOffset(currentCursor)
              setDraftCursor(promptKey, currentCursor)
            }}
            onKeyDown={(event) => {
              const editor = editorRef.current
              const currentCursor = editor ? getCursorPosition(editor) : draftEditorValue.length
              setCursorOffset(currentCursor)
              setDraftCursor(promptKey, currentCursor)

              if (viewState.slashVisible) {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  viewState.setSlashIndex(
                    (current) => (current + 1) % viewState.slashOptions.length,
                  )
                  return
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  viewState.setSlashIndex(
                    (current) =>
                      (current - 1 + viewState.slashOptions.length) % viewState.slashOptions.length,
                  )
                  return
                }

                if (
                  event.key === "Tab" ||
                  (event.key === "Enter" &&
                    !event.nativeEvent.isComposing &&
                    !event.shiftKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey)
                ) {
                  event.preventDefault()
                  const selected = viewState.slashOptions[viewState.slashIndex]
                  if (selected) applySlash(selected)
                  return
                }

                if (event.key === "Escape") {
                  event.preventDefault()
                  viewState.setDismissedSlashKey(viewState.slashKey)
                  return
                }
              }

              if (viewState.mentionVisible) {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  viewState.setMentionIndex(
                    (current) => (current + 1) % viewState.mentionOptions.length,
                  )
                  return
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  viewState.setMentionIndex(
                    (current) =>
                      (current - 1 + viewState.mentionOptions.length) %
                      viewState.mentionOptions.length,
                  )
                  return
                }

                if (
                  event.key === "Tab" ||
                  (event.key === "Enter" &&
                    !event.nativeEvent.isComposing &&
                    !event.shiftKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey)
                ) {
                  event.preventDefault()
                  const selected = viewState.mentionOptions[viewState.mentionIndex]
                  if (selected) applyMention(selected)
                  return
                }

                if (event.key === "Escape") {
                  event.preventDefault()
                  viewState.setDismissedMentionKey(viewState.mentionKey)
                  return
                }
              }

              if (
                (event.key === "ArrowUp" || event.key === "ArrowDown") &&
                canNavigateHistoryAtCursor(
                  event.key === "ArrowUp" ? "up" : "down",
                  draftEditorValue,
                  currentCursor,
                  historyIndex !== -1,
                )
              ) {
                const result = navigatePromptHistory({
                  direction: event.key === "ArrowUp" ? "up" : "down",
                  entries: historyEntries,
                  historyIndex,
                  current: {
                    value: draftEditorValue,
                    attachments: cloneAttachments(draft.attachments),
                    parts: clonePromptParts(draft.parts),
                  },
                  savedDraft: savedHistoryDraft,
                })
                if (result.handled) {
                  event.preventDefault()
                  setHistoryNavigation(promptKey, {
                    historyIndex: result.historyIndex,
                    savedDraft: result.savedDraft,
                  })
                  applyDraftSnapshot(result.entry, result.cursor)
                  return
                }
              }

              if (
                shouldSubmitComposer({
                  key: event.key,
                  shiftKey: event.shiftKey,
                  ctrlKey: event.ctrlKey,
                  metaKey: event.metaKey,
                  altKey: event.altKey,
                  isComposing: event.nativeEvent.isComposing,
                })
              ) {
                if (props.isBusy) {
                  // Allow typing while busy; block keyboard submit/abort.
                  return
                }
                event.preventDefault()
                handleSubmit()
              }
            }}
            onPaste={(event) => {
              const clipboardData = event.clipboardData
              if (!clipboardData) return

              const items = Array.from(clipboardData.items)
              const fileItems = items.filter((item) => item.kind === "file")
              const imageItems = fileItems.filter((item) => ACCEPTED_FILE_TYPES.includes(item.type))

              if (imageItems.length > 0) {
                event.preventDefault()
                for (const item of imageItems) {
                  const file = item.getAsFile()
                  if (file) attachmentState.addAttachments([file])
                }
                return
              }

              const text = clipboardData.getData("text/plain")
              if (!text) return
              event.preventDefault()
              insertTextAtSelection(text)
            }}
          />

          <input
            ref={fileInputRef}
            data-action="prompt-file-input"
            type="file"
            multiple
            accept={(props.selectedModelAcceptsImages
              ? ACCEPTED_FILE_TYPES
              : ACCEPTED_NON_IMAGE_FILE_TYPES
            ).join(",")}
            className="hidden"
            onChange={(event) => {
              const files = event.target.files
              if (!files || files.length === 0) return
              void attachmentState.addAttachments(files)
              event.currentTarget.value = ""
            }}
          />
        </div>

        <ImageAttachments
          attachments={draft.attachments}
          unsupportedAttachmentIds={unsupportedImageAttachmentIds}
          onRemove={attachmentState.removeAttachment}
          onOpen={attachmentState.openPreviewAttachment}
        />
        {hasUnsupportedImageAttachments ? (
          <div className="mx-3 mt-2 rounded-md border border-border-warning-base bg-surface-warning-weak px-2.5 py-2 text-xs text-text-base">
            This model cannot accept image attachments. Remove the image or switch to a vision model
            before sending.
          </div>
        ) : null}
      </form>

      <PromptComposerToolbar
        pendingSteerLabel={props.pendingSteerLabel}
        onClearPendingSteer={props.onClearPendingSteer}
        selectedPersona={props.selectedPersona}
        personaOptions={viewState.personaOptions}
        onPersonaChange={props.onPersonaChange}
        selectedModel={props.selectedModel}
        selectedModelAcceptsImages={props.selectedModelAcceptsImages}
        onModelChange={props.onModelChange}
        modelMenuOpenRequest={modelMenuOpenRequest}
        modelNativeTriggerRef={modelNativeTriggerRef}
        modelRadixTriggerRef={modelRadixTriggerRef}
        groupedModelOptions={viewState.groupedModelOptions}
        selectorMode={props.selectorMode}
        selectedThinking={props.selectedThinking}
        thinkingOptions={props.thinkingOptions}
        onThinkingChange={props.onThinkingChange}
        isBusy={props.isBusy}
        canSubmit={canSubmit}
        onAttach={() => fileInputRef.current?.click()}
        onAbort={props.onAbort}
        attachLabel={language.t("prompt.composer.attachFilesTitle")}
        attachAriaLabel={language.t("prompt.composer.attachFilesAria")}
        sendLabel={language.t("prompt.composer.send")}
        sendAriaLabel={language.t("prompt.composer.send")}
        stopLabel={language.t("prompt.composer.stop")}
        stopAriaLabel={language.t("prompt.composer.stop")}
      />

      {props.sessionContextUsage ? (
        <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
          {props.selectorMode === "native" ? (
            <NativeSelect
              value={props.selectedPersona}
              onChange={(event) => props.onPersonaChange(event.currentTarget.value)}
              size="sm"
              data-action="prompt-persona-select"
              wrapperClassName="w-[120px] max-w-[120px] min-w-0"
              className="h-6 border-0 bg-transparent text-xs text-text-weaker shadow-none hover:bg-transparent focus-visible:text-text-base focus-visible:ring-0 focus-visible:ring-offset-0"
              aria-label={language.t("prompt.toolbar.aria.persona")}
            >
              {viewState.personaOptions.map((persona) => (
                <NativeSelectOption key={persona.name} value={persona.name}>
                  {persona.label ?? persona.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : (
            <Select value={props.selectedPersona} onValueChange={props.onPersonaChange}>
              <SelectTrigger
                type="button"
                size="sm"
                data-action="prompt-persona-select"
                className="h-6 max-w-[120px] min-w-0 border-0 bg-transparent px-0 text-xs text-text-weaker shadow-none hover:bg-transparent hover:text-text-base focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:border-0 data-[state=open]:text-text-base data-[state=open]:ring-0 [&_svg]:text-inherit [&_svg:last-child]:size-3"
                aria-label={language.t("prompt.toolbar.aria.persona")}
              >
                <SelectValue placeholder={language.t("prompt.toolbar.placeholders.persona")} />
              </SelectTrigger>
              <SelectContent
                side="top"
                align="start"
                position="popper"
                sideOffset={6}
                className="w-[min(16rem,calc(100vw-2rem))] max-h-[min(20rem,calc(100vh-8rem))]"
              >
                {viewState.personaOptions.map((persona) => (
                  <SelectItem key={persona.name} value={persona.name}>
                    {persona.label ?? persona.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {props.sessionContextUsage}
        </div>
      ) : null}

      <Dialog
        open={!!attachmentState.previewAttachment}
        onOpenChange={(open) => !open && attachmentState.closePreviewAttachment()}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] p-0 overflow-hidden">
          {attachmentState.previewAttachment && (
            <img
              src={attachmentState.previewAttachment.dataUrl}
              alt={attachmentState.previewAttachment.filename}
              className="w-full h-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
