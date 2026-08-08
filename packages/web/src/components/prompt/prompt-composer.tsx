import "./composer-surfaces.css"
import { NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT } from "@buddy/workspace-file-policy"
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
import { Gamepad2Icon, PenLineIcon } from "@/icons/app-icons"
import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { readerTextAnchorKey } from "@buddy/reader-contract"
import { language } from "@/context/language"
import { GameDock } from "../game/game-dock"
import { GameBall } from "../game/game-ball"
import { DEVELOPMENT_FEATURES_ENABLED } from "@/lib/development-features"
import type { TodoSnapshot } from "@/components/chat/tools/todo-state"
import { TodoDock } from "./todo-dock"
import { TodoDockIndicator } from "./todo-dock-indicator"
import {
  TODO_DOCK_MODE_HIDDEN,
  TODO_DOCK_MODE_OPEN,
  resetTodoDockAfterTurn,
  reconcileTodoDockViewState,
  todoDockModeForScope,
  type TodoDockViewState,
} from "./todo-dock-state"
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
  getMentionMatch,
  type MentionOption,
  type MentionableAgent,
  type MentionableFile,
  type MentionableReference,
} from "./mention-autocomplete"
import {
  clonePromptParts,
  collectPromptParts,
  createPromptPartsFromValue,
  createPromptPill,
  createSkillPart,
  promptPartFromMentionOption,
  refreshSkillPills,
  renderPromptParts,
  serializePromptAutocompleteValue,
  serializePromptEditorParts,
} from "./prompt-parts"
import {
  getSlashMatch,
  type SlashCommandOption,
  type SlashCommandSource,
} from "./slash-autocomplete"
import { PromptAutocompleteMenu } from "./components/prompt-autocomplete-menu"
import { PromptComposerToolbar } from "./components/prompt-composer-toolbar"
import {
  PROMPT_PART_TYPE_TEXT,
  READING_SELECTION_PART_TYPE,
  SELECTION_CONTEXT_PART_TYPE,
  type PromptComposerAttachment,
  type PromptComposerPart,
} from "./prompt-types"
import {
  ACCEPTED_FILE_TYPES,
  ACCEPTED_NON_IMAGE_FILE_TYPES,
  attachmentRequiresVisionInput,
  cloneAttachments,
} from "./attachment-utils"
import { ImageAttachments } from "./image-attachments"
import { useSkillPresentationLookup } from "../skills/skill-presentation"
import { SelectionClip, type SelectionClipData } from "./selection-clip"
import { usePromptComposerAttachments } from "./use-prompt-composer-attachments"
import { usePromptComposerViewState } from "./use-prompt-composer-view-state"
import { usePromptEditorSync } from "./use-prompt-editor-sync"
import {
  resolveComposerAccessoryPresentation,
  resolveComposerReplacementHeight,
  COMPOSER_ACCESSORY_LAYOUT,
  type ComposerAccessoryLayout,
} from "./composer-accessory-layout"
import {
  SURFACE_REVEAL_BAND_VARIANTS,
  SURFACE_REVEAL_VARIANT,
  resolveSurfaceRevealTransition,
  resolveSurfaceRevealVariants,
} from "@/lib/surface-reveal-motion"
import type { SketchAttachmentFlush } from "./sketch-dock"
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

const SKETCH_IMAGE_MODEL_SUGGESTION_LIMIT = 4
const PROMPT_EDITOR_REGULAR_SIZE_CLASS = "min-h-[72px] max-h-[240px] pb-12"
const PROMPT_EDITOR_COMPACT_SIZE_CLASS = "min-h-[56px] max-h-[120px] pb-3"

const SketchDock = lazy(async () => {
  const module = await import("./sketch-dock")
  return { default: module.SketchDock }
})

type PromptComposerProps = {
  directory: string
  sessionID?: string
  isBusy: boolean
  personaOptions: Array<{
    name: string
    label?: string
  }>
  mentionableAgents: MentionableAgent[]
  mentionableReferences: MentionableReference[]
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
  modelMenuOpenRequest?: number
  onClearPendingSteer?: () => void
  onPersonaChange: (persona: string) => void
  onModelChange: (model: string) => void
  onThinkingChange: (thinking: string) => void
  onSubmit: (draft: Omit<PromptDraftState, "updatedAt">) => void | Promise<void>
  onAbort: () => void
  onNewSession: () => void
  onOpenSettings?: () => void
  onOpenMcpDialog?: () => void
  onSearchFiles?: (query: string) => Promise<MentionableFile[]>
  onRefreshSlashCommands?: () => void
  selectorMode?: PromptSelectMode
  className?: string
  sessionContextUsage?: React.ReactNode
  contextActions?: React.ReactNode
  activeQuestionID?: string
  compact?: boolean
  todoSnapshot?: TodoSnapshot
  accessoryLayout?: ComposerAccessoryLayout
  /**
   * When provided, the composer publishes an imperative attachment API onto this
   * ref so an ancestor can forward files dropped anywhere in the chat area.
   */
  attachmentsApiRef?: React.RefObject<PromptComposerAttachmentsApi | null>
}

/**
 * Imperative handle exposed by {@link PromptComposer} so an ancestor (e.g. the
 * chat main pane) can route dropped files into the composer's attachment state,
 * letting the whole chat area act as a single dropzone.
 */
export type PromptComposerAttachmentsApi = {
  addAttachments: (files: FileList | File[]) => void
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

type SelectionContextChipPart = Extract<
  PromptComposerPart,
  { type: typeof READING_SELECTION_PART_TYPE | typeof SELECTION_CONTEXT_PART_TYPE }
>

function isSelectionContextChipPart(part: PromptComposerPart): part is SelectionContextChipPart {
  return part.type === READING_SELECTION_PART_TYPE || part.type === SELECTION_CONTEXT_PART_TYPE
}

function buildSelectionContextEntryKey(part: SelectionContextChipPart) {
  const anchorKey = part.anchor ? readerTextAnchorKey(part.anchor) : ""
  return (
    part.selectionKey ??
    `${"path" in part ? (part.path ?? "") : ""}:${"version" in part ? (part.version ?? "") : ""}:${anchorKey}:${
      "tocLabel" in part ? (part.tocLabel ?? "") : ""
    }:${"pageLabel" in part ? (part.pageLabel ?? "") : ""}:${part.text}`
  )
}

type DismissedSelectionPreview = {
  key: string
  data: SelectionClipData
}

/** Map a composer selection-context part onto the shared clip's data shape. */
function selectionClipDataFromChipPart(part: SelectionContextChipPart): SelectionClipData {
  return {
    text: part.text,
    ...("source" in part && part.source ? { source: part.source } : {}),
    ...("path" in part && part.path ? { path: part.path } : {}),
    ...("headingPath" in part && part.headingPath ? { headingPath: part.headingPath } : {}),
    ...(part.tocLabel ? { tocLabel: part.tocLabel } : {}),
    ...(part.pageLabel ? { pageLabel: part.pageLabel } : {}),
    ...(part.locationLabel ? { locationLabel: part.locationLabel } : {}),
  }
}

function createEmptyPromptDraftState() {
  return normalizePromptDraft({
    value: "",
    parts: [],
    attachments: [],
    cursor: 0,
  })
}

function cssPixelValue(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function measureNonAccessoryComposerHeight(input: {
  root: HTMLElement
  accessoryHost: HTMLElement | null
}): number {
  const rootHeight = input.root.getBoundingClientRect().height
  const accessoryHostHeight = input.accessoryHost?.getBoundingClientRect().height ?? 0
  const rootStyle = window.getComputedStyle(input.root)
  const outerMargin =
    cssPixelValue(rootStyle.marginBlockStart) + cssPixelValue(rootStyle.marginBlockEnd)

  return Math.max(0, rootHeight - accessoryHostHeight + outerMargin)
}

type ComposerAccessoryMotionHostProps = {
  children: React.ReactNode
  hostRef: { current: HTMLDivElement | null }
}

function ComposerAccessoryMotionHost(props: ComposerAccessoryMotionHostProps) {
  const reduceMotion = useReducedMotion() === true
  const setHostRef = useCallback(
    (element: HTMLDivElement | null) => {
      props.hostRef.current = element
    },
    [props.hostRef],
  )
  const surfaceVariants = useMemo(() => resolveSurfaceRevealVariants(reduceMotion), [reduceMotion])

  return (
    <motion.div
      ref={setHostRef}
      variants={SURFACE_REVEAL_BAND_VARIANTS}
      initial={SURFACE_REVEAL_VARIANT.enter}
      animate={SURFACE_REVEAL_VARIANT.visible}
      exit={SURFACE_REVEAL_VARIANT.exit}
      className="overflow-visible"
      data-component="prompt-composer-accessory-motion-host"
    >
      <motion.div variants={surfaceVariants} className="pb-2">
        {props.children}
      </motion.div>
    </motion.div>
  )
}

export function PromptComposer(props: PromptComposerProps) {
  const isQuestionActive = props.activeQuestionID !== undefined
  const reduceMotion = useReducedMotion() === true
  const composerRootRef = useRef<HTMLDivElement | null>(null)
  const accessoryHostRef = useRef<HTMLDivElement | null>(null)
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
  const skillPresentation = useSkillPresentationLookup(props.directory)
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
  const [sketchDockOpen, setSketchDockOpen] = useState(false)
  const [todoDockViewState, setTodoDockViewState] = useState<TodoDockViewState>({})
  const [measuredComposerHeight, setMeasuredComposerHeight] = useState<number>()
  const sketchAttachmentRef = useRef<PromptComposerAttachment | undefined>(undefined)
  const flushSketchAttachmentRef = useRef<SketchAttachmentFlush | undefined>(undefined)
  const todoDockMode = todoDockModeForScope(todoDockViewState, promptKey)
  const todoCount = props.todoSnapshot?.todos.length ?? 0
  const hasTodos = todoCount > 0
  const todoDockOpen = hasTodos && todoDockMode === TODO_DOCK_MODE_OPEN
  const accessoryPresentation = resolveComposerAccessoryPresentation({
    layout: props.accessoryLayout,
    measuredComposerHeight,
  })
  const { accessoryBudget, largeAccessoryHeight, todoPresentation, todoAccessoryHeight } =
    accessoryPresentation
  const composerReplacementHeight = resolveComposerReplacementHeight(props.accessoryLayout)

  useLayoutEffect(() => {
    const root = composerRootRef.current
    const layout = props.accessoryLayout
    if (!root || !layout || layout.paneHeight <= 0) {
      setMeasuredComposerHeight(undefined)
      return
    }

    const syncComposerHeight = () => {
      if (!root.querySelector('[data-component="prompt-composer"]')) return
      const nextComposerHeight = measureNonAccessoryComposerHeight({
        root,
        accessoryHost: accessoryHostRef.current,
      })
      setMeasuredComposerHeight((current) =>
        current === nextComposerHeight ? current : nextComposerHeight,
      )
    }

    syncComposerHeight()
    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(syncComposerHeight)
    observer.observe(root)
    return () => observer.disconnect()
  }, [props.accessoryLayout])

  const selectionContextEntries = useMemo(
    () =>
      draft.parts.flatMap((part) =>
        isSelectionContextChipPart(part)
          ? [{ part, key: buildSelectionContextEntryKey(part) }]
          : [],
      ),
    [draft.parts],
  )
  const draftEditorParts = useMemo(
    () => draft.parts.filter((part) => !isSelectionContextChipPart(part)),
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
  const showPersonaSelector = DEVELOPMENT_FEATURES_ENABLED && props.personaOptions.length > 1
  const copyingResourceCount = draft.attachments.filter(
    (attachment) => attachment.kind === "native-resource" && attachment.status === "copying",
  ).length
  const failedResourceCount = draft.attachments.filter(
    (attachment) => attachment.kind === "native-resource" && attachment.status === "error",
  ).length
  const hasUnreadyNativeResources = copyingResourceCount > 0 || failedResourceCount > 0
  const nativeResourceSendDisabledReason =
    copyingResourceCount > 0
      ? "Wait for every document to finish copying before sending."
      : failedResourceCount > 0
        ? "Retry or remove every document whose copy failed before sending."
        : undefined
  const canSubmit = useMemo(
    () =>
      !hasUnsupportedImageAttachments &&
      !hasUnreadyNativeResources &&
      (draftEditorValue.trim().length > 0 || draft.attachments.length > 0 || hasSubmittableParts),
    [
      draft.attachments.length,
      draftEditorValue,
      hasSubmittableParts,
      hasUnsupportedImageAttachments,
      hasUnreadyNativeResources,
    ],
  )
  const [cursorOffset, setCursorOffset] = useState(() => draft.cursor)
  // Live editor snapshot that drives @/ autocomplete matching. Updated
  // synchronously on every keystroke/cursor move so the menu never lags behind
  // the DOM (the heavier `draft`/store writes stay debounced). Decoupling this
  // from the debounced `draftEditorValue` is what removes the open/close flicker
  // and keeps the insert range aligned with what the user actually typed. The
  // value is pill-masked (see serializePromptAutocompleteValue) so `@`/`/`
  // inside a pill's serialized path never trigger the menu.
  const [autocompleteInput, setAutocompleteInput] = useState(() => ({
    value: serializePromptAutocompleteValue(draft.parts),
    cursor: draft.cursor,
  }))
  // Push the editor's live text + cursor into the snapshot that drives
  // autocomplete. Cheap, and the only source of truth the menu should trust.
  const syncAutocompleteInputFromEditor = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const value = serializePromptAutocompleteValue(collectPromptParts(editor))
    const cursor = getCursorPosition(editor)
    setAutocompleteInput((current) =>
      current.value === value && current.cursor === cursor ? current : { value, cursor },
    )
  }, [])
  const [localModelMenuOpenRequest, setLocalModelMenuOpenRequest] = useState(0)
  const modelMenuOpenRequest = localModelMenuOpenRequest + (props.modelMenuOpenRequest ?? 0)
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

  const todoAutoOpenBlocked = sketchDockOpen || isGameVisible
  const todoBelongsToCurrentTurn = props.todoSnapshot?.isCurrentTurn === true
  const todoRevision = props.todoSnapshot?.revision
  useEffect(() => {
    if (!todoRevision) return
    if (hasTodos && (!props.isBusy || !todoBelongsToCurrentTurn)) return
    setTodoDockViewState((current) =>
      reconcileTodoDockViewState({
        current,
        scope: promptKey,
        hasTodos,
        autoOpenBlocked: todoAutoOpenBlocked,
      }),
    )
  }, [
    hasTodos,
    promptKey,
    props.isBusy,
    todoAutoOpenBlocked,
    todoBelongsToCurrentTurn,
    todoRevision,
  ])

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
    cursorOffset: autocompleteInput.cursor,
    draftValue: autocompleteInput.value,
    mentionableAgents: props.mentionableAgents,
    mentionableReferences: props.mentionableReferences,
    slashCommands: props.slashCommands,
    modelOptions: props.modelOptions,
    skillPresentation,
    onSearchFiles: props.onSearchFiles,
    onRefreshSlashCommands: props.onRefreshSlashCommands,
  })
  const sketchImageModelOptions = useMemo(
    () =>
      [
        ...viewState.groupedModelOptions.ungrouped,
        ...viewState.groupedModelOptions.grouped.flatMap(([, options]) => options),
      ]
        .filter((option) => option.acceptsImages && !option.disabled)
        .slice(0, SKETCH_IMAGE_MODEL_SUGGESTION_LIMIT)
        .map((option) => ({ key: option.key, label: option.label })),
    [viewState.groupedModelOptions],
  )

  useEffect(() => {
    if (cursorOffset <= draftEditorValue.length) return
    setCursorOffset(draftEditorValue.length)
  }, [cursorOffset, draftEditorValue])

  // When the draft changes from outside the editor (session switch, clear,
  // history), usePromptEditorSync re-renders the editor DOM; realign the
  // autocomplete snapshot from that freshly rendered DOM. Editor-originated
  // changes skip this path (mirror flag) — handleEditorInput already synced
  // synchronously — so the debounced draft can never stomp the live snapshot
  // with stale text mid-typing.
  const setCursorOffsetFromEditorSync = useCallback(
    (cursor: number) => {
      setCursorOffset(cursor)
      syncAutocompleteInputFromEditor()
    },
    [syncAutocompleteInputFromEditor],
  )

  usePromptEditorSync({
    editorRef,
    mirrorInputRef,
    draft: {
      ...draft,
      value: draftEditorValue,
      parts: draftEditorParts,
    },
    knownAgents: viewState.knownAgents,
    skillPresentation,
    setCursorOffset: setCursorOffsetFromEditorSync,
  })

  // Presentations land after the first paint, and a restored draft's skill pills
  // are already on screen by then — repaint them where they stand instead of
  // re-rendering the editor under the caret.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    refreshSkillPills(editor, skillPresentation)
  }, [skillPresentation])

  const previousSelectionContextCountRef = useRef(selectionContextEntries.length)
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
    (
      update:
        | PromptComposerAttachment[]
        | ((attachments: PromptComposerAttachment[]) => PromptComposerAttachment[]),
    ) => {
      const currentDraft = draftRef.current
      const attachments = typeof update === "function" ? update(currentDraft.attachments) : update
      replaceDraftFromComposer({
        value: currentDraft.value,
        parts: currentDraft.parts,
        attachments,
        cursor: currentDraft.cursor,
      })
    },
    [replaceDraftFromComposer],
  )

  const discardTransientAttachments = useCallback(
    (scopeKey: string) => {
      const scopedDraft = getPromptDraft(usePromptStore.getState(), scopeKey)
      const attachments = scopedDraft.attachments.filter(
        (attachment) => attachment.kind !== "native-resource" || attachment.status === "ready",
      )
      if (attachments.length === scopedDraft.attachments.length) return
      replaceDraft(scopeKey, {
        value: scopedDraft.value,
        parts: scopedDraft.parts,
        attachments,
        cursor: scopedDraft.cursor,
      })
    },
    [replaceDraft],
  )

  const attachmentState = usePromptComposerAttachments({
    scopeKey: promptKey,
    directory: props.directory,
    attachments: draft.attachments,
    setDraftAttachments: setDraftAttachmentsFromComposer,
    discardTransientAttachments,
    resetHistoryNavigation,
    acceptsImages: props.selectedModelAcceptsImages,
    onUnsupportedImages: () => {
      toast.error("This model cannot accept image attachments.")
    },
    onUnsupportedFiles: () => {
      toast.error("This file type is not supported.")
    },
    onNativeResourceLimitExceeded: () => {
      toast.error(`You can attach up to ${NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT} documents at once.`)
    },
  })

  // Keep the latest (unmemoized) addAttachments callback in a ref so the
  // imperative handle stays stable while always calling the current closure.
  const addAttachmentsRef = useRef(attachmentState.addAttachments)
  addAttachmentsRef.current = attachmentState.addAttachments
  useImperativeHandle(
    props.attachmentsApiRef,
    () => ({
      addAttachments: (files: FileList | File[]) => addAttachmentsRef.current(files),
    }),
    [],
  )

  const updateSketchAttachment = useCallback((attachment: PromptComposerAttachment | undefined) => {
    sketchAttachmentRef.current = attachment
  }, [])

  const updateSketchFlush = useCallback((flush: SketchAttachmentFlush | undefined) => {
    flushSketchAttachmentRef.current = flush
  }, [])

  const deactivateSketchDock = useCallback(() => {
    setSketchDockOpen(false)
    updateSketchAttachment(undefined)
  }, [updateSketchAttachment])

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
    const previous = previousSelectionContextCountRef.current
    previousSelectionContextCountRef.current = selectionContextEntries.length
    if (selectionContextEntries.length <= previous) return

    focusEditorAtDraftCursor()
  }, [focusEditorAtDraftCursor, selectionContextEntries.length])

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
      if (wasBusy) {
        setTodoDockViewState((current) => resetTodoDockAfterTurn(current, promptKey))
      }
      // Auto-pause game when turn completes (transitions from busy to idle)
      if (wasBusy && isGameVisible) {
        setPaused(true)
        setMinimized(true)
        setGameVisible(false)
      }
    }
  }, [
    props.isBusy,
    busyStartTime,
    isGameVisible,
    promptKey,
    setPaused,
    setMinimized,
    setGameVisible,
  ])

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
    const remainingMs = Math.max(promptDelayRemainingMs, dismissRemainingMs, lastShownRemainingMs)
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
    syncAutocompleteInputFromEditor()
    updateDraftCursorFromComposer(currentCursor, "debounced")
  }

  function renderEditorAtCursor(parts: PromptComposerPart[], cursor: number, focus = false) {
    const editor = editorRef.current
    if (!editor) return
    renderPromptParts(editor, parts, skillPresentation)
    if (focus) {
      editor.focus()
    }
    setCursorPosition(editor, cursor)
    setCursorOffset(cursor)
    syncAutocompleteInputFromEditor()
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
    const selectionContextParts = nextParts.filter(isSelectionContextChipPart)
    const editorParts = nextParts.filter((part) => !isSelectionContextChipPart(part))
    const nextValue = next.parts.length > 0 ? serializePromptEditorParts(nextParts) : next.value
    const nextCursor = cursor === "start" ? 0 : nextValue.length
    renderEditorAtCursor(editorParts, nextCursor, true)
    replaceDraftFromComposer({
      value: nextValue,
      parts: [...selectionContextParts, ...editorParts],
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
    const selectionContextParts = currentDraft.parts.filter(isSelectionContextChipPart)
    if (!editor) {
      return {
        value: currentEditorValue,
        parts: clonePromptParts(currentDraft.parts),
        attachments: cloneAttachments(currentDraft.attachments),
        cursor: currentDraft.cursor,
      }
    }

    const editorParts = collectPromptParts(editor)
    const parts = [...selectionContextParts, ...editorParts]
    const value = serializePromptEditorParts(editorParts)
    const cursor = getCursorPosition(editor)
    return {
      value,
      parts,
      attachments: cloneAttachments(currentDraft.attachments),
      cursor,
    }
  }

  function removeSelectionContextByKey(key: string) {
    const dismissedSelection = selectionContextEntries.find((entry) => entry.key === key)
    if (dismissedSelection) {
      setDismissedSelectionPreviews((current) => [
        ...current,
        { key, data: selectionClipDataFromChipPart(dismissedSelection.part) },
      ])
      window.setTimeout(() => {
        setDismissedSelectionPreviews((current) =>
          current.filter((selection) => selection.key !== key),
        )
      }, 220)
    }

    const currentDraft = draftRef.current
    const nextParts = currentDraft.parts.filter((part) => {
      if (!isSelectionContextChipPart(part)) return true
      if (part.selectionKey) {
        return part.selectionKey !== key
      }
      return buildSelectionContextEntryKey(part) !== key
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
    const selectionContextParts = currentDraft.parts.filter(isSelectionContextChipPart)
    const nextEditorParts = collectPromptParts(editor)
    const nextParts = [...selectionContextParts, ...nextEditorParts]
    const nextValue = serializePromptEditorParts(nextEditorParts)
    const nextCursor = getCursorPosition(editor)
    const hasInlineStructuredPart = nextEditorParts.some(
      (part) => part.type !== PROMPT_PART_TYPE_TEXT,
    )
    const shouldReset =
      !NON_EMPTY_TEXT.test(nextValue) &&
      currentDraft.attachments.length === 0 &&
      !hasInlineStructuredPart

    setPlaceholderVisible(shouldReset && selectionContextParts.length === 0)
    // Keep autocomplete matching perfectly in step with the DOM (synchronous),
    // while the cursor/draft/store writes below stay low-priority + debounced.
    setAutocompleteInput({
      value: serializePromptAutocompleteValue(nextEditorParts),
      cursor: nextCursor,
    })
    startTransition(() => {
      setCursorOffset(nextCursor)
    })
    viewState.setDismissedMentionKey(undefined)
    viewState.setDismissedSlashKey(undefined)

    if (shouldReset && selectionContextParts.length === 0) {
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
          parts: selectionContextParts,
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

  // Replace the live `@`/`/` trigger span with `node` + a trailing space. The
  // trigger range is re-derived from the LIVE editor (never the debounced React
  // snapshot) so a fast typist never strands query text next to the inserted pill
  // ("@why…" -> pill + "hy"), and it works wherever the trigger sits — including
  // after an existing pill.
  function applyTriggerSelection(kind: "mention" | "slash", node: Node) {
    const editor = editorRef.current
    if (!editor) return

    const selection = window.getSelection()
    if (!selection) return

    if (selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      editor.focus()
      setCursorPosition(editor, autocompleteInput.cursor)
    }

    if (selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.startContainer)) return

    const liveCursor = getCursorPosition(editor)
    const liveValue = serializePromptAutocompleteValue(collectPromptParts(editor))
    const match =
      kind === "mention"
        ? getMentionMatch(liveValue, liveCursor)
        : getSlashMatch(liveValue, liveCursor)

    // Replace the live trigger span when there is one; otherwise insert at the
    // cursor (mirrors opencode's addPart, which never drops the selection).
    if (match) {
      setRangeEdge(editor, range, "start", match.start)
      setRangeEdge(editor, range, "end", match.end)
    }
    range.deleteContents()

    const gap = document.createTextNode(" ")
    range.insertNode(gap)
    range.insertNode(node)
    range.setStartAfter(gap)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    handleEditorInput()
  }

  function applyMention(option: MentionOption) {
    if (option.type === "file") {
      viewState.appendRecentMentionFile({ path: option.path, recent: true })
    }
    viewState.setDismissedMentionKey(undefined)
    applyTriggerSelection("mention", createPromptPill(promptPartFromMentionOption(option)))
  }

  function clearComposer(input?: { clearStore?: boolean; resetHistory?: boolean }) {
    deactivateSketchDock()
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
    if (sketchDockOpen) {
      closeSketchDock()
    }
    if (todoDockOpen) {
      hideTodoDock()
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

  function openSketchDock() {
    setGameVisible(false)
    setMinimized(false)
    setPaused(true)
    setShowGameBall(false)
    if (todoDockOpen) {
      hideTodoDock()
    }
    editorRef.current?.blur()
    setSketchDockOpen(true)
  }

  function closeSketchDock() {
    deactivateSketchDock()
  }

  function toggleSketchDock() {
    if (sketchDockOpen) {
      closeSketchDock()
      return
    }
    openSketchDock()
  }

  function hideTodoDock() {
    setTodoDockViewState((current) => ({
      ...current,
      [promptKey]: TODO_DOCK_MODE_HIDDEN,
    }))
  }

  function openTodoDock() {
    if (!hasTodos) return
    if (sketchDockOpen) {
      closeSketchDock()
    }
    setGameVisible(false)
    setMinimized(false)
    setPaused(true)
    setShowGameBall(false)
    setTodoDockViewState((current) => ({
      ...current,
      [promptKey]: TODO_DOCK_MODE_OPEN,
    }))
  }

  function toggleTodoDock() {
    if (todoDockOpen) {
      hideTodoDock()
      return
    }
    openTodoDock()
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
      case "model":
        clearComposer()
        setLocalModelMenuOpenRequest((current) => current + 1)
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

    viewState.setDismissedSlashKey(undefined)
    // Skills read as inline pills (icon + name); other commands stay literal
    // `/name` text. Either way we replace only the trigger span, so a command
    // picked after a mention doesn't wipe what's already in the composer.
    const node =
      command.source === "skill"
        ? createPromptPill(createSkillPart(command.name), skillPresentation)
        : document.createTextNode(`/${command.name}`)
    applyTriggerSelection("slash", node)
  }

  async function completeSketchInput() {
    if (!props.selectedModelAcceptsImages) return
    const attachment = (await flushSketchAttachmentRef.current?.()) ?? sketchAttachmentRef.current
    if (!attachment) {
      toast.error("Could not prepare the sketch.")
      return
    }

    resetHistoryNavigation()
    setDraftAttachmentsFromComposer((attachments) => [
      ...attachments.filter((candidate) => candidate.id !== attachment.id),
      attachment,
    ])
    deactivateSketchDock()
    setFocusRequestID((current) => current + 1)
  }

  async function handleSubmit() {
    if (hasUnsupportedImageAttachments || hasUnreadyNativeResources) return

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
    void props.onSubmit(currentDraft)
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
  const shouldShowBall =
    isMinimized &&
    !isGameVisible &&
    !isQuestionActive &&
    (accessoryBudget === undefined ||
      accessoryBudget >= COMPOSER_ACCESSORY_LAYOUT.task.minimumDocumentHeightPx)
  const showGameReplacement = isGameVisible && largeAccessoryHeight === undefined
  const gameDockHeight = showGameReplacement ? composerReplacementHeight : largeAccessoryHeight
  const showTodoAccessory = todoDockOpen && props.todoSnapshot && todoPresentation !== "hidden"
  const showAccessoryHost = isGameVisible || showTodoAccessory || shouldShowBall
  const surfaceTransition = resolveSurfaceRevealTransition(reduceMotion)

  return (
    <div ref={composerRootRef} className={cn("relative", props.className ?? "mx-4 mb-4")}>
      <AnimatePresence initial={false}>
        {showAccessoryHost ? (
          <ComposerAccessoryMotionHost hostRef={accessoryHostRef}>
            <div
              className="flex w-full flex-col gap-2"
              data-component="prompt-composer-accessory-host"
            >
              {isGameVisible && gameDockHeight !== undefined ? (
                <GameDock
                  className="composer-surface-floating composer-grain w-full"
                  height={gameDockHeight}
                  onClose={closeArcade}
                  onMinimize={minimizeArcade}
                />
              ) : null}

              {showTodoAccessory && props.todoSnapshot ? (
                <TodoDock
                  className="composer-surface-floating composer-grain w-full"
                  height={todoAccessoryHeight}
                  todos={props.todoSnapshot.todos}
                  turnActive={props.isBusy}
                  onHide={hideTodoDock}
                />
              ) : null}

              {shouldShowBall ? (
                <div className="flex h-10 justify-end">
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
                      props.onOpenSettings?.()
                    }}
                  />
                </div>
              ) : null}
            </div>
          </ComposerAccessoryMotionHost>
        ) : null}
      </AnimatePresence>

      {!sketchDockOpen &&
      !showGameReplacement &&
      (selectionContextEntries.length > 0 || dismissedSelectionPreviews.length > 0) ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectionContextEntries.map(({ part, key }) => (
            <SelectionClip
              key={key}
              variant="chip"
              data={selectionClipDataFromChipPart(part)}
              onRemove={() => removeSelectionContextByKey(key)}
              className="animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-300 ease-out"
            />
          ))}
          {dismissedSelectionPreviews.map((selection) => (
            <SelectionClip
              key={`dismissed_${selection.key}`}
              variant="chip"
              data={selection.data}
              className="animate-out fade-out slide-out-to-top-1 zoom-out-95 pointer-events-none opacity-0 duration-200"
            />
          ))}
        </div>
      ) : null}
      <div className="relative w-full" data-component="prompt-composer-replacement-motion-host">
        <AnimatePresence initial={false} mode="popLayout">
          {sketchDockOpen ? (
            <motion.div
              key="sketch-input"
              initial={{
                opacity: 0,
                transform: reduceMotion
                  ? "translateY(0px) scale(1)"
                  : "translateY(8px) scale(0.985)",
              }}
              animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
              exit={{
                opacity: 0,
                transform: reduceMotion
                  ? "translateY(0px) scale(1)"
                  : "translateY(6px) scale(0.99)",
                transition: surfaceTransition,
              }}
              transition={surfaceTransition}
              className="w-full"
            >
              <Suspense
                fallback={
                  <div
                    className="composer-surface-floating w-full"
                    style={{ height: composerReplacementHeight }}
                  />
                }
              >
                <SketchDock
                  className="composer-surface-floating composer-grain w-full"
                  acceptsImages={props.selectedModelAcceptsImages}
                  benchHost={null}
                  height={composerReplacementHeight}
                  imageModelOptions={sketchImageModelOptions}
                  isMaximized={false}
                  isOpen
                  mode="input"
                  onModelChange={props.onModelChange}
                  onClose={closeSketchDock}
                  onContinue={completeSketchInput}
                  onMinimize={closeSketchDock}
                  onRestore={openSketchDock}
                  onSketchAttachmentChange={updateSketchAttachment}
                  onFlushSketchAttachmentChange={updateSketchFlush}
                />
              </Suspense>
            </motion.div>
          ) : showGameReplacement ? null : (
            <motion.div
              key="prompt-input"
              initial={{
                opacity: 0,
                transform: reduceMotion
                  ? "translateY(0px) scale(1)"
                  : "translateY(4px) scale(0.995)",
              }}
              animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
              exit={{
                opacity: 0,
                transform: reduceMotion
                  ? "translateY(0px) scale(1)"
                  : "translateY(4px) scale(0.995)",
                transition: surfaceTransition,
              }}
              transition={surfaceTransition}
              className="w-full"
            >
              <div className="composer-surface composer-grain composer-shell group/prompt-input relative z-10">
                <form
                  id="prompt-composer-form"
                  data-component="prompt-composer"
                  className="relative"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleSubmit()
                  }}
                >
                  <ImageAttachments
                    attachments={draft.attachments}
                    unsupportedAttachmentIds={unsupportedImageAttachmentIds}
                    onRemove={attachmentState.removeAttachment}
                    onRetry={attachmentState.retryAttachment}
                    onOpen={attachmentState.openPreviewAttachment}
                  />
                  {hasUnsupportedImageAttachments ? (
                    <div className="mx-3 mt-2 rounded-md border border-border-warning-base bg-surface-warning-weak px-2.5 py-2 text-xs text-text-base">
                      This model cannot accept image attachments. Remove the image or switch to a
                      vision model before sending.
                    </div>
                  ) : null}
                  <div className="relative">
                    <PromptAutocompleteMenu
                      slashVisible={slashMenuVisible}
                      mentionVisible={mentionMenuVisible}
                      showMentionLoading={viewState.showMentionLoading}
                      mentionQuery={viewState.mentionMatch?.query}
                      slashOptions={viewState.slashOptions}
                      slashIndex={viewState.slashIndex}
                      mentionOptions={viewState.mentionOptions}
                      mentionIndex={viewState.mentionIndex}
                      skillPresentation={skillPresentation}
                      onApplySlash={applySlash}
                      onApplyMention={applyMention}
                      onSetSlashIndex={viewState.setSlashIndex}
                      onSetMentionIndex={viewState.setMentionIndex}
                    />

                    {placeholderVisible ? (
                      <div
                        className="pointer-events-none absolute left-3 top-3 right-20 text-sm leading-6 text-text-weaker transition-opacity duration-250 ease-out"
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
                      className={cn(
                        "composer-scroll w-full overflow-y-auto rounded-[16px] border-0 bg-transparent px-3 pt-3 text-sm leading-6 text-text-base focus:outline-none",
                        props.compact
                          ? PROMPT_EDITOR_COMPACT_SIZE_CLASS
                          : PROMPT_EDITOR_REGULAR_SIZE_CLASS,
                      )}
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
                          syncAutocompleteInputFromEditor()
                          updateDraftCursorFromComposer(currentCursor, "debounced")
                          return
                        }

                        const currentDraft = draftRef.current
                        const editorValueLength = serializePromptEditorParts(
                          currentDraft.parts,
                        ).length
                        const nextCursor = Math.max(
                          0,
                          Math.min(currentDraft.cursor, editorValueLength),
                        )
                        setCursorPosition(editor, nextCursor)
                        setCursorOffset(nextCursor)
                        syncAutocompleteInputFromEditor()
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
                          void handleSubmit()
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

                        if (fileItems.length > 0) {
                          event.preventDefault()
                          const files = fileItems.flatMap((item) => {
                            const file = item.getAsFile()
                            return file ? [file] : []
                          })
                          void attachmentState.addAttachments(files)
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
                </form>

                <PromptComposerToolbar
                  pendingSteerLabel={props.pendingSteerLabel}
                  onClearPendingSteer={props.onClearPendingSteer}
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
                  sendDisabledReason={nativeResourceSendDisabledReason}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showPersonaSelector || props.sessionContextUsage ? (
        <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {showPersonaSelector ? (
              props.selectorMode === "native" ? (
                <NativeSelect
                  value={props.selectedPersona}
                  onChange={(event) => props.onPersonaChange(event.currentTarget.value)}
                  size="sm"
                  data-action="prompt-persona-select"
                  wrapperClassName="w-[120px] max-w-[120px] min-w-0"
                  className="h-6 border-0 bg-transparent text-xs text-text-weaker shadow-none hover:bg-transparent focus-visible:text-text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                  aria-label={language.t("prompt.toolbar.aria.persona")}
                >
                  {props.personaOptions.map((persona) => (
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
                    {props.personaOptions.map((persona) => (
                      <SelectItem key={persona.name} value={persona.name}>
                        {persona.label ?? persona.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            ) : null}
            {props.contextActions}
          </div>
          {props.sessionContextUsage ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {hasTodos ? (
                <button
                  type="button"
                  data-action="prompt-open-todos"
                  aria-label={
                    todoDockOpen
                      ? language.t("prompt.todoDock.hideAria")
                      : language.t("prompt.todoDock.openAria")
                  }
                  aria-pressed={todoDockOpen}
                  title={language.t("prompt.todoDock.openTitle")}
                  onClick={toggleTodoDock}
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-md text-text-weaker transition-colors hover:bg-surface-base-hover hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base/50 active:scale-95",
                    todoDockMode === TODO_DOCK_MODE_HIDDEN &&
                      "bg-surface-base-hover text-text-base ring-1 ring-border-weak-base/80",
                    todoDockOpen &&
                      "bg-surface-interactive-base text-text-on-interactive-base shadow-sm shadow-surface-interactive-base/30 ring-1 ring-border-interactive-base/60",
                  )}
                >
                  <TodoDockIndicator
                    revision={props.todoSnapshot?.revision ?? promptKey}
                    todos={props.todoSnapshot?.todos ?? []}
                    turnActive={props.isBusy}
                    isCurrentTurn={props.todoSnapshot?.isCurrentTurn === true}
                    selected={todoDockOpen}
                  />
                </button>
              ) : null}
              <button
                type="button"
                data-action="prompt-open-sketch"
                aria-label={language.t("prompt.composer.openSketchAria")}
                aria-pressed={sketchDockOpen}
                title={language.t("prompt.composer.openSketchTitle")}
                onClick={toggleSketchDock}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-md text-text-weaker transition-all hover:bg-surface-base-hover hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base/50 active:scale-95",
                  sketchDockOpen &&
                    "bg-surface-interactive-base text-text-on-interactive-base shadow-sm shadow-surface-interactive-base/30 ring-1 ring-border-interactive-base/60",
                )}
              >
                <PenLineIcon className="size-3.5" />
              </button>
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
                      props.onOpenSettings?.()
                    }}
                  >
                    {language.t("game.ball.openSettings")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              {props.sessionContextUsage}
            </div>
          ) : null}
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
