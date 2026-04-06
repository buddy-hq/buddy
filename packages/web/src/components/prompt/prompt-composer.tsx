import { ArrowUpIcon, Dialog, DialogContent, PlusIcon, SquareIcon } from "@buddy/ui"
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
  serializePromptParts,
} from "./prompt-parts"
import { type SlashCommandOption, type SlashCommandSource } from "./slash-autocomplete"
import { PromptAutocompleteMenu } from "./components/prompt-autocomplete-menu"
import { PromptComposerToolbar } from "./components/prompt-composer-toolbar"
import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_TEXT,
  type PromptComposerPart,
  RESOURCE_REFERENCE_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "./prompt-types"
import { ACCEPTED_FILE_TYPES, cloneAttachments } from "./attachment-utils"
import { ImageAttachments } from "./image-attachments"
import { usePromptComposerAttachments } from "./use-prompt-composer-attachments"
import { usePromptComposerViewState } from "./use-prompt-composer-view-state"
import { usePromptEditorSync } from "./use-prompt-editor-sync"
import {
  getPromptDraft,
  getPromptHistoryEntries,
  getPromptHistoryNavigation,
  getPromptScopeKey,
  usePromptStore,
} from "../../state/prompt-store"
import { publishPromptProbe } from "@/e2e/driver"

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
  }>
  selectedPersona: string
  selectedIntent: "auto" | "learn" | "practice" | "assess"
  selectedModel: string
  pendingSteerLabel?: string
  thinkingOptions: Array<{
    key: string
    label: string
  }>
  selectedThinking: string
  onPersonaChange: (persona: string) => void
  onIntentChange: (intent: "auto" | "learn" | "practice" | "assess") => void
  onClearPendingSteer?: () => void
  onModelChange: (model: string) => void
  onThinkingChange: (thinking: string) => void
  onSubmit: () => void
  onAbort: () => void
  onNewSession: () => void
  onOpenMcpDialog?: () => void
  onSearchFiles?: (query: string) => Promise<MentionableFile[]>
  onRefreshSlashCommands?: () => void
  className?: string
  sessionContextUsage?: React.ReactNode
}

const NON_EMPTY_TEXT = /[^\s\u200B]/

function hasSubmittablePromptParts(parts: PromptComposerPart[]) {
  return parts.some((part) => part.type !== PROMPT_PART_TYPE_TEXT || part.text.trim().length > 0)
}

export function PromptComposer(props: PromptComposerProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null)
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
  const hasSubmittableParts = useMemo(() => hasSubmittablePromptParts(draft.parts), [draft.parts])
  const canSubmit = useMemo(
    () =>
      !props.isBusy &&
      (draft.value.trim().length > 0 || draft.attachments.length > 0 || hasSubmittableParts),
    [draft.attachments.length, draft.value, hasSubmittableParts, props.isBusy],
  )
  const [cursorOffset, setCursorOffset] = useState(() => draft.cursor)
  const [dragging, setDragging] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [selectionCount, setSelectionCount] = useState(0)
  const [lastSelection, setLastSelection] = useState<string | undefined>(undefined)
  const historyIndex = historyNavigation.historyIndex
  const savedHistoryDraft = historyNavigation.savedDraft

  const viewState = usePromptComposerViewState({
    cursorOffset,
    draftValue: draft.value,
    selectedIntent: props.selectedIntent,
    selectedPersona: props.selectedPersona,
    personaOptions: props.personaOptions,
    mentionableAgents: props.mentionableAgents,
    slashCommands: props.slashCommands,
    modelOptions: props.modelOptions,
    onSearchFiles: props.onSearchFiles,
    onRefreshSlashCommands: props.onRefreshSlashCommands,
  })

  useEffect(() => {
    if (cursorOffset <= draft.value.length) return
    setCursorOffset(draft.value.length)
  }, [cursorOffset, draft.value])

  useEffect(() => {
    const slashActive = viewState.slashOptions[viewState.slashIndex]?.name
    const mentionActiveOption = viewState.mentionOptions[viewState.mentionIndex]
    const mentionActive =
      mentionActiveOption?.type === "agent"
        ? `agent:${mentionActiveOption.name}`
        : mentionActiveOption
          ? `file:${mentionActiveOption.path}`
          : undefined

    publishPromptProbe({
      popover: viewState.slashVisible ? "slash" : viewState.mentionVisible ? "mention" : "none",
      slash: {
        ids: viewState.slashOptions.map((option) => option.name),
        active: slashActive,
      },
      mention: {
        ids: viewState.mentionOptions.map((option) =>
          option.type === "agent" ? `agent:${option.name}` : `file:${option.path}`,
        ),
        active: mentionActive,
      },
      selected: lastSelection,
      selects: selectionCount,
    })
  }, [
    lastSelection,
    selectionCount,
    viewState.mentionIndex,
    viewState.mentionOptions,
    viewState.mentionVisible,
    viewState.slashIndex,
    viewState.slashOptions,
    viewState.slashVisible,
  ])

  const attachmentState = usePromptComposerAttachments({
    promptKey,
    attachments: draft.attachments,
    setDraftAttachments,
    resetHistoryNavigation,
  })

  usePromptEditorSync({
    editorRef,
    mirrorInputRef,
    draft,
    knownAgents: viewState.knownAgents,
    setCursorOffset,
  })

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
      const nextCursor = Math.max(0, Math.min(draft.cursor, draft.value.length))
      setCursorPosition(editor, nextCursor)
      setCursorOffset(nextCursor)
      setDraftCursor(promptKey, nextCursor)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [draft.cursor, draft.value.length, promptKey, props.isBusy, setDraftCursor])

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
    const nextValue = next.parts.length > 0 ? serializePromptParts(nextParts) : next.value
    const nextCursor = cursor === "start" ? 0 : nextValue.length
    renderEditorAtCursor(nextParts, nextCursor, true)
    replaceDraftFromComposer({
      value: nextValue,
      parts: nextParts,
      attachments: cloneAttachments(next.attachments),
      cursor: nextCursor,
    })
    window.requestAnimationFrame(() => {
      historyApplyingRef.current = false
    })
  }

  function commitDraftToHistory() {
    pushHistoryEntry(props.directory, {
      value: draft.value,
      attachments: cloneAttachments(draft.attachments),
      parts: clonePromptParts(draft.parts),
    })
    clearHistoryNavigation(promptKey)
  }

  function handleEditorInput() {
    if (props.isBusy) return

    const editor = editorRef.current
    if (!editor) return

    const nextParts = collectPromptParts(editor)
    const nextValue = serializePromptParts(nextParts)
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

    if (shouldReset) {
      resetHistoryNavigation()
      replaceDraftFromComposer({
        value: "",
        parts: [],
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
    setLastSelection(option.type === "agent" ? `agent:${option.name}` : `file:${option.path}`)
    setSelectionCount((current) => current + 1)
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
        setModelMenuOpen(true)
        window.requestAnimationFrame(() => {
          modelTriggerRef.current?.focus()
        })
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
    setLastSelection(`slash:${command.name}`)
    setSelectionCount((current) => current + 1)

    if (command.type === "builtin") {
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
    if (props.isBusy) {
      props.onAbort()
      return
    }

    if (!draft.value.trim() && draft.attachments.length === 0 && !hasSubmittableParts) {
      return
    }

    commitDraftToHistory()
    props.onSubmit()
  }

  return (
    <div className={props.className ?? "mx-4 mb-4"}>
      <form
        data-component="prompt-composer"
        className="group/prompt-input relative z-10 rounded-[12px] border bg-surface-raised-base shadow-sm"
        onSubmit={(event) => {
          event.preventDefault()
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
            slashVisible={viewState.slashVisible}
            mentionVisible={viewState.mentionVisible}
            showMentionLoading={viewState.showMentionLoading}
            slashOptions={viewState.slashOptions}
            slashIndex={viewState.slashIndex}
            mentionOptions={viewState.mentionOptions}
            mentionIndex={viewState.mentionIndex}
            onApplySlash={applySlash}
            onApplyMention={applyMention}
          />

          {dragging ? (
            <div className="absolute inset-2 z-10 flex items-center justify-center rounded-xl border border-dashed border-border-interactive-base/40 bg-background-base/95 text-sm text-text-base shadow-sm">
              {language.t("prompt.composer.draggingHint")}
            </div>
          ) : null}

          {!draft.value && draft.attachments.length === 0 && !hasSubmittableParts ? (
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
            contentEditable={!props.isBusy}
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

              const nextCursor = Math.max(0, Math.min(draft.cursor, draft.value.length))
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
              const currentCursor = editor ? getCursorPosition(editor) : draft.value.length
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
                  draft.value,
                  currentCursor,
                  historyIndex !== -1,
                )
              ) {
                const result = navigatePromptHistory({
                  direction: event.key === "ArrowUp" ? "up" : "down",
                  entries: historyEntries,
                  historyIndex,
                  current: {
                    value: draft.value,
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
                event.preventDefault()
                handleSubmit()
              }
            }}
            onPaste={(event) => {
              if (props.isBusy) {
                event.preventDefault()
                return
              }

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
            accept={ACCEPTED_FILE_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              const files = event.target.files
              if (!files || files.length === 0) return
              void attachmentState.addAttachments(files)
              event.currentTarget.value = ""
            }}
          />

          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <button
              type="button"
              data-action="prompt-attach"
              className="inline-flex size-8 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-weak/60 hover:text-text-base"
              title={language.t("prompt.composer.attachFilesTitle")}
              aria-label={language.t("prompt.composer.attachFilesAria")}
              onClick={() => {
                fileInputRef.current?.click()
              }}
            >
              <PlusIcon className="size-4" />
            </button>

            <button
              type="submit"
              data-action="prompt-submit"
              className="inline-flex size-8 items-center justify-center rounded-md bg-surface-interactive-base text-text-on-interactive-base transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!props.isBusy && !canSubmit}
              aria-label={
                props.isBusy
                  ? language.t("prompt.composer.stop")
                  : language.t("prompt.composer.send")
              }
              title={
                props.isBusy
                  ? language.t("prompt.composer.stop")
                  : language.t("prompt.composer.send")
              }
            >
              {props.isBusy ? (
                <SquareIcon className="size-3.5" />
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </button>
          </div>
        </div>

        <ImageAttachments
          attachments={draft.attachments}
          onRemove={attachmentState.removeAttachment}
          onOpen={attachmentState.openPreviewAttachment}
        />
      </form>

      <PromptComposerToolbar
        pendingSteerLabel={props.pendingSteerLabel}
        onClearPendingSteer={props.onClearPendingSteer}
        selectedIntent={props.selectedIntent}
        onIntentChange={props.onIntentChange}
        selectedPersona={props.selectedPersona}
        personaOptions={viewState.personaOptions}
        onPersonaChange={props.onPersonaChange}
        selectedModel={props.selectedModel}
        onModelChange={props.onModelChange}
        modelMenuOpen={modelMenuOpen}
        onModelMenuOpenChange={setModelMenuOpen}
        modelTriggerRef={modelTriggerRef}
        groupedModelOptions={viewState.groupedModelOptions}
        selectedThinking={props.selectedThinking}
        thinkingOptions={props.thinkingOptions}
        onThinkingChange={props.onThinkingChange}
        sessionContextUsage={props.sessionContextUsage}
      />

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
