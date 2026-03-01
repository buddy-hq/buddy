import {
  ArrowUpIcon,
  Badge,
  PlusIcon,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SquareIcon,
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
  filterSlashCommands,
  getSlashMatch,
  type SlashCommandOption,
  type SlashCommandSource,
} from "./slash-autocomplete"
import type { PromptComposerAttachment } from "./prompt-types"

type PromptComposerProps = {
  value: string
  attachments: PromptComposerAttachment[]
  isBusy: boolean
  agentOptions: Array<{
    name: string
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
  selectedAgent: string
  selectedModel: string
  thinkingOptions: Array<{
    key: string
    label: string
  }>
  selectedThinking: string
  onChange: (value: string) => void
  onAttachmentsChange: (attachments: PromptComposerAttachment[]) => void
  onAgentChange: (agent: string) => void
  onModelChange: (model: string) => void
  onThinkingChange: (thinking: string) => void
  onSubmit: (input: { value: string; attachments: PromptComposerAttachment[] }) => void
  onAbort: () => void
  onNewSession: () => void
  onOpenMcpDialog?: () => void
  onSearchFiles?: (query: string) => Promise<MentionableFile[]>
  onRefreshSlashCommands?: () => void
  historyKey?: string
  className?: string
}

type StructuredPromptPart =
  | {
      type: "text"
      content: string
    }
  | {
      type: "agent"
      name: string
      content: string
    }
  | {
      type: "file"
      path: string
      content: string
    }

const HISTORY_STORAGE_PREFIX = "buddy.prompt-history.v3"
const MAX_RECENT_MENTION_FILES = 8
const NON_EMPTY_TEXT = /[^\s\u200B]/

const BUILTIN_SLASH_COMMANDS: SlashCommandOption[] = [
  {
    type: "builtin",
    name: "new",
    title: "Start new thread",
    description: "Create a fresh session in this project.",
  },
  {
    type: "builtin",
    name: "agent",
    title: "Cycle agent",
    description: "Switch to the next available agent.",
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
    title: "Toggle MCPs",
    description: "Open MCP server controls.",
  },
]

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

        return [{ value, attachments }]
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

function looksLikePath(token: string) {
  return token.includes("/") || token.includes("\\") || token.includes(".")
}

function parseStructuredValue(value: string, knownAgents: Set<string>): StructuredPromptPart[] {
  if (!value) return [{ type: "text", content: "" }]

  const parts: StructuredPromptPart[] = []
  const matcher = /(^|\s)(@(\S+))/g
  let cursor = 0

  while (true) {
    const match = matcher.exec(value)
    if (!match) break

    const leadingWhitespace = match[1] ?? ""
    const token = match[2] ?? ""
    const mentionValue = match[3] ?? ""
    const triggerIndex = match.index + leadingWhitespace.length

    if (triggerIndex > cursor) {
      parts.push({
        type: "text",
        content: value.slice(cursor, triggerIndex),
      })
    }

    if (knownAgents.has(mentionValue)) {
      parts.push({
        type: "agent",
        name: mentionValue,
        content: token,
      })
    } else if (looksLikePath(mentionValue)) {
      parts.push({
        type: "file",
        path: mentionValue,
        content: token,
      })
    } else {
      parts.push({
        type: "text",
        content: token,
      })
    }

    cursor = triggerIndex + token.length
  }

  if (cursor < value.length) {
    parts.push({
      type: "text",
      content: value.slice(cursor),
    })
  }

  return parts.length > 0 ? parts : [{ type: "text", content: "" }]
}

function parseEditorValue(root: HTMLElement) {
  let buffer = ""

  const flush = () => {
    const next = buffer.replace(/\u200B/g, "")
    buffer = ""
    return next
  }

  const parts: string[] = []

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.textContent ?? ""
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement

    if (element.dataset.type === "file" || element.dataset.type === "agent") {
      const text = flush()
      if (text) parts.push(text)
      parts.push(element.textContent ?? "")
      return
    }

    if (element.tagName === "BR") {
      buffer += "\n"
      return
    }

    const children = Array.from(element.childNodes)
    children.forEach((child, index) => {
      visit(child)
      const isBlock =
        child.nodeType === Node.ELEMENT_NODE &&
        ["DIV", "P"].includes((child as HTMLElement).tagName)
      if (isBlock && index < children.length - 1) {
        buffer += "\n"
      }
    })
  }

  Array.from(root.childNodes).forEach((child, index, siblings) => {
    visit(child)
    const isBlock =
      child.nodeType === Node.ELEMENT_NODE &&
      ["DIV", "P"].includes((child as HTMLElement).tagName)
    if (isBlock && index < siblings.length - 1) {
      buffer += "\n"
    }
  })

  const tail = flush()
  if (tail) parts.push(tail)

  return parts.join("")
}

export function PromptComposer(props: PromptComposerProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null)
  const mirrorInputRef = useRef(false)
  const pendingCursorRef = useRef<number | undefined>(undefined)
  const slashRefreshRequestedRef = useRef(false)
  const historyApplyingRef = useRef(false)
  const canSubmit = useMemo(
    () => !props.isBusy && (props.value.trim().length > 0 || props.attachments.length > 0),
    [props.attachments.length, props.isBusy, props.value],
  )
  const [cursorOffset, setCursorOffset] = useState(() => props.value.length)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | undefined>(undefined)
  const [slashIndex, setSlashIndex] = useState(0)
  const [dismissedSlashKey, setDismissedSlashKey] = useState<string | undefined>(undefined)
  const [searchMentionFiles, setSearchMentionFiles] = useState<MentionableFile[]>([])
  const [recentMentionFiles, setRecentMentionFiles] = useState<MentionableFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<PromptHistoryEntry[]>(() => loadHistory(props.historyKey))
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [savedHistoryDraft, setSavedHistoryDraft] = useState<PromptHistoryEntry | null>(null)

  const knownAgents = useMemo(
    () => new Set(props.mentionableAgents.map((agent) => agent.name)),
    [props.mentionableAgents],
  )
  const agentOptions = useMemo(() => {
    if (props.agentOptions.length > 0) return props.agentOptions
    return props.selectedAgent ? [{ name: props.selectedAgent }] : [{ name: "build" }]
  }, [props.agentOptions, props.selectedAgent])
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
  const mentionMatch = useMemo(
    () => getMentionMatch(props.value, cursorOffset),
    [props.value, cursorOffset],
  )
  const mentionKey = mentionMatch ? `${mentionMatch.start}:${mentionMatch.query}` : undefined
  const mentionFiles = useMemo(
    () => dedupeMentionFiles([...recentMentionFiles, ...searchMentionFiles]),
    [recentMentionFiles, searchMentionFiles],
  )
  const mentionOptions = useMemo(() => {
    if (!mentionMatch) return []
    return filterMentionOptions(props.mentionableAgents, mentionFiles, mentionMatch.query).slice(0, 10)
  }, [mentionFiles, mentionMatch, props.mentionableAgents])
  const mentionVisible =
    !!mentionMatch &&
    mentionOptions.length > 0 &&
    mentionKey !== dismissedMentionKey
  const slashMatch = useMemo(
    () => getSlashMatch(props.value, cursorOffset),
    [props.value, cursorOffset],
  )
  const slashKey = slashMatch ? `${slashMatch.start}:${slashMatch.query}` : undefined
  const slashOptions = useMemo(() => {
    if (!slashMatch) return []
    return filterSlashCommands(slashCommandOptions, slashMatch.query)
  }, [slashCommandOptions, slashMatch])
  const slashVisible =
    !!slashMatch &&
    slashOptions.length > 0 &&
    slashKey !== dismissedSlashKey

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
        t: translatePromptPlaceholder,
      }),
    [],
  )

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
      return
    }

    const query = mentionMatch.query.trim()
    if (!query) {
      setSearchMentionFiles([])
      return
    }

    let cancelled = false
    props.onSearchFiles(query)
      .then((files) => {
        if (cancelled) return
        setSearchMentionFiles(files)
      })
      .catch(() => {
        if (cancelled) return
        setSearchMentionFiles([])
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

    const nextParts = parseStructuredValue(props.value, knownAgents)
    editor.replaceChildren()
    for (const part of nextParts) {
      if (part.type === "text") {
        if (part.content) {
          editor.appendChild(createTextFragment(part.content))
        }
        continue
      }

      const pill = document.createElement("span")
      pill.className =
        "mx-0.5 inline-flex max-w-full items-center rounded-md border border-border/70 bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
      pill.textContent = part.content
      pill.setAttribute("contenteditable", "false")
      pill.dataset.type = part.type
      if (part.type === "agent") {
        pill.dataset.name = part.name
      } else {
        pill.dataset.path = part.path
      }
      editor.appendChild(pill)
    }

    const last = editor.lastChild
    if (last?.nodeType === Node.ELEMENT_NODE && (last as HTMLElement).tagName === "BR") {
      editor.appendChild(document.createTextNode("\u200B"))
    }

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
  }, [knownAgents, props.value])

  function resetHistoryNavigation() {
    if (historyApplyingRef.current) return
    setHistoryIndex(-1)
    setSavedHistoryDraft(null)
  }

  function updateCurrentValue(value: string) {
    mirrorInputRef.current = true
    props.onChange(value)
  }

  function focusEditorEnd() {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const nextCursor = parseEditorValue(editor).length
    setCursorPosition(editor, nextCursor)
    setCursorOffset(nextCursor)
  }

  function applyDraftSnapshot(
    next: PromptHistoryEntry,
    cursor: "start" | "end",
  ) {
    historyApplyingRef.current = true
    pendingCursorRef.current = cursor === "start" ? 0 : next.value.length
    props.onAttachmentsChange(cloneAttachments(next.attachments))
    props.onChange(next.value)
    window.requestAnimationFrame(() => {
      historyApplyingRef.current = false
    })
  }

  function commitDraftToHistory() {
    const nextEntries = prependHistoryEntry(historyEntries, {
      value: props.value,
      attachments: props.attachments,
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

    const nextValue = parseEditorValue(editor)
    const nextCursor = getCursorPosition(editor)
    const shouldReset =
      !NON_EMPTY_TEXT.test(nextValue) &&
      props.attachments.length === 0 &&
      !Array.from(editor.querySelectorAll("[data-type='agent'], [data-type='file']")).length

    setCursorOffset(nextCursor)
    setDismissedMentionKey(undefined)
    setDismissedSlashKey(undefined)

    if (shouldReset) {
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
      pill.dataset.type = "agent"
      pill.dataset.name = option.name
    } else {
      pill.textContent = `@${option.path}`
      pill.dataset.type = "file"
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
    updateCurrentValue("")
    pendingCursorRef.current = 0
  }

  function runBuiltinSlashCommand(name: string) {
    switch (name) {
      case "new":
        clearComposer()
        props.onNewSession()
        return true
      case "agent": {
        if (agentOptions.length <= 1) return false
        const currentIndex = agentOptions.findIndex((option) => option.name === props.selectedAgent)
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % agentOptions.length : 0
        const nextAgent = agentOptions[nextIndex]
        if (!nextAgent) return false
        clearComposer()
        props.onAgentChange(nextAgent.name)
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

    if (!props.value.trim() && props.attachments.length === 0) {
      return
    }

    commitDraftToHistory()
    props.onSubmit({
      value: props.value,
      attachments: cloneAttachments(props.attachments),
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
          {slashVisible || mentionVisible ? (
            <div className="absolute inset-x-2 bottom-16 z-20 max-h-80 overflow-y-auto rounded-xl border bg-popover/95 shadow-lg backdrop-blur">
              {slashVisible
                ? slashOptions.map((command, index) => {
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
                : mentionOptions.map((option, index) => {
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
            </div>
          ) : null}

          {dragging ? (
            <div className="absolute inset-2 z-10 flex items-center justify-center rounded-xl border border-dashed border-primary/40 bg-background/95 text-sm text-foreground shadow-sm">
              Drop files to attach or @-mention them in this prompt.
            </div>
          ) : null}

          {!props.value && props.attachments.length === 0 ? (
            <div className="pointer-events-none absolute left-3 top-3 right-20 text-sm leading-6 text-muted-foreground">
              {placeholder}
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
                  (
                    event.key === "Enter" &&
                    !event.nativeEvent.isComposing &&
                    !event.shiftKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey
                  )
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
                  (
                    event.key === "Enter" &&
                    !event.nativeEvent.isComposing &&
                    !event.shiftKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey
                  )
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
              const text = event.clipboardData.getData("text/plain")
              if (!text) return
              event.preventDefault()
              insertTextAtSelection(text)
            }}
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
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

        {props.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t px-3 py-2">
            {props.attachments.map((attachment) => (
              <Badge
                key={attachment.id}
                variant="secondary"
                className="max-w-full gap-1.5 overflow-hidden px-2 py-1"
              >
                <span className="truncate text-xs">{attachmentLabel(attachment)}</span>
                <button
                  type="button"
                  className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${attachmentLabel(attachment)}`}
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
      </form>

      <div className="-mt-3.5 rounded-[12px] rounded-tl-none rounded-tr-none border border-t-0 bg-card/95 px-2 pt-5 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Select value={props.selectedAgent} onValueChange={props.onAgentChange}>
            <SelectTrigger
              size="sm"
              className="h-7 max-w-[160px] min-w-0 border-transparent bg-transparent px-2 text-xs text-foreground/90 shadow-none hover:bg-muted/50 focus-visible:ring-0"
              aria-label="Agent"
            >
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              position="popper"
              sideOffset={6}
              className="w-[min(18rem,calc(100vw-2rem))] max-h-[min(20rem,calc(100vh-8rem))]"
            >
              {agentOptions.map((agent) => (
                <SelectItem key={agent.name} value={agent.name}>
                  {`Agent: ${agent.name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.selectedModel} onValueChange={props.onModelChange} open={modelMenuOpen} onOpenChange={setModelMenuOpen}>
            <SelectTrigger
              ref={modelTriggerRef}
              size="sm"
              className="h-7 max-w-[240px] min-w-0 border-transparent bg-transparent px-2 text-xs text-foreground/90 shadow-none hover:bg-muted/50 focus-visible:ring-0"
              aria-label="Model"
            >
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              position="popper"
              sideOffset={6}
              className="w-[min(24rem,calc(100vw-2rem))] max-h-[min(28rem,calc(100vh-8rem))]"
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
  )
}
