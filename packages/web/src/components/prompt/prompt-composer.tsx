import {
  ArrowUpIcon,
  Badge,
  BookOpenIcon,
  BrainIcon,
  Dialog,
  DialogContent,
  PlusIcon,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SparklesIcon,
  SquareIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  TargetIcon,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  XIcon,
} from "@buddy/ui"
import { useEffect, useMemo, useRef, useState } from "react"
import { shouldSubmitComposer } from "../../lib/chat-input"
import { createTextFragment, getCursorPosition, setCursorPosition, setRangeEdge } from "./editor-dom"
import {
  canNavigateHistoryAtCursor,
  navigatePromptHistory,
  prependHistoryEntry,
  type PromptHistoryEntry,
} from "./prompt-history"
import { promptPlaceholder } from "./placeholder"
import {
  filterMentionOptions,
  getMentionMatch,
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
import {
  filterSlashCommands,
  getSlashMatch,
  type SlashCommandOption,
  type SlashCommandSource,
} from "./slash-autocomplete"
import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_TEXT,
  type PromptComposerAttachment,
  type PromptComposerPart,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "./prompt-types"
import { ImageAttachments } from "./image-attachments"

type PromptComposerProps = {
  value: string
  attachments: PromptComposerAttachment[]
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
  onChange: (value: string) => void
  onAttachmentsChange: (attachments: PromptComposerAttachment[]) => void
  onPersonaChange: (persona: string) => void
  onIntentChange: (intent: "auto" | "learn" | "practice" | "assess") => void
  onClearPendingSteer?: () => void
  onModelChange: (model: string) => void
  onThinkingChange: (thinking: string) => void
  onSubmit: (input: {
    value: string
    attachments: PromptComposerAttachment[]
    parts: PromptComposerPart[]
  }) => void
  onAbort: () => void
  onNewSession: () => void
  onOpenMcpDialog?: () => void
  onSearchFiles?: (query: string) => Promise<MentionableFile[]>
  onRefreshSlashCommands?: () => void
  historyKey?: string
  className?: string
}

const HISTORY_STORAGE_PREFIX = "buddy.prompt-history.v3"
const MAX_RECENT_MENTION_FILES = 8
const NON_EMPTY_TEXT = /[^\s\u200B]/

const BUILTIN_SLASH_COMMANDS: SlashCommandOption[] = [
  {
    type: "builtin",
    name: "new",
    title: "Start new thread",
    description: "Create a fresh session in this notebook.",
  },
  {
    type: "builtin",
    name: "persona",
    title: "Cycle persona",
    description: "Switch to the next available Buddy persona.",
  },
  {
    type: "builtin",
    name: "model",
    title: "Choose model",
    description: "Open the model picker.",
  },
  {
    type: "builtin",
    name: "mcp",
    title: "Open MCPs",
    description: "Open MCP controls.",
  },
]

const INTENT_OPTIONS = [
  {
    key: "auto" as const,
    label: "Auto",
    icon: SparklesIcon,
    description: "Adaptive mode – Buddy decides the best approach",
  },
  {
    key: "learn" as const,
    label: "Learn",
    icon: BookOpenIcon,
    description: "Study mode – Explanations, examples, and deep dives",
  },
  {
    key: "practice" as const,
    label: "Practice",
    icon: TargetIcon,
    description: "Drill mode – Exercises and hands-on problems",
  },
  {
    key: "assess" as const,
    label: "Assess",
    icon: BrainIcon,
    description: "Quiz mode – Questions to test your understanding",
  },
]

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"]
const ACCEPTED_FILE_TYPES = [...ACCEPTED_IMAGE_TYPES, "application/pdf"]

function translatePromptPlaceholder(key: string, params?: Record<string, string>) {
  if (key === "prompt.placeholder.shell") return "Run a shell command"
  if (key === "prompt.placeholder.summarizeComments") return "Summarize these comments"
  if (key === "prompt.placeholder.summarizeComment") return "Summarize this comment"
  if (key === "prompt.placeholder.normal") {
    if (params?.example) return `Try: ${params.example}`
    return "Ask Buddy"
  }
  return "Ask Buddy"
}

function historyStorageKey(key: string | undefined) {
  if (!key) return `${HISTORY_STORAGE_PREFIX}:global`
  return `${HISTORY_STORAGE_PREFIX}:${key}`
}

function loadHistory(key: string | undefined): PromptHistoryEntry[] {
  if (typeof window === "undefined" || !("localStorage" in window)) return []

  try {
    const raw = window.localStorage.getItem(historyStorageKey(key))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .flatMap((entry) => {
        if (!entry || typeof entry !== "object") return []
        const candidate = entry as {
          value?: unknown
          attachments?: unknown
          parts?: unknown
        }
        const value = typeof candidate.value === "string" ? candidate.value : ""
        const attachments = Array.isArray(candidate.attachments)
          ? candidate.attachments.flatMap((attachment) => {
              if (!attachment || typeof attachment !== "object") return []
              const item = attachment as Partial<PromptComposerAttachment>
              if (
                typeof item.id !== "string" ||
                typeof item.filename !== "string" ||
                typeof item.mime !== "string" ||
                typeof item.dataUrl !== "string" ||
                (item.kind !== "file" && item.kind !== "image")
              ) {
                return []
              }

              return [
                {
                  id: item.id,
                  filename: item.filename,
                  mime: item.mime,
                  dataUrl: item.dataUrl,
                  kind: item.kind,
                } satisfies PromptComposerAttachment,
              ]
            })
          : []
        const parts: PromptComposerPart[] = []
        if (Array.isArray(candidate.parts)) {
          for (const part of candidate.parts) {
            if (!part || typeof part !== "object") continue
            const item = part as Record<string, unknown>
            if (item.type === PROMPT_PART_TYPE_TEXT && typeof item.text === "string") {
              parts.push({
                type: PROMPT_PART_TYPE_TEXT,
                text: item.text,
              })
              continue
            }
            if (item.type === PROMPT_PART_TYPE_AGENT && typeof item.name === "string") {
              parts.push({
                type: PROMPT_PART_TYPE_AGENT,
                name: item.name,
              })
              continue
            }
            if (item.type === WORKSPACE_FILE_REFERENCE_PART_TYPE && typeof item.path === "string") {
              parts.push({
                type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
                path: item.path,
              })
            }
          }
        } else {
          parts.push(...createPromptPartsFromValue(value, new Set()))
        }

        return [{ value, attachments, parts }]
      })
      .slice(0, 100)
  } catch {
    return []
  }
}

function saveHistory(key: string | undefined, entries: PromptHistoryEntry[]) {
  if (typeof window === "undefined" || !("localStorage" in window)) return

  try {
    window.localStorage.setItem(historyStorageKey(key), JSON.stringify(entries))
  } catch {
    // Ignore storage failures in the composer.
  }
}

function dedupeMentionFiles(files: MentionableFile[]) {
  const seen = new Set<string>()
  return files.filter((file) => {
    if (seen.has(file.path)) return false
    seen.add(file.path)
    return true
  })
}

function cloneAttachments(attachments: PromptComposerAttachment[]) {
  return attachments.map((attachment) => ({ ...attachment }))
}

function attachmentLabel(attachment: PromptComposerAttachment) {
  return attachment.filename || (attachment.kind === "image" ? "Image attachment" : "File attachment")
}

function createAttachmentID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("Failed to read attachment"))
    }
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read attachment"))
    reader.readAsDataURL(file)
  })
}

function hasSubmittablePromptParts(parts: PromptComposerPart[]) {
  return parts.some((part) => part.type !== PROMPT_PART_TYPE_TEXT || part.text.trim().length > 0)
}

export function PromptComposer(props: PromptComposerProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null)
  const mirrorInputRef = useRef(false)
  const pendingCursorRef = useRef<number | undefined>(undefined)
  const slashRefreshRequestedRef = useRef(false)
  const historyApplyingRef = useRef(false)
  const [currentPartCount, setCurrentPartCount] = useState(0)
  const [hasSubmittableParts, setHasSubmittableParts] = useState(false)
  const canSubmit = useMemo(
    () => !props.isBusy && (props.value.trim().length > 0 || props.attachments.length > 0 || hasSubmittableParts),
    [hasSubmittableParts, props.attachments.length, props.isBusy, props.value],
  )
  const [cursorOffset, setCursorOffset] = useState(() => props.value.length)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | undefined>(undefined)
  const [slashIndex, setSlashIndex] = useState(0)
  const [dismissedSlashKey, setDismissedSlashKey] = useState<string | undefined>(undefined)
  const [searchMentionFiles, setSearchMentionFiles] = useState<MentionableFile[]>([])
  const [searchingFiles, setSearchingFiles] = useState(false)
  const [recentMentionFiles, setRecentMentionFiles] = useState<MentionableFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<PromptHistoryEntry[]>(() => loadHistory(props.historyKey))
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [savedHistoryDraft, setSavedHistoryDraft] = useState<PromptHistoryEntry | null>(null)
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState("Ask Buddy...")
  const [placeholderOpacity, setPlaceholderOpacity] = useState(1)
  const [previewAttachment, setPreviewAttachment] = useState<PromptComposerAttachment | null>(null)
  const currentPartsRef = useRef<PromptComposerPart[]>([])

  const knownAgents = useMemo(
    () => new Set(props.mentionableAgents.map((agent) => agent.name)),
    [props.mentionableAgents],
  )
  const personaOptions = useMemo(() => {
    if (props.personaOptions.length > 0) return props.personaOptions
    return props.selectedPersona ? [{ name: props.selectedPersona }] : [{ name: "buddy" }]
  }, [props.personaOptions, props.selectedPersona])
  const slashCommandOptions = useMemo<SlashCommandOption[]>(() => {
    const customCommands = props.slashCommands.map((command) => ({
      type: "custom" as const,
      name: command.name,
      title: command.name,
      description: command.description,
      source: command.source,
    }))
    const customNames = new Set(customCommands.map((command) => command.name.toLowerCase()))
    const builtinCommands = BUILTIN_SLASH_COMMANDS.filter((command) => !customNames.has(command.name.toLowerCase()))

    return [...customCommands, ...builtinCommands]
  }, [props.slashCommands])
  const mentionMatch = useMemo(() => getMentionMatch(props.value, cursorOffset), [props.value, cursorOffset])
  const mentionKey = mentionMatch ? `${mentionMatch.start}:${mentionMatch.query}` : undefined
  const mentionFiles = useMemo(
    () => dedupeMentionFiles([...recentMentionFiles, ...searchMentionFiles]),
    [recentMentionFiles, searchMentionFiles],
  )
  const mentionOptions = useMemo(() => {
    if (!mentionMatch) return []
    return filterMentionOptions(props.mentionableAgents, mentionFiles, mentionMatch.query).slice(0, 10)
  }, [mentionFiles, mentionMatch, props.mentionableAgents])
  const mentionVisible = !!mentionMatch && mentionOptions.length > 0 && mentionKey !== dismissedMentionKey
  const showMentionLoading = !!mentionMatch && mentionKey !== dismissedMentionKey && searchingFiles
  const slashMatch = useMemo(() => getSlashMatch(props.value, cursorOffset), [props.value, cursorOffset])
  const slashKey = slashMatch ? `${slashMatch.start}:${slashMatch.query}` : undefined
  const slashOptions = useMemo(() => {
    if (!slashMatch) return []
    return filterSlashCommands(slashCommandOptions, slashMatch.query)
  }, [slashCommandOptions, slashMatch])
  const slashVisible = !!slashMatch && slashOptions.length > 0 && slashKey !== dismissedSlashKey

  const groupedModelOptions = useMemo(() => {
    const grouped = new Map<string, Array<(typeof props.modelOptions)[number]>>()
    const ungrouped: Array<(typeof props.modelOptions)[number]> = []

    for (const option of props.modelOptions) {
      if (!option.group) {
        ungrouped.push(option)
        continue
      }

      const existing = grouped.get(option.group)
      if (existing) {
        existing.push(option)
        continue
      }
      grouped.set(option.group, [option])
    }

    return {
      ungrouped,
      grouped: Array.from(grouped.entries()),
    }
  }, [props.modelOptions])
  const placeholder = useMemo(
    () =>
      promptPlaceholder({
        mode: "normal",
        commentCount: 0,
        example: "",
        suggest: false,
        intent: props.selectedIntent,
        t: translatePromptPlaceholder,
      }),
    [props.selectedIntent],
  )

  useEffect(() => {
    if (displayedPlaceholder === placeholder) return
    setPlaceholderOpacity(0)
    const timeout = setTimeout(() => {
      setDisplayedPlaceholder(placeholder)
      setPlaceholderOpacity(1)
    }, 250)
    return () => clearTimeout(timeout)
  }, [placeholder, displayedPlaceholder])

  useEffect(() => {
    setHistoryEntries(loadHistory(props.historyKey))
    setHistoryIndex(-1)
    setSavedHistoryDraft(null)
  }, [props.historyKey])

  useEffect(() => {
    saveHistory(props.historyKey, historyEntries)
  }, [historyEntries, props.historyKey])

  useEffect(() => {
    setMentionIndex(0)
  }, [mentionKey])

  useEffect(() => {
    setSlashIndex(0)
  }, [slashKey])

  useEffect(() => {
    if (cursorOffset <= props.value.length) return
    setCursorOffset(props.value.length)
  }, [cursorOffset, props.value])

  useEffect(() => {
    if (!mentionKey) {
      setDismissedMentionKey(undefined)
      return
    }

    if (dismissedMentionKey && dismissedMentionKey !== mentionKey) {
      setDismissedMentionKey(undefined)
    }
  }, [dismissedMentionKey, mentionKey])

  useEffect(() => {
    if (!slashKey) {
      setDismissedSlashKey(undefined)
      return
    }

    if (dismissedSlashKey && dismissedSlashKey !== slashKey) {
      setDismissedSlashKey(undefined)
    }
  }, [dismissedSlashKey, slashKey])

  useEffect(() => {
    if (!slashMatch) {
      slashRefreshRequestedRef.current = false
      return
    }

    if (slashRefreshRequestedRef.current) return
    slashRefreshRequestedRef.current = true
    props.onRefreshSlashCommands?.()
  }, [props.onRefreshSlashCommands, slashMatch])

  useEffect(() => {
    if (!mentionMatch || !props.onSearchFiles) {
      setSearchMentionFiles([])
      setSearchingFiles(false)
      return
    }

    const query = mentionMatch.query.trim()
    if (!query) {
      setSearchMentionFiles([])
      setSearchingFiles(false)
      return
    }

    let cancelled = false
    setSearchingFiles(true)
    props
      .onSearchFiles(query)
      .then((files) => {
        if (cancelled) return
        setSearchMentionFiles(files)
        setSearchingFiles(false)
      })
      .catch(() => {
        if (cancelled) return
        setSearchMentionFiles([])
        setSearchingFiles(false)
      })

    return () => {
      cancelled = true
    }
  }, [mentionKey, mentionMatch, props.onSearchFiles])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    if (mirrorInputRef.current) {
      mirrorInputRef.current = false
      return
    }

    const serializedCurrent = serializePromptParts(currentPartsRef.current)
    if (currentPartsRef.current.length > 0 && props.value === serializedCurrent) {
      renderPromptParts(editor, currentPartsRef.current)
      return
    }

    const nextParts = createPromptPartsFromValue(props.value, knownAgents)
    updateCurrentParts(nextParts)
    renderPromptParts(editor, nextParts)

    const nextCursor = pendingCursorRef.current
    if (nextCursor === undefined) return

    pendingCursorRef.current = undefined
    const frame = window.requestAnimationFrame(() => {
      const field = editorRef.current
      if (!field) return
      field.focus()
      setCursorPosition(field, nextCursor)
      setCursorOffset(nextCursor)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [currentPartCount, knownAgents, props.attachments.length, props.value])

  function resetHistoryNavigation() {
    if (historyApplyingRef.current) return
    setHistoryIndex(-1)
    setSavedHistoryDraft(null)
  }

  function updateCurrentValue(value: string) {
    mirrorInputRef.current = true
    props.onChange(value)
  }

  function updateCurrentParts(parts: PromptComposerPart[]) {
    currentPartsRef.current = parts
    setCurrentPartCount(parts.length)
    setHasSubmittableParts(hasSubmittablePromptParts(parts))
  }

  function focusEditorEnd() {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const nextCursor = serializePromptParts(currentPartsRef.current).length
    setCursorPosition(editor, nextCursor)
    setCursorOffset(nextCursor)
  }

  function applyDraftSnapshot(next: PromptHistoryEntry, cursor: "start" | "end") {
    historyApplyingRef.current = true
    pendingCursorRef.current =
      cursor === "start"
        ? 0
        : next.parts.length > 0
          ? serializePromptParts(next.parts).length
          : next.value.length
    updateCurrentParts(
      next.parts.length > 0 ? clonePromptParts(next.parts) : createPromptPartsFromValue(next.value, knownAgents),
    )
    props.onAttachmentsChange(cloneAttachments(next.attachments))
    mirrorInputRef.current = true
    props.onChange(next.value)
    const editor = editorRef.current
    if (editor) {
      renderPromptParts(editor, currentPartsRef.current)
    }
    window.requestAnimationFrame(() => {
      historyApplyingRef.current = false
    })
  }

  function commitDraftToHistory() {
    const nextEntries = prependHistoryEntry(historyEntries, {
      value: props.value,
      attachments: props.attachments,
      parts: clonePromptParts(currentPartsRef.current),
    })
    if (nextEntries !== historyEntries) {
      setHistoryEntries(nextEntries)
    }
    setHistoryIndex(-1)
    setSavedHistoryDraft(null)
  }

  function appendRecentMentionFile(file: MentionableFile) {
    setRecentMentionFiles((current) =>
      dedupeMentionFiles([{ ...file, recent: true }, ...current]).slice(0, MAX_RECENT_MENTION_FILES),
    )
  }

  function handleEditorInput() {
    const editor = editorRef.current
    if (!editor) return

    const nextParts = collectPromptParts(editor)
    const nextValue = serializePromptParts(nextParts)
    const nextCursor = getCursorPosition(editor)
    const shouldReset =
      !NON_EMPTY_TEXT.test(nextValue) &&
      props.attachments.length === 0 &&
      !Array.from(
        editor.querySelectorAll(
          `[data-type='${PROMPT_PART_TYPE_AGENT}'], [data-type='${WORKSPACE_FILE_REFERENCE_PART_TYPE}']`,
        ),
      ).length

    setCursorOffset(nextCursor)
    setDismissedMentionKey(undefined)
    setDismissedSlashKey(undefined)
    updateCurrentParts(nextParts)

    if (shouldReset) {
      updateCurrentParts([])
      updateCurrentValue("")
      resetHistoryNavigation()
      return
    }

    resetHistoryNavigation()
    updateCurrentValue(nextValue)
  }

  function insertTextAtSelection(text: string) {
    const editor = editorRef.current
    if (!editor) return

    const selection = window.getSelection()
    if (!selection) return

    if (selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      editor.focus()
      setCursorPosition(editor, props.value.length)
    }

    if (selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
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
    if (!editor || !mentionMatch) return

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
      "mx-0.5 inline-flex max-w-full items-center rounded-md border border-border/70 bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
    if (option.type === "agent") {
      pill.textContent = `@${option.name}`
      pill.dataset.type = PROMPT_PART_TYPE_AGENT
      pill.dataset.name = option.name
    } else {
      pill.textContent = `@${option.path}`
      pill.dataset.type = WORKSPACE_FILE_REFERENCE_PART_TYPE
      pill.dataset.path = option.path
      appendRecentMentionFile({ path: option.path, recent: true })
    }
    pill.setAttribute("contenteditable", "false")

    setRangeEdge(editor, range, "start", mentionMatch.start)
    setRangeEdge(editor, range, "end", mentionMatch.end)
    range.deleteContents()

    const gap = document.createTextNode(" ")
    range.insertNode(gap)
    range.insertNode(pill)
    range.setStartAfter(gap)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    setDismissedMentionKey(undefined)
    handleEditorInput()
  }

  function clearComposer() {
    resetHistoryNavigation()
    props.onAttachmentsChange([])
    updateCurrentParts([])
    const editor = editorRef.current
    if (editor) {
      renderPromptParts(editor, [])
    }
    updateCurrentValue("")
    pendingCursorRef.current = 0
  }

  function runBuiltinSlashCommand(name: string) {
    switch (name) {
      case "new":
        clearComposer()
        props.onNewSession()
        return true
      case "persona": {
        if (personaOptions.length <= 1) return false
        const currentIndex = personaOptions.findIndex((option) => option.name === props.selectedPersona)
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % personaOptions.length : 0
        const nextPersona = personaOptions[nextIndex]
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
    if (command.type === "builtin") {
      runBuiltinSlashCommand(command.name)
      return
    }

    const nextValue = `/${command.name} `
    const nextCursor = command.name.length + 2
    pendingCursorRef.current = nextCursor
    setDismissedSlashKey(undefined)
    const nextParts = createPromptPartsFromValue(nextValue, knownAgents)
    updateCurrentParts(nextParts)
    const editor = editorRef.current
    if (editor) {
      renderPromptParts(editor, nextParts)
    }
    updateCurrentValue(nextValue)
  }

  async function addAttachments(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return

    const next = await Promise.all(
      list.map(async (file) => ({
        id: createAttachmentID(),
        filename: file.name || (file.type.startsWith("image/") ? "image" : "attachment"),
        mime: file.type || "application/octet-stream",
        dataUrl: await readFileAsDataUrl(file),
        kind: file.type.startsWith("image/") ? ("image" as const) : ("file" as const),
      })),
    ).catch(() => undefined)

    if (!next) return

    resetHistoryNavigation()
    props.onAttachmentsChange([...props.attachments, ...next])
  }

  function removeAttachment(id: string) {
    resetHistoryNavigation()
    props.onAttachmentsChange(props.attachments.filter((attachment) => attachment.id !== id))
  }

  function handleSubmit() {
    if (props.isBusy) {
      props.onAbort()
      return
    }

    if (!props.value.trim() && props.attachments.length === 0 && !hasSubmittableParts) {
      return
    }

    commitDraftToHistory()
    props.onSubmit({
      value: props.value,
      attachments: cloneAttachments(props.attachments),
      parts: clonePromptParts(currentPartsRef.current),
    })
  }

  return (
    <div className={props.className ?? "mx-4 mb-4"}>
      <form
        className="group/prompt-input relative z-10 rounded-[12px] border bg-card shadow-sm"
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
          void addAttachments(event.dataTransfer.files)
        }}
      >
        <div className="relative">
          {slashVisible || mentionVisible || showMentionLoading ? (
            <div className="absolute inset-x-2 bottom-16 z-20 max-h-80 overflow-y-auto rounded-xl border bg-popover/95 shadow-lg backdrop-blur">
              {slashVisible ? (
                slashOptions.map((command, index) => {
                  const active = index === slashIndex
                  return (
                    <button
                      key={`${command.type}:${command.name}`}
                      type="button"
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                        active ? "bg-muted text-foreground" : "text-foreground/90 hover:bg-muted/70"
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        applySlash(command)
                      }}
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium">{`/${command.name}`}</span>
                        {command.description ? (
                          <span className="truncate text-xs text-muted-foreground">{command.description}</span>
                        ) : command.title ? (
                          <span className="truncate text-xs text-muted-foreground">{command.title}</span>
                        ) : null}
                      </div>
                      {command.type === "custom" && command.source && command.source !== "command" ? (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          {command.source}
                        </span>
                      ) : null}
                    </button>
                  )
                })
              ) : (
                <>
                  {showMentionLoading ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Searching files...</div>
                  ) : null}
                  {mentionOptions.map((option, index) => {
                    const active = index === mentionIndex
                    return (
                      <button
                        key={option.type === "agent" ? `agent:${option.name}` : `file:${option.path}`}
                        type="button"
                        className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors ${
                          active ? "bg-muted text-foreground" : "text-foreground/90 hover:bg-muted/70"
                        }`}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          applyMention(option)
                        }}
                      >
                        <span className="font-medium">
                          {option.type === "agent" ? `@${option.name}` : `@${option.path}`}
                        </span>
                        {option.description ? (
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        ) : option.type === "file" && option.recent ? (
                          <span className="text-xs text-muted-foreground">Recent file</span>
                        ) : null}
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          ) : null}

          {dragging ? (
            <div className="absolute inset-2 z-10 flex items-center justify-center rounded-xl border border-dashed border-primary/40 bg-background/95 text-sm text-foreground shadow-sm">
              Drop files to attach or @-mention them in this prompt.
            </div>
          ) : null}

          {!props.value && props.attachments.length === 0 && !hasSubmittableParts ? (
            <div
              className="pointer-events-none absolute left-3 top-3 right-20 text-sm leading-6 text-muted-foreground transition-opacity duration-250 ease-out"
              style={{ opacity: placeholderOpacity }}
            >
              {displayedPlaceholder}
            </div>
          ) : null}

          <div
            ref={editorRef}
            contentEditable={!props.isBusy}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            className="min-h-[84px] max-h-[240px] w-full overflow-y-auto rounded-[12px] border-0 bg-transparent px-3 pt-3 pb-12 text-sm leading-6 text-foreground focus:outline-none"
            onInput={() => {
              handleEditorInput()
            }}
            onClick={() => {
              const editor = editorRef.current
              if (!editor) return
              setCursorOffset(getCursorPosition(editor))
            }}
            onKeyDown={(event) => {
              const editor = editorRef.current
              const currentCursor = editor ? getCursorPosition(editor) : props.value.length
              setCursorOffset(currentCursor)

              if (slashVisible) {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  setSlashIndex((current) => (current + 1) % slashOptions.length)
                  return
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  setSlashIndex((current) => (current - 1 + slashOptions.length) % slashOptions.length)
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
                  const selected = slashOptions[slashIndex]
                  if (selected) applySlash(selected)
                  return
                }

                if (event.key === "Escape") {
                  event.preventDefault()
                  setDismissedSlashKey(slashKey)
                  return
                }
              }

              if (mentionVisible) {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  setMentionIndex((current) => (current + 1) % mentionOptions.length)
                  return
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  setMentionIndex((current) => (current - 1 + mentionOptions.length) % mentionOptions.length)
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
                  const selected = mentionOptions[mentionIndex]
                  if (selected) applyMention(selected)
                  return
                }

                if (event.key === "Escape") {
                  event.preventDefault()
                  setDismissedMentionKey(mentionKey)
                  return
                }
              }

              if (
                (event.key === "ArrowUp" || event.key === "ArrowDown") &&
                canNavigateHistoryAtCursor(
                  event.key === "ArrowUp" ? "up" : "down",
                  props.value,
                  currentCursor,
                  historyIndex !== -1,
                )
              ) {
                const result = navigatePromptHistory({
                  direction: event.key === "ArrowUp" ? "up" : "down",
                  entries: historyEntries,
                  historyIndex,
                  current: {
                    value: props.value,
                    attachments: props.attachments,
                    parts: clonePromptParts(currentPartsRef.current),
                  },
                  savedDraft: savedHistoryDraft,
                })
                if (result.handled) {
                  event.preventDefault()
                  setHistoryIndex(result.historyIndex)
                  setSavedHistoryDraft(result.savedDraft)
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
              const clipboardData = event.clipboardData
              if (!clipboardData) return

              const items = Array.from(clipboardData.items)
              const fileItems = items.filter((item) => item.kind === "file")
              const imageItems = fileItems.filter((item) => ACCEPTED_FILE_TYPES.includes(item.type))

              if (imageItems.length > 0) {
                event.preventDefault()
                for (const item of imageItems) {
                  const file = item.getAsFile()
                  if (file) addAttachments([file])
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
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              const files = event.target.files
              if (!files || files.length === 0) return
              void addAttachments(files)
              event.currentTarget.value = ""
            }}
          />

          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title="Attach files"
              aria-label="Attach files"
              onClick={() => {
                fileInputRef.current?.click()
              }}
            >
              <PlusIcon className="size-4" />
            </button>

            <button
              type="submit"
              className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!props.isBusy && !canSubmit}
              aria-label={props.isBusy ? "Stop" : "Send"}
              title={props.isBusy ? "Stop" : "Send"}
            >
              {props.isBusy ? <SquareIcon className="size-3.5" /> : <ArrowUpIcon className="size-4" />}
            </button>
          </div>
        </div>

        <ImageAttachments
          attachments={props.attachments}
          onRemove={removeAttachment}
          onOpen={(attachment) => setPreviewAttachment(attachment)}
        />
      </form>

      <div className="-mt-3.5 rounded-[12px] rounded-tl-none rounded-tr-none border border-t-0 bg-card/95 px-2 pt-5 pb-2">
        {props.pendingSteerLabel ? (
          <div className="mb-2 flex min-w-0 items-center gap-2 px-1">
            <Badge variant="secondary" className="max-w-full gap-1.5 px-2 py-1 text-[11px]">
              <span className="truncate">{props.pendingSteerLabel}</span>
              {props.onClearPendingSteer ? (
                <button
                  type="button"
                  className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
                  aria-label="Clear pending teaching steer"
                  onClick={props.onClearPendingSteer}
                >
                  <XIcon className="size-3" />
                </button>
              ) : null}
            </Badge>
          </div>
        ) : null}

        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={300}>
              <Tabs
                value={props.selectedIntent}
                onValueChange={(value) => {
                  if (value === "auto" || value === "learn" || value === "practice" || value === "assess") {
                    props.onIntentChange(value)
                  }
                }}
                className="w-auto"
              >
                <TabsList variant="default" className="h-7 bg-muted/50 p-0.5">
                  {INTENT_OPTIONS.map((intent) => {
                    const Icon = intent.icon
                    const isSelected = props.selectedIntent === intent.key
                    return (
                      <Tooltip key={intent.key}>
                        <TooltipTrigger>
                          <TabsTrigger
                            value={intent.key}
                            className="h-6 gap-1.5 px-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none [&_svg]:size-3.5 border-0 shadow-none"
                          >
                            <Icon className="shrink-0" />
                            <span
                              className={`whitespace-nowrap overflow-hidden transition-all duration-500 ease-out ${
                                isSelected ? "max-w-[80px] opacity-100" : "max-w-0 opacity-0"
                              }`}
                            >
                              {intent.label}
                            </span>
                          </TabsTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center" sideOffset={4}>
                          <p className="text-xs">{intent.description.split(" – ")[1]}</p>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </TabsList>
              </Tabs>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-1">
            <Select value={props.selectedPersona} onValueChange={props.onPersonaChange}>
              <SelectTrigger
                size="sm"
                className="h-7 max-w-[140px] min-w-0 border-transparent bg-transparent px-2 text-xs text-foreground/90 shadow-none hover:bg-muted/50 focus-visible:ring-0"
                aria-label="Persona"
              >
                <SelectValue placeholder="Persona" />
              </SelectTrigger>
              <SelectContent
                side="top"
                align="end"
                position="popper"
                sideOffset={6}
                className="w-[min(16rem,calc(100vw-2rem))] max-h-[min(20rem,calc(100vh-8rem))]"
              >
                {personaOptions.map((persona) => (
                  <SelectItem key={persona.name} value={persona.name}>
                    {persona.label ?? persona.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={props.selectedModel}
              onValueChange={props.onModelChange}
              open={modelMenuOpen}
              onOpenChange={setModelMenuOpen}
            >
              <SelectTrigger
                ref={modelTriggerRef}
                size="sm"
                className="h-7 max-w-[180px] min-w-0 border-transparent bg-transparent px-2 text-xs text-foreground/90 shadow-none hover:bg-muted/50 focus-visible:ring-0"
                aria-label="Model"
              >
                <SelectValue placeholder="Auto" />
              </SelectTrigger>
              <SelectContent
                side="top"
                align="start"
                position="popper"
                sideOffset={6}
                className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(28rem,calc(100vh-8rem))]"
              >
                {groupedModelOptions.ungrouped.map((option) => (
                  <SelectItem key={option.key} value={option.key} disabled={option.disabled}>
                    {option.label}
                  </SelectItem>
                ))}
                {groupedModelOptions.grouped.map(([group, options]) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {options.map((option) => (
                      <SelectItem key={option.key} value={option.key} disabled={option.disabled}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            <Select value={props.selectedThinking} onValueChange={props.onThinkingChange}>
              <SelectTrigger
                size="sm"
                className="h-7 max-w-[160px] min-w-0 border-transparent bg-transparent px-2 text-xs text-foreground/90 shadow-none hover:bg-muted/50 focus-visible:ring-0"
                aria-label="Thinking"
              >
                <SelectValue placeholder="Thinking" />
              </SelectTrigger>
              <SelectContent
                side="top"
                align="start"
                position="popper"
                sideOffset={6}
                className="w-[min(18rem,calc(100vw-2rem))] max-h-[min(20rem,calc(100vh-8rem))]"
              >
                {props.thinkingOptions.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Dialog open={!!previewAttachment} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] p-0 overflow-hidden">
          {previewAttachment && (
            <img
              src={previewAttachment.dataUrl}
              alt={previewAttachment.filename}
              className="w-full h-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
