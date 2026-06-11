import {
  Dialog,
  DialogContent,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  NativeSelect,
  NativeSelectOption,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  cn,
} from "@buddy/ui"
import { useNavigate } from "@tanstack/react-router"
import { Gamepad2Icon, XIcon } from "lucide-react"
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence } from "motion/react"
import { language } from "@/context/language"
import { GameDock } from "../game/game-dock"
import { GameBall } from "../game/game-ball"
import {
  GAME_PROMPT_PREFERENCE_DISABLED,
  GAME_PROMPT_PREFERENCE_REDUCED,
  getGamePromptCooldownMs,
  getGamePromptDelayMs,
  useGameStore,
} from "@/state/game-store"

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
  type PromptComposerAttachment,
  type PromptComposerPart,
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
import {
  consumePromptComposerFocusRequest,
  subscribePromptComposerFocusRequests,
} from "./prompt-composer-focus"
import type { PromptSelectMode } from "./prompt-select-performance"
import {
  getPromptDraft,
  getPromptHistoryEntries,
  getPromptHistoryNavigation,
  getPromptScopeKey,
  normalizePromptDraft,
  usePromptStore,
  arePromptDraftContentsEqual,
  type PromptDraftState,
} from "../../state/prompt-store"

const IMMEDIATE_BUILTIN_SLASH_COMMANDS = new Set(["new", "persona", "model", "mcp", "play"])
const DRAFT_STORE_SYNC_DELAY_MS = 250
const CURSOR_NAVIGATION_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
])

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
  onSubmit: (draft: Omit<PromptDraftState, "updatedAt">) => void | Promise<void>
  onAbort: () => void
  onNewSession: () => void
  onOpenMcpDialog?: () => void
  onSearchFiles?: (query: string) => Promise<MentionableFile[]>
  onRefreshSlashCommands?: () => void
  selectorMode?: PromptSelectMode
  className?: string
  sessionContextUsage?: React.ReactNode
  contextActions?: React.ReactNode
  activeQuestionID?: string
}

const NON_EMPTY_TEXT = /[^\s\u200B]/

function hasSubmittablePromptParts(parts: PromptComposerPart[]) {
  return parts.some((part) => part.type !== PROMPT_PART_TYPE_TEXT || part.text.trim().length > 0)
}

function isPromptPlaceholderVisible(draft: Pick<PromptDraftState, "parts" | "attachments">) {
  return (
    !serializePromptEditorParts(draft.parts) &&
    draft.attachments.length === 0 &&
    !hasSubmittablePromptParts(draft.parts)
  )
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

function createEmptyPromptDraftState() {
  return normalizePromptDraft({
    value: "",
    parts: [],
    attachments: [],
    cursor: 0,
  })
}

export function PromptComposer(props: PromptComposerProps) {
  const navigate = useNavigate()
  const isQuestionActive = props.activeQuestionID !== undefined
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
  const storeDraft = usePromptStore((state) => getPromptDraft(state, promptKey))
  const [draft, setDraft] = useState(() => storeDraft)
  const draftRef = useRef(draft)
  const pendingStoreDraftRef = useRef<Omit<PromptDraftState, "updatedAt"> | undefined>(undefined)
  const storeSyncTimerRef = useRef<number | undefined>(undefined)
  const draftRenderTimerRef = useRef<number | undefined>(undefined)
  const historyEntries = usePromptStore((state) => getPromptHistoryEntries(state, props.directory))
  const historyNavigation = usePromptStore((state) => getPromptHistoryNavigation(state, promptKey))
  const replaceDraft = usePromptStore((state) => state.replaceDraft)
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
  const [focusRequestID, setFocusRequestID] = useState(0)
  const [placeholderVisible, setPlaceholderVisible] = useState(() =>
    isPromptPlaceholderVisible(draft),
  )
  const [dismissedSelectionPreviews, setDismissedSelectionPreviews] = useState<
    DismissedSelectionPreview[]
  >([])

  const isGameVisible = useGameStore((state) => state.isGameVisible)
  const setGameVisible = useGameStore((state) => state.setGameVisible)
  const setPaused = useGameStore((state) => state.setPaused)
  const isMinimized = useGameStore((state) => state.isMinimized)
  const setMinimized = useGameStore((state) => state.setMinimized)
  const gamePromptPreference = useGameStore((state) => state.gamePromptPreference)
  const gamePromptDismissedUntil = useGameStore((state) => state.gamePromptDismissedUntil)
  const gamePromptLastShownAt = useGameStore((state) => state.gamePromptLastShownAt)
  const setGamePromptPreference = useGameStore((state) => state.setGamePromptPreference)
  const dismissGamePrompt = useGameStore((state) => state.dismissGamePrompt)
  const markGamePromptShown = useGameStore((state) => state.markGamePromptShown)

  const [busyStartTime, setBusyStartTime] = useState<number | null>(null)
  const [showGameBall, setShowGameBall] = useState(false)

  useEffect(() => {
    if (arePromptDraftContentsEqual(draftRef.current, storeDraft)) return
    pendingStoreDraftRef.current = undefined
    if (storeSyncTimerRef.current !== undefined) {
      window.clearTimeout(storeSyncTimerRef.current)
      storeSyncTimerRef.current = undefined
    }
    if (draftRenderTimerRef.current !== undefined) {
      window.clearTimeout(draftRenderTimerRef.current)
      draftRenderTimerRef.current = undefined
    }
    draftRef.current = storeDraft
    setDraft(storeDraft)
  }, [storeDraft])

  useEffect(() => {
    setPlaceholderVisible(isPromptPlaceholderVisible(draft))
  }, [draft])

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
  const consumedFocusRequestIDRef = useRef(0)

  const flushPendingStoreDraft = useCallback(() => {
    if (storeSyncTimerRef.current !== undefined) {
      window.clearTimeout(storeSyncTimerRef.current)
      storeSyncTimerRef.current = undefined
    }

    const pending = pendingStoreDraftRef.current
    if (!pending) return

    pendingStoreDraftRef.current = undefined
    replaceDraft(promptKey, pending)
  }, [promptKey, replaceDraft])

  const flushDeferredDraftRender = useCallback(() => {
    if (draftRenderTimerRef.current !== undefined) {
      window.clearTimeout(draftRenderTimerRef.current)
      draftRenderTimerRef.current = undefined
    }

    startTransition(() => {
      const nextDraft = draftRef.current
      setDraft(() => nextDraft)
      setPlaceholderVisible(isPromptPlaceholderVisible(nextDraft))
    })
  }, [])

  const scheduleDeferredDraftRender = useCallback(() => {
    if (draftRenderTimerRef.current !== undefined) {
      window.clearTimeout(draftRenderTimerRef.current)
    }

    draftRenderTimerRef.current = window.setTimeout(() => {
      flushDeferredDraftRender()
    }, DRAFT_STORE_SYNC_DELAY_MS)
  }, [flushDeferredDraftRender])

  const replaceDraftFromComposer = useCallback(
    (
      draftState: Omit<PromptDraftState, "updatedAt">,
      syncMode: "immediate" | "debounced" = "immediate",
      renderPriority: "sync" | "transition" = "sync",
    ) => {
      mirrorInputRef.current = true
      const nextDraft = normalizePromptDraft(draftState)
      draftRef.current = nextDraft

      if (renderPriority === "sync") {
        if (draftRenderTimerRef.current !== undefined) {
          window.clearTimeout(draftRenderTimerRef.current)
          draftRenderTimerRef.current = undefined
        }
        setPlaceholderVisible(isPromptPlaceholderVisible(nextDraft))
        setDraft(nextDraft)
      } else {
        scheduleDeferredDraftRender()
      }

      const pendingDraft = {
        value: nextDraft.value,
        parts: nextDraft.parts,
        attachments: nextDraft.attachments,
        cursor: nextDraft.cursor,
      }

      if (syncMode === "immediate") {
        pendingStoreDraftRef.current = pendingDraft
        flushPendingStoreDraft()
        return
      }

      pendingStoreDraftRef.current = pendingDraft
      if (storeSyncTimerRef.current !== undefined) {
        window.clearTimeout(storeSyncTimerRef.current)
      }
      storeSyncTimerRef.current = window.setTimeout(() => {
        flushPendingStoreDraft()
      }, DRAFT_STORE_SYNC_DELAY_MS)
    },
    [flushPendingStoreDraft, scheduleDeferredDraftRender],
  )

  const updateDraftCursorFromComposer = useCallback(
    (
      cursor: number,
      syncMode: "immediate" | "debounced",
      renderPriority: "sync" | "transition" = "sync",
    ) => {
      replaceDraftFromComposer(
        {
          value: draftRef.current.value,
          parts: draftRef.current.parts,
          attachments: draftRef.current.attachments,
          cursor,
        },
        syncMode,
        renderPriority,
      )
    },
    [replaceDraftFromComposer],
  )

  const setDraftAttachmentsFromComposer = useCallback(
    (attachments: PromptComposerAttachment[]) => {
      const currentDraft = draftRef.current
      replaceDraftFromComposer({
        value: currentDraft.value,
        parts: currentDraft.parts,
        attachments,
        cursor: currentDraft.cursor,
      })
    },
    [replaceDraftFromComposer],
  )

  const attachmentState = usePromptComposerAttachments({
    attachments: draft.attachments,
    setDraftAttachments: setDraftAttachmentsFromComposer,
    resetHistoryNavigation,
    acceptsImages: props.selectedModelAcceptsImages,
    onUnsupportedImages: () => {
      toast.error("This model cannot accept image attachments.")
    },
  })

  const focusEditorAtDraftCursor = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()
    const currentDraft = draftRef.current
    const editorValueLength = serializePromptEditorParts(currentDraft.parts).length
    const nextCursor = Math.max(0, Math.min(currentDraft.cursor, editorValueLength))
    setCursorPosition(editor, nextCursor)
    setCursorOffset(nextCursor)
    updateDraftCursorFromComposer(nextCursor, "debounced")
  }, [updateDraftCursorFromComposer])

  useEffect(() => {
    const requestID = consumePromptComposerFocusRequest(
      props.directory,
      consumedFocusRequestIDRef.current,
    )
    if (requestID === undefined) return
    consumedFocusRequestIDRef.current = requestID
    setFocusRequestID(requestID)
  }, [props.directory])

  useEffect(
    () =>
      subscribePromptComposerFocusRequests(props.directory, (requestID) => {
        if (requestID <= consumedFocusRequestIDRef.current) return
        consumedFocusRequestIDRef.current = requestID
        setFocusRequestID(requestID)
      }),
    [props.directory],
  )

  useEffect(() => {
    if (focusRequestID === 0) return
    const frame = window.requestAnimationFrame(focusEditorAtDraftCursor)
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [focusEditorAtDraftCursor, focusRequestID])

  useEffect(() => {
    const previous = previousReadingSelectionCountRef.current
    previousReadingSelectionCountRef.current = readingSelectionEntries.length
    if (readingSelectionEntries.length <= previous) return

    focusEditorAtDraftCursor()
  }, [focusEditorAtDraftCursor, readingSelectionEntries.length])

  const lastBusyRef = useRef(props.isBusy)
  const previousActiveQuestionIDRef = useRef(props.activeQuestionID)

  useEffect(() => {
    const previousQuestionID = previousActiveQuestionIDRef.current
    previousActiveQuestionIDRef.current = props.activeQuestionID

    if (!props.isBusy || previousQuestionID === props.activeQuestionID) return

    if (previousQuestionID !== undefined || props.activeQuestionID !== undefined) {
      setBusyStartTime(Date.now())
      setShowGameBall(false)
    }
  }, [props.activeQuestionID, props.isBusy])

  useEffect(() => {
    const wasBusy = lastBusyRef.current
    lastBusyRef.current = props.isBusy

    if (props.isBusy) {
      if (!busyStartTime) {
        setBusyStartTime(Date.now())
      }
    } else {
      setBusyStartTime(null)
      setShowGameBall(false)
      // Auto-pause game when turn completes (transitions from busy to idle)
      if (wasBusy && isGameVisible) {
        setPaused(true)
        setMinimized(true)
        setGameVisible(false)
      }
    }
  }, [props.isBusy, busyStartTime, isGameVisible, setPaused, setMinimized, setGameVisible])

  useEffect(() => {
    if (!busyStartTime || isQuestionActive) return
    if (gamePromptPreference === GAME_PROMPT_PREFERENCE_DISABLED) return

    const now = Date.now()
    const elapsedMs = now - busyStartTime
    const promptDelayMs = getGamePromptDelayMs(gamePromptPreference)
    const promptDelayRemainingMs = Math.max(0, promptDelayMs - elapsedMs)
    const dismissRemainingMs =
      gamePromptDismissedUntil === null ? 0 : Math.max(0, gamePromptDismissedUntil - now)
    const lastShownCooldownMs = getGamePromptCooldownMs(gamePromptPreference)
    const lastShownRemainingMs =
      gamePromptLastShownAt === null
        ? 0
        : Math.max(0, lastShownCooldownMs - (now - gamePromptLastShownAt))
    const remainingMs = Math.max(
      promptDelayRemainingMs,
      dismissRemainingMs,
      lastShownRemainingMs,
    )
    const timeout = window.setTimeout(() => {
      setShowGameBall(true)
      markGamePromptShown()
    }, remainingMs)
    return () => window.clearTimeout(timeout)
  }, [
    busyStartTime,
    gamePromptDismissedUntil,
    gamePromptLastShownAt,
    gamePromptPreference,
    isQuestionActive,
    markGamePromptShown,
  ])

  const dismissGameBall = useCallback(() => {
    dismissGamePrompt()
    setShowGameBall(false)
    setMinimized(false)
  }, [dismissGamePrompt, setMinimized])

  useEffect(() => {
    if (!isQuestionActive) return
    setShowGameBall(false)
    if (isGameVisible) {
      setPaused(true)
      setMinimized(true)
      setGameVisible(false)
    }
  }, [isQuestionActive, isGameVisible, setPaused, setMinimized, setGameVisible])

  useEffect(() => {
    return () => {
      if (draftRenderTimerRef.current !== undefined) {
        window.clearTimeout(draftRenderTimerRef.current)
        draftRenderTimerRef.current = undefined
      }
      flushPendingStoreDraft()
    }
  }, [flushPendingStoreDraft])

  useEffect(() => {
    const wasBusy = previousBusyRef.current
    previousBusyRef.current = props.isBusy

    if (!wasBusy || props.isBusy) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      focusEditorAtDraftCursor()
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [focusEditorAtDraftCursor, props.isBusy])

  function syncEditorCursorToDraft() {
    const editor = editorRef.current
    if (!editor) return
    const currentCursor = getCursorPosition(editor)
    setCursorOffset(currentCursor)
    updateDraftCursorFromComposer(currentCursor, "debounced")
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
    const currentDraft = draftRef.current
    const currentEditorValue = serializePromptEditorParts(currentDraft.parts)
    const readingSelectionParts = currentDraft.parts.filter(
      (part): part is Extract<PromptComposerPart, { type: typeof READING_SELECTION_PART_TYPE }> =>
        part.type === READING_SELECTION_PART_TYPE,
    )
    if (!editor) {
      return {
        value: currentEditorValue,
        parts: clonePromptParts(currentDraft.parts),
        attachments: cloneAttachments(currentDraft.attachments),
        cursor: currentDraft.cursor,
      }
    }

    const editorParts = collectPromptParts(editor)
    const parts = [...readingSelectionParts, ...editorParts]
    const value = serializePromptEditorParts(editorParts)
    const cursor = getCursorPosition(editor)
    return {
      value,
      parts,
      attachments: cloneAttachments(currentDraft.attachments),
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

    const currentDraft = draftRef.current
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

    const currentDraft = draftRef.current
    const readingSelectionParts = currentDraft.parts.filter(
      (part): part is Extract<PromptComposerPart, { type: typeof READING_SELECTION_PART_TYPE }> =>
        part.type === READING_SELECTION_PART_TYPE,
    )
    const nextEditorParts = collectPromptParts(editor)
    const nextParts = [...readingSelectionParts, ...nextEditorParts]
    const nextValue = serializePromptEditorParts(nextEditorParts)
    const nextCursor = getCursorPosition(editor)
    const hasInlineStructuredPart = nextEditorParts.some(
      (part) => part.type !== PROMPT_PART_TYPE_TEXT,
    )
    const shouldReset =
      !NON_EMPTY_TEXT.test(nextValue) &&
      currentDraft.attachments.length === 0 &&
      !hasInlineStructuredPart

    setPlaceholderVisible(shouldReset && readingSelectionParts.length === 0)
    startTransition(() => {
      setCursorOffset(nextCursor)
    })
    viewState.setDismissedMentionKey(undefined)
    viewState.setDismissedSlashKey(undefined)

    if (shouldReset && readingSelectionParts.length === 0) {
      resetHistoryNavigation()
      replaceDraftFromComposer(
        {
          value: "",
          parts: [],
          attachments: currentDraft.attachments,
          cursor: 0,
        },
        "debounced",
        "transition",
      )
      return
    }

    if (shouldReset) {
      resetHistoryNavigation()
      replaceDraftFromComposer(
        {
          value: "",
          parts: readingSelectionParts,
          attachments: currentDraft.attachments,
          cursor: 0,
        },
        "debounced",
        "transition",
      )
      return
    }

    resetHistoryNavigation()
    replaceDraftFromComposer(
      {
        value: nextValue,
        parts: nextParts,
        attachments: currentDraft.attachments,
        cursor: nextCursor,
      },
      "debounced",
      "transition",
    )
  }

  function insertTextAtSelection(text: string) {
    const editor = editorRef.current
    if (!editor) return

    let selection = window.getSelection()
    if (!selection) return

    if (selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      editor.focus()
      setCursorPosition(editor, draftRef.current.cursor)
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

  function clearComposer(input?: { clearStore?: boolean; resetHistory?: boolean }) {
    if (input?.resetHistory ?? true) {
      resetHistoryNavigation()
    }
    renderEditorAtCursor([], 0)
    pendingStoreDraftRef.current = undefined
    if (storeSyncTimerRef.current !== undefined) {
      window.clearTimeout(storeSyncTimerRef.current)
      storeSyncTimerRef.current = undefined
    }
    if (draftRenderTimerRef.current !== undefined) {
      window.clearTimeout(draftRenderTimerRef.current)
      draftRenderTimerRef.current = undefined
    }
    const emptyDraft = createEmptyPromptDraftState()
    draftRef.current = emptyDraft
    setDraft(emptyDraft)
    setPlaceholderVisible(true)
    if (input?.clearStore ?? true) {
      clearDraft(promptKey)
    }
  }

  function openArcade(input?: { clearDraft?: boolean }) {
    if (isQuestionActive) {
      toast.error("Finish answering the question first!")
      return
    }
    if (input?.clearDraft) {
      clearComposer()
    }
    editorRef.current?.blur()
    setGameVisible(true)
    setPaused(false)
    setMinimized(false)
  }

  function closeArcade() {
    setGameVisible(false)
    setMinimized(false)
    setPaused(true)
    setShowGameBall(false)
  }

  function minimizeArcade() {
    setGameVisible(false)
    setMinimized(true)
    setPaused(true)
  }

  function toggleArcade() {
    if (isGameVisible || isMinimized) {
      closeArcade()
      return
    }
    setShowGameBall(false)
    openArcade()
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
      case "play":
        openArcade({ clearDraft: true })
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
    if (hasUnsupportedImageAttachments) return

    const currentDraft = readEditorDraft()

    // Intercept UI-only slash commands
    const text = currentDraft.value.trim()
    if (text.startsWith("/")) {
      const command = text.slice(1).split(/\s+/)[0]
      if (command === "play") {
        openArcade({ clearDraft: true })
        return
      }
    }

    const currentHasSubmittableParts = hasSubmittablePromptParts(currentDraft.parts)

    if (
      !currentDraft.value.trim() &&
      currentDraft.attachments.length === 0 &&
      !currentHasSubmittableParts
    ) {
      return
    }

    commitDraftToHistory(currentDraft)
    clearComposer({ resetHistory: false })
    props.onSubmit(currentDraft)
  }

  const slashMenuVisible =
    viewState.slashMatch !== undefined && viewState.slashKey !== viewState.dismissedSlashKey
  const mentionMenuVisible =
    viewState.mentionMatch !== undefined && viewState.mentionKey !== viewState.dismissedMentionKey

  const isGamePromptSuggestionAvailable =
    gamePromptPreference !== GAME_PROMPT_PREFERENCE_DISABLED &&
    (gamePromptDismissedUntil === null || gamePromptDismissedUntil <= Date.now())

  const isGamePromptSuggestionActive = showGameBall && isGamePromptSuggestionAvailable

  // The floating ball is now only a minimized-game restore affordance.
  const shouldShowBall = isMinimized && !isGameVisible && !isQuestionActive

  return (
    <div className={cn("relative", props.className ?? "mx-4 mb-4")}>
      {/* Arcade Layer - Rendered outside the main flow to avoid layout shifts/fluctuations */}
      <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 flex flex-col items-end pointer-events-none">
        <div className="w-full pointer-events-auto">
          <AnimatePresence>
            {isGameVisible && (
              <GameDock
                className="w-full"
                onClose={closeArcade}
                onMinimize={minimizeArcade}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="pointer-events-auto">
          <AnimatePresence>
            {shouldShowBall && (
              <GameBall
                onOpen={() => {
                  openArcade()
                }}
                onHide={dismissGameBall}
                onSuggestLessOften={() => {
                  setGamePromptPreference(GAME_PROMPT_PREFERENCE_REDUCED)
                  setShowGameBall(false)
                }}
                onDisableSuggestions={() => {
                  setGamePromptPreference(GAME_PROMPT_PREFERENCE_DISABLED)
                  setShowGameBall(false)
                }}
                onOpenSettings={() => {
                  navigate({ to: "/settings", search: { tab: "general" } })
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {readingSelectionEntries.length > 0 || dismissedSelectionPreviews.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {readingSelectionEntries.map(({ part, key }) => (
            <div
              key={key}
              className="animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-300 transition-all ease-out flex max-w-[min(72%,56ch)] items-center gap-1.5 rounded-lg border border-border-base bg-surface-weak px-2 py-1"
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
              className="animate-out fade-out slide-out-to-top-1 zoom-out-95 duration-200 pointer-events-none flex max-w-[min(72%,56ch)] items-center gap-1.5 rounded-lg border border-border-base bg-surface-weak px-2 py-1 opacity-0"
            >
              <div className="min-w-0 flex-1 truncate text-[11px] leading-4 text-text-base">
                {selection.text}
              </div>
              <span className="inline-flex size-5 shrink-0" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="group/prompt-input relative z-10 rounded-[16px] border bg-surface-raised-base shadow-sm transition-colors has-[:focus-visible]:border-border-interactive-base/45">
        <form
          id="prompt-composer-form"
          data-component="prompt-composer"
          className="relative"
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

            {placeholderVisible ? (
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
              className="min-h-[84px] max-h-[240px] w-full overflow-y-auto rounded-[16px] border-0 bg-transparent px-3 pt-3 pb-12 text-sm leading-6 text-text-base focus:outline-none"
              onInput={() => {
                handleEditorInput()
              }}
              onFocus={() => {
                const editor = editorRef.current
                if (!editor) return

                const selection = window.getSelection()
                if (
                  selection &&
                  selection.rangeCount > 0 &&
                  editor.contains(selection.anchorNode)
                ) {
                  const currentCursor = getCursorPosition(editor)
                  setCursorOffset(currentCursor)
                  updateDraftCursorFromComposer(currentCursor, "debounced")
                  return
                }

                const currentDraft = draftRef.current
                const editorValueLength = serializePromptEditorParts(currentDraft.parts).length
                const nextCursor = Math.max(0, Math.min(currentDraft.cursor, editorValueLength))
                setCursorPosition(editor, nextCursor)
                setCursorOffset(nextCursor)
                updateDraftCursorFromComposer(nextCursor, "debounced")
              }}
              onClick={() => {
                syncEditorCursorToDraft()
              }}
              onKeyDown={(event) => {
                // No longer preventing composer from reacting when game is visible
                // Game keydown handlers now check document.activeElement

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
                        (current - 1 + viewState.slashOptions.length) %
                        viewState.slashOptions.length,
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

                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  const currentDraft = readEditorDraft()
                  const direction = event.key === "ArrowUp" ? "up" : "down"
                  if (
                    !canNavigateHistoryAtCursor(
                      direction,
                      currentDraft.value,
                      currentDraft.cursor,
                      historyIndex !== -1,
                    )
                  ) {
                    return
                  }

                  const result = navigatePromptHistory({
                    direction,
                    entries: historyEntries,
                    historyIndex,
                    current: currentDraft,
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
              onKeyUp={(event) => {
                if (!CURSOR_NAVIGATION_KEYS.has(event.key)) return
                syncEditorCursorToDraft()
              }}
              onPaste={(event) => {
                const clipboardData = event.clipboardData
                if (!clipboardData) return

                const items = Array.from(clipboardData.items)
                const fileItems = items.filter((item) => item.kind === "file")
                const imageItems = fileItems.filter((item) =>
                  ACCEPTED_FILE_TYPES.includes(item.type),
                )

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
              This model cannot accept image attachments. Remove the image or switch to a vision
              model before sending.
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
      </div>

      {props.sessionContextUsage ? (
        <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
          <div className="flex min-w-0 items-center gap-1.5">
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
            {props.contextActions}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  data-action="prompt-open-arcade"
                  aria-label={
                    isGameVisible || isMinimized
                      ? language.t("game.footer.closeAria")
                      : language.t("game.footer.openAria")
                  }
                  aria-pressed={isGameVisible || isMinimized}
                  title={
                    isGameVisible || isMinimized
                      ? language.t("game.footer.closeTitle")
                      : language.t("game.footer.openTitle")
                  }
                  onClick={toggleArcade}
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-md text-text-weaker transition-all hover:bg-surface-base-hover hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base/50 active:scale-95",
                    isMinimized &&
                      "bg-surface-base-hover text-text-base ring-1 ring-border-weak-base/80",
                    isGameVisible &&
                      "bg-surface-interactive-base text-text-on-interactive-base shadow-sm shadow-surface-interactive-base/30 ring-1 ring-border-interactive-base/60",
                    isGamePromptSuggestionActive &&
                      "animate-pulse bg-surface-base-hover text-text-base ring-1 ring-border-interactive-base/60",
                  )}
                >
                  <Gamepad2Icon className="size-3.5" />
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={dismissGameBall}>
                  {language.t("game.ball.hide")}
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    setGamePromptPreference(GAME_PROMPT_PREFERENCE_REDUCED)
                    setShowGameBall(false)
                  }}
                >
                  {language.t("game.ball.suggestLessOften")}
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    setGamePromptPreference(GAME_PROMPT_PREFERENCE_DISABLED)
                    setShowGameBall(false)
                  }}
                >
                  {language.t("game.ball.disableSuggestions")}
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    navigate({ to: "/settings", search: { tab: "general" } })
                  }}
                >
                  {language.t("game.ball.openSettings")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {props.sessionContextUsage}
          </div>
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
