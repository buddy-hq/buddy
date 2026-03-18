import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Markdown } from "@/components/Markdown"
import { resolveApiUrl } from "../../lib/api-client"
import { computeTokenContextMetrics } from "@/state/context-metrics"
import type { MessageInfo, MessagePart, MessageWithParts, ProviderInfo } from "@/state/chat-types"
import {
  Badge,
  Dialog,
  DialogContent,
  FolderIcon,
  CopyIcon,
  CheckIcon,
  ChevronRightIcon,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  cn,
} from "@buddy/ui"

type ChatTranscriptProps = {
  messages: MessageWithParts[]
  providers?: ProviderInfo[]
  isBusy?: boolean
  onOpenSession?: (sessionID: string) => void
}

type ToolState = {
  status: "pending" | "running" | "completed" | "error"
  input: Record<string, unknown>
  metadata: Record<string, unknown>
  attachments: ToolAttachment[]
  start?: number
  end?: number
  output?: string
  error?: string
  title?: string
}

type ToolAttachment = {
  id: string
  mime: string
  url: string
  filename?: string
}

type ToolInfo = {
  title: string
  subtitle?: string
  detail?: string
  args?: string[]
}

type ToolDiagnostic = {
  range: {
    start: {
      line: number
      character: number
    }
  }
  message: string
  severity?: number
}

type ToolQuestion = {
  question: string
}

type ApplyPatchFile = {
  filePath: string
  relativePath: string
  type: "add" | "update" | "delete" | "move"
  before: string
  after: string
  additions: number
  deletions: number
  movePath?: string
}

type RenderFigureToolOutput = {
  figureID: string
  mime: "image/svg+xml"
  url: string
  alt: string
  caption?: string
  repairAttempts: number
}

type AssistantRenderItem =
  | {
      type: "context"
      key: string
      parts: MessagePart[]
    }
  | {
      type: "part"
      key: string
      part: MessagePart
    }

type ChatTurn = {
  key: string
  user?: MessageWithParts
  assistants: MessageWithParts[]
}

const CONTEXT_TOOLS = new Set(["read", "list", "glob", "grep"])
const HIDDEN_TOOLS = new Set(["todowrite", "todoread"])
const TEXT_RENDER_THROTTLE_MS = 100
const BUDDY_CUSTOM_TOOL_PREFIXES = [
  "teaching_",
  "goal_",
  "learner_",
  "curriculum_",
  "pedagogy_",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function toToolStatus(value: unknown): ToolState["status"] {
  if (value === "running") return "running"
  if (value === "completed") return "completed"
  if (value === "error") return "error"
  return "pending"
}

function unwrapError(message: string) {
  const text = message.replace(/^Error:\s*/, "").trim()

  const parse = (value: string) => {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return undefined
    }
  }

  const read = (value: string) => {
    const first = parse(value)
    if (typeof first !== "string") return first
    return parse(first.trim())
  }

  let json = read(text)
  if (json === undefined) {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start !== -1 && end > start) {
      json = read(text.slice(start, end + 1))
    }
  }

  if (!isRecord(json)) return message

  const error = isRecord(json.error) ? json.error : undefined
  if (error) {
    const type = typeof error.type === "string" ? error.type : undefined
    const innerMessage = typeof error.message === "string" ? error.message : undefined
    if (type && innerMessage) return `${type}: ${innerMessage}`
    if (innerMessage) return innerMessage
    if (type) return type
    const code = typeof error.code === "string" ? error.code : undefined
    if (code) return code
  }

  const fallbackMessage = typeof json.message === "string" ? json.message : undefined
  if (fallbackMessage) return fallbackMessage

  const fallbackError = typeof json.error === "string" ? json.error : undefined
  if (fallbackError) return fallbackError

  return message
}

function formatDuration(ms?: number) {
  if (typeof ms !== "number" || ms < 0) return ""
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

function formatTime(ms?: number) {
  if (typeof ms !== "number") return ""
  const date = new Date(ms)
  const hours = date.getHours()
  const hour12 = hours % 12 || 12
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${hour12}:${minute} ${hours < 12 ? "AM" : "PM"}`
}

function titleCase(value?: string) {
  if (!value) return ""
  return value[0]?.toUpperCase() + value.slice(1)
}

function modelLabel(info: MessageInfo) {
  if ("modelID" in info && info.modelID) {
    return info.modelID
  }
  if ("model" in info && info.model?.modelID) {
    return info.model.modelID
  }
  return ""
}

function tokenContextLabel(info?: MessageInfo, providers: ProviderInfo[] = []) {
  if (!info || info.role !== "assistant") return ""
  const metrics = computeTokenContextMetrics({
    assistant: info,
    providers,
  })
  if (typeof metrics.remaining === "number") {
    return `${metrics.used.toLocaleString()} used · ${metrics.remaining.toLocaleString()} remaining`
  }
  return `${metrics.used.toLocaleString()} used`
}

function useThrottledText(value: string) {
  const [throttled, setThrottled] = useState(value)
  const timeoutRef = useRef<number | undefined>(undefined)
  const lastRef = useRef(0)

  useEffect(() => {
    const now = Date.now()
    const remaining = TEXT_RENDER_THROTTLE_MS - (now - lastRef.current)

    if (remaining <= 0) {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = undefined
      }
      lastRef.current = now
      setThrottled(value)
      return
    }

    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      lastRef.current = Date.now()
      setThrottled(value)
      timeoutRef.current = undefined
    }, remaining)

    return () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = undefined
      }
    }
  }, [value])

  return throttled
}

function basename(path: string) {
  const normalized = path.replace(/\\+/g, "/")
  const segments = normalized.split("/").filter(Boolean)
  return segments.at(-1) ?? path
}

function dirname(path: string) {
  const normalized = path.replace(/\\+/g, "/")
  const segments = normalized.split("/").filter(Boolean)
  if (segments.length <= 1) return "/"
  return segments.slice(0, -1).join("/")
}

function titleFromToolName(tool: string) {
  return tool
    .split("_")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ")
}

function isBuddyCustomTool(tool: string) {
  if (tool === "python_calculator") return true
  return BUDDY_CUSTOM_TOOL_PREFIXES.some((prefix) => tool.startsWith(prefix))
}

function parseToolState(part: MessagePart): ToolState {
  const rawState = isRecord(part.state) ? part.state : {}
  const status = toToolStatus(rawState.status)
  const input = isRecord(rawState.input) ? rawState.input : {}
  const rawTime = isRecord(rawState.time) ? rawState.time : {}
  const stateMetadata = isRecord(rawState.metadata) ? rawState.metadata : {}
  const partMetadata = isRecord(part.metadata) ? part.metadata : {}
  const metadata = {
    ...partMetadata,
    ...stateMetadata,
  }

  const start = typeof rawTime.start === "number" ? rawTime.start : undefined
  const end = typeof rawTime.end === "number" ? rawTime.end : undefined
  const output = typeof rawState.output === "string" ? rawState.output : undefined
  const error = typeof rawState.error === "string" ? rawState.error : undefined
  const title = typeof rawState.title === "string" ? rawState.title : undefined
  const attachments = Array.isArray(rawState.attachments)
    ? rawState.attachments.flatMap((attachment, index): ToolAttachment[] => {
        if (!isRecord(attachment)) return []

        const mime = readNonEmptyString(attachment.mime)
        const url = readNonEmptyString(attachment.url)
        if (!mime || !url) return []

        return [
          {
            id: readNonEmptyString(attachment.id) ?? `${part.id}:attachment:${index}`,
            mime,
            url,
            filename: readNonEmptyString(attachment.filename),
          },
        ]
      })
    : []

  return {
    status,
    input,
    metadata,
    attachments,
    start,
    end,
    output,
    error,
    title,
  }
}

function readDiagnostics(metadata: Record<string, unknown>, filePath: string | undefined) {
  if (!filePath) return [] as ToolDiagnostic[]

  const rawDiagnosticsByFile = isRecord(metadata.diagnostics) ? metadata.diagnostics : undefined
  if (!rawDiagnosticsByFile) return [] as ToolDiagnostic[]

  const rawDiagnostics = rawDiagnosticsByFile[filePath]
  if (!Array.isArray(rawDiagnostics)) return [] as ToolDiagnostic[]

  return rawDiagnostics
    .flatMap((entry): ToolDiagnostic[] => {
      if (!isRecord(entry)) return []
      if (!isRecord(entry.range)) return []
      if (!isRecord(entry.range.start)) return []
      if (typeof entry.range.start.line !== "number") return []
      if (typeof entry.range.start.character !== "number") return []
      if (typeof entry.message !== "string") return []

      return [
        {
          range: {
            start: {
              line: entry.range.start.line,
              character: entry.range.start.character,
            },
          },
          message: entry.message,
          severity: typeof entry.severity === "number" ? entry.severity : undefined,
        },
      ]
    })
    .filter((diagnostic) => diagnostic.severity === 1)
    .slice(0, 3)
}

function readApplyPatchFiles(metadata: Record<string, unknown>) {
  const files = metadata.files
  if (!Array.isArray(files)) return [] as ApplyPatchFile[]

  return files.flatMap((entry): ApplyPatchFile[] => {
    if (!isRecord(entry)) return []
    if (typeof entry.filePath !== "string") return []
    if (typeof entry.relativePath !== "string") return []
    if (
      entry.type !== "add" &&
      entry.type !== "update" &&
      entry.type !== "delete" &&
      entry.type !== "move"
    ) {
      return []
    }

    return [
      {
        filePath: entry.filePath,
        relativePath: entry.relativePath,
        type: entry.type,
        before: typeof entry.before === "string" ? entry.before : "",
        after: typeof entry.after === "string" ? entry.after : "",
        additions: typeof entry.additions === "number" ? entry.additions : 0,
        deletions: typeof entry.deletions === "number" ? entry.deletions : 0,
        movePath: typeof entry.movePath === "string" ? entry.movePath : undefined,
      },
    ]
  })
}

function readQuestions(input: Record<string, unknown>) {
  const value = input.questions
  if (!Array.isArray(value)) return [] as ToolQuestion[]

  return value.flatMap((entry): ToolQuestion[] => {
    if (!isRecord(entry)) return []
    if (typeof entry.question !== "string") return []
    return [{ question: entry.question }]
  })
}

function readQuestionAnswers(metadata: Record<string, unknown>) {
  const value = metadata.answers
  if (!Array.isArray(value)) return [] as string[][]

  return value.map((entry) => {
    if (!Array.isArray(entry)) return [] as string[]
    return entry.filter((answer): answer is string => typeof answer === "string")
  })
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  return value.filter((entry): entry is string => typeof entry === "string")
}

function stripAnsi(value: string) {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    "",
  )
}

function getToolInfo(tool: string, input: Record<string, unknown>): ToolInfo {
  const filePath = typeof input.filePath === "string" ? input.filePath : undefined
  const path = typeof input.path === "string" ? input.path : undefined
  const pattern = typeof input.pattern === "string" ? input.pattern : undefined
  const include = typeof input.include === "string" ? input.include : undefined
  const url = typeof input.url === "string" ? input.url : undefined
  const description = typeof input.description === "string" ? input.description : undefined
  const subagent = typeof input.subagent_type === "string" ? input.subagent_type : undefined
  const alt = typeof input.alt === "string" ? input.alt : undefined

  switch (tool) {
    case "read": {
      const args: string[] = []
      if (typeof input.offset === "number") args.push(`offset=${input.offset}`)
      if (typeof input.limit === "number") args.push(`limit=${input.limit}`)
      return {
        title: "Read",
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
        args,
      }
    }
    case "list":
      return {
        title: "List",
        subtitle: path ? dirname(path) : "/",
      }
    case "glob":
      return {
        title: "Glob",
        subtitle: path ? dirname(path) : "/",
        args: pattern ? [`pattern=${pattern}`] : [],
      }
    case "grep": {
      const args: string[] = []
      if (pattern) args.push(`pattern=${pattern}`)
      if (include) args.push(`include=${include}`)
      return {
        title: "Grep",
        subtitle: path ? dirname(path) : "/",
        args,
      }
    }
    case "webfetch":
      return {
        title: "Webfetch",
        subtitle: url,
      }
    case "task":
      return {
        title: subagent ? `Agent (${subagent})` : "Agent task",
        subtitle: description,
      }
    case "write":
      return {
        title: "Write",
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
      }
    case "edit":
      return {
        title: "Edit",
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
      }
    case "apply_patch":
      return {
        title: "Patch",
        subtitle: description,
      }
    case "bash":
      return {
        title: "Shell",
        subtitle: description,
      }
    case "question":
      return {
        title: "Questions",
        subtitle: description,
      }
    case "python_calculator":
      return {
        title: "Python calculator",
        subtitle: description,
      }
    case "render_figure":
    case "render_freeform_figure":
      return {
        title: "Figure",
        subtitle: alt,
      }
    default:
      return {
        title: tool,
        subtitle: description,
      }
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readNonNegativeInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined
}

function parseRenderFigureToolOutput(state: ToolState): RenderFigureToolOutput | undefined {
  const artifact = readString(state.metadata.artifact)
  if (artifact !== "RenderFigureOutput" && artifact !== "RenderFreeformFigureOutput") return undefined

  const value = isRecord(state.metadata.value) ? state.metadata.value : undefined
  if (!value) return undefined

  const figureID = readNonEmptyString(value.figureID)
  const mime = value.mime === "image/svg+xml" ? "image/svg+xml" : undefined
  const url = readNonEmptyString(value.url)
  const alt = readNonEmptyString(value.alt)
  const caption = readNonEmptyString(value.caption)
  const repairAttempts = readNonNegativeInt(value.repairAttempts)

  if (!figureID || !mime || !url || !alt || repairAttempts === undefined) return undefined

  return {
    figureID,
    mime,
    url,
    alt,
    caption,
    repairAttempts,
  }
}

function resolveAttachmentUrl(url: string) {
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url
  }

  return resolveApiUrl(url)
}

function stripLeadingRenderFigureMarkdown(text: string) {
  return text.replace(/^\s*!\[[^\]]*\]\((\/api\/(?:figures|freeform-figures)\/[^)\s]+)\)(?:\r?\n\s*)*/u, "")
}

function stripUrlCredentials(value: string) {
  try {
    const url = new URL(value)
    url.username = ""
    url.password = ""
    return url.toString()
  } catch {
    return value
  }
}

function statusLabel(status: ToolState["status"]) {
  if (status === "completed") return "completed"
  if (status === "running") return "running"
  if (status === "error") return "error"
  return "pending"
}

function assistantPartRenderable(part: MessagePart) {
  if (part.type === "text") return String(part.text ?? "").trim().length > 0
  if (part.type === "reasoning") return String(part.text ?? "").trim().length > 0
  if (part.type === "step-start" || part.type === "step-finish") return false
  if (part.type !== "tool") return true

  const tool = String(part.tool ?? "")
  if (HIDDEN_TOOLS.has(tool)) return false

  if (tool === "question") {
    const state = parseToolState(part)
    return !(state.status === "pending" || state.status === "running")
  }

  return true
}

function contextSummary(parts: MessagePart[]) {
  const read = parts.filter((part) => part.tool === "read").length
  const search = parts.filter((part) => part.tool === "glob" || part.tool === "grep").length
  const list = parts.filter((part) => part.tool === "list").length

  const values = [
    read ? `${read} ${read === 1 ? "read" : "reads"}` : undefined,
    search ? `${search} ${search === 1 ? "search" : "searches"}` : undefined,
    list ? `${list} ${list === 1 ? "list" : "lists"}` : undefined,
  ].filter((value): value is string => !!value)

  return values.join(", ")
}

function groupAssistantParts(parts: MessagePart[]): AssistantRenderItem[] {
  const visibleParts = parts.filter(assistantPartRenderable)

  const items: AssistantRenderItem[] = []
  let contextStart = -1

  const flushContext = (endIndex: number) => {
    if (contextStart < 0 || endIndex < contextStart) return
    const contextParts = visibleParts.slice(contextStart, endIndex + 1)
    if (contextParts.length === 0) {
      contextStart = -1
      return
    }
    items.push({
      type: "context",
      key: `context:${contextParts[0]?.id ?? endIndex}`,
      parts: contextParts,
    })
    contextStart = -1
  }

  visibleParts.forEach((part, index) => {
    const isContextTool = part.type === "tool" && CONTEXT_TOOLS.has(String(part.tool ?? ""))
    if (isContextTool) {
      if (contextStart < 0) contextStart = index
      return
    }

    flushContext(index - 1)
    items.push({
      type: "part",
      key: `part:${part.id}`,
      part,
    })
  })

  flushContext(visibleParts.length - 1)

  return items
}

function buildTurns(messages: MessageWithParts[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  let current: ChatTurn | undefined

  for (const message of messages) {
    if (message.info.role === "user") {
      current = {
        key: `turn:${message.info.id}`,
        user: message,
        assistants: [],
      }
      turns.push(current)
      continue
    }

    if (!current || !current.user) {
      current = {
        key: `turn:assistant:${message.info.id}`,
        assistants: [message],
      }
      turns.push(current)
      continue
    }

    current.assistants.push(message)
  }

  return turns
}

function CopyAction(props: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    if (!props.value) return
    if (!("clipboard" in navigator)) return

    try {
      await navigator.clipboard.writeText(props.value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          void onCopy()
        }}
        onMouseDown={(e) => e.preventDefault()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={copied ? "Copied" : (props.label ?? "Copy")}
      >
        {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <p>{copied ? "Copied" : (props.label ?? "Copy")}</p>
      </TooltipContent>
    </Tooltip>
  )
}

type HighlightSegment = { text: string; type?: "file" | "agent" }

type HighlightReference = {
  start: number
  end: number
  type: "file" | "agent"
}

function readSourceRange(value: unknown): { start: number; end: number } | undefined {
  if (!isRecord(value)) return undefined

  const start = value.start
  const end = value.end
  if (typeof start !== "number" || typeof end !== "number") return undefined
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return undefined

  return { start, end }
}

function readFileHighlightReference(part: MessagePart): HighlightReference | undefined {
  if (part.type !== "file") return undefined

  const source = isRecord(part.source) ? part.source : undefined
  const textSource = source ? readSourceRange(source.text) : undefined
  if (!textSource) return undefined

  return {
    ...textSource,
    type: "file",
  }
}

function readAgentHighlightReference(part: MessagePart): HighlightReference | undefined {
  if (part.type !== "agent") return undefined

  const source = readSourceRange(part.source)
  if (!source) return undefined

  return {
    ...source,
    type: "agent",
  }
}

function isAttachmentFilePart(part: MessagePart) {
  if (part.type !== "file") return false

  const mime = readString(part.mime)
  if (!mime) return false

  return mime.startsWith("image/") || mime === "application/pdf"
}

function HighlightedText(props: { text: string; references: MessagePart[]; agents: MessagePart[] }) {
  const segments = useMemo(() => {
    const text = props.text
    const allRefs = [...props.references.map(readFileHighlightReference), ...props.agents.map(readAgentHighlightReference)]
      .filter((ref): ref is HighlightReference => ref !== undefined)
      .sort((a, b) => a.start - b.start)

    const result: HighlightSegment[] = []
    let lastIndex = 0

    for (const ref of allRefs) {
      if (ref.start < lastIndex || ref.end > text.length) continue

      if (ref.start > lastIndex) {
        result.push({ text: text.slice(lastIndex, ref.start) })
      }

      result.push({ text: text.slice(ref.start, ref.end), type: ref.type })
      lastIndex = ref.end
    }

    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex) })
    }

    return result
  }, [props.agents, props.references, props.text])

  return (
    <>
      {segments.map((segment, index) => (
        <span
          key={index}
          className={cn(
            segment.type === "file" && "text-primary",
            segment.type === "agent" && "text-foreground font-medium",
          )}
        >
          {segment.text}
        </span>
      ))}
    </>
  )
}

function UserMessagePart(props: {
  part: MessagePart
  info: MessageInfo
  references: MessagePart[]
  agents: MessagePart[]
  queued?: boolean
}) {
  if (props.part.type !== "text") return null
  if (props.part.synthetic === true) return null

  const text = String(props.part.text ?? "")
  const throttledText = useThrottledText(text)
  if (!throttledText.trim()) return null

  const agent = "agent" in props.info ? props.info.agent : undefined
  const metaHead = [titleCase(agent), modelLabel(props.info)].filter((value) => !!value).join("\u00A0\u00B7\u00A0")

  const metaTail = formatTime(props.info.time?.created)

  return (
    <>
      <div className="ml-auto flex w-fit max-w-[min(82%,64ch)] flex-col items-end">
        <div
          className={cn(
            "inline-block max-w-full rounded-md border border-border bg-background px-3 py-2 whitespace-pre-wrap break-words",
            props.queued && "opacity-60",
          )}
        >
          <HighlightedText text={throttledText} references={props.references} agents={props.agents} />
        </div>
        {props.queued && (
          <div className="mt-1.5 mr-0.5 text-xs text-muted-foreground">
            <span className="animate-pulse">Queued</span>
          </div>
        )}
      </div>
      <div className="mt-1 flex min-h-6 w-full items-center justify-end gap-2.5 opacity-0 pointer-events-none transition-opacity group-hover/user:opacity-100 group-hover/user:pointer-events-auto group-focus-within/user:opacity-100 group-focus-within/user:pointer-events-auto">
        {(metaHead || metaTail) && (
          <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden">
            {metaHead && <span className="truncate text-xs text-muted-foreground">{metaHead}</span>}
            {metaHead && metaTail && <span className="text-xs text-muted-foreground">{"\u00A0\u00B7\u00A0"}</span>}
            {metaTail && <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{metaTail}</span>}
          </span>
        )}
        <CopyAction value={text} label="Copy message" />
      </div>
    </>
  )
}

function FileAttachmentPart(props: { part: MessagePart; queued?: boolean }) {
  if (props.part.type !== "file") return null

  const [previewOpen, setPreviewOpen] = useState(false)
  const url = String(props.part.url ?? "")
  const filename = String(props.part.filename ?? "")
  const mime = String(props.part.mime ?? "")
  const isImage = mime.startsWith("image/")

  return (
    <>
      <div
        className={cn(
          "flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border bg-muted transition-colors hover:border-foreground",
          props.queued && "opacity-60",
        )}
        onClick={() => isImage && setPreviewOpen(true)}
        title={filename}
      >
        {isImage ? (
          <img className="h-full w-full object-cover" src={url} alt={filename} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <FolderIcon className="h-5 w-5" />
          </div>
        )}
      </div>

      {isImage && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] p-0 overflow-hidden">
            <img src={url} alt={filename} className="w-full h-full object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function ToolAttachmentGallery(props: { attachments: ToolAttachment[] }) {
  if (props.attachments.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {props.attachments.map((attachment) => {
        const url = resolveAttachmentUrl(attachment.url)
        const label = attachment.filename ?? "attachment"
        const isImage = attachment.mime.startsWith("image/")
        const isPdf = attachment.mime === "application/pdf"

        if (isImage) {
          return (
            <figure
              key={attachment.id}
              data-slot="tool-attachment"
              className="flex max-w-sm flex-col gap-1 rounded-lg border border-border bg-background p-2"
            >
              <img
                data-slot="tool-attachment-image"
                className="h-auto w-full rounded-md"
                src={url}
                alt={label}
                loading="lazy"
              />
              <figcaption className="truncate text-xs text-muted-foreground">{label}</figcaption>
            </figure>
          )
        }

        return (
          <a
            key={attachment.id}
            data-slot="tool-attachment-link"
            className="inline-flex rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted/80"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            {isPdf ? `Open ${label}` : label}
          </a>
        )
      })}
    </div>
  )
}

function AssistantTextPart(props: {
  part: MessagePart
  copyEnabled: boolean
  metaText?: string
  interrupted?: boolean
  stripLeadingFigureImage?: boolean
}) {
  const text = String(props.part.text ?? "")
  const visibleText = props.stripLeadingFigureImage ? stripLeadingRenderFigureMarkdown(text) : text
  const throttledText = useThrottledText(visibleText)
  if (!throttledText.trim()) return null

  return (
    <div className="group/text-part mt-6 w-full">
      <div>
        <Markdown text={throttledText} cacheKey={props.part.id} />
      </div>
      {props.copyEnabled ? (
        <div
          className={cn(
            "mt-1 flex min-h-6 items-center gap-2.5 opacity-0 transition-opacity group-hover/text-part:opacity-100 group-focus-within/text-part:opacity-100",
            "pointer-events-none group-hover/text-part:pointer-events-auto group-focus-within/text-part:pointer-events-auto",
            props.interrupted && "w-full justify-end",
          )}
        >
          <CopyAction value={visibleText} label="Copy response" />
          {props.metaText ? <span className="text-xs text-muted-foreground">{props.metaText}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

function ReasoningPart(props: { part: MessagePart }) {
  const text = String(props.part.text ?? "")
  const throttledText = useThrottledText(text)
  const [isOpen, setIsOpen] = useState(false)
  if (!throttledText.trim()) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="w-full text-muted-foreground">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-expanded={isOpen}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRightIcon className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
            Thinking
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3">
            <Markdown text={throttledText} cacheKey={props.part.id} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function ContextToolGroup(props: { parts: MessagePart[] }) {
  const states = useMemo(() => props.parts.map((part) => parseToolState(part)), [props.parts])
  const [isOpen, setIsOpen] = useState(false)
  const pending = states.some((state) => state.status === "pending" || state.status === "running")
  const summary = contextSummary(props.parts)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full rounded-lg border border-border bg-card p-3">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 text-left">
          <span className="min-w-0 flex items-center gap-2">
            <span className={cn("shrink-0 font-medium text-foreground", pending && "animate-pulse")}>
              {pending ? "Gathering context" : "Gathered context"}
            </span>
            {summary ? <span className="truncate text-sm text-muted-foreground">{summary}</span> : null}
          </span>
          <ChevronRightIcon className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-2">
          {props.parts.map((part, index) => {
            const state = states[index]
            if (!state) return null
            const info = getToolInfo(String(part.tool ?? ""), state.input)
            const running = state.status === "pending" || state.status === "running"
            return (
              <div key={part.id} className="py-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  <span className={cn("font-medium text-foreground", running && "animate-pulse")}>
                    {info.title}
                  </span>
                  {!running && info.subtitle ? <span className="truncate text-muted-foreground">{info.subtitle}</span> : null}
                  {!running &&
                    info.args?.map((arg) => (
                      <span key={`${part.id}:${arg}`} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {arg}
                      </span>
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function toolStatusTone(status: ToolState["status"]) {
  if (status === "completed") {
    return "border-primary/40 bg-primary/10 text-primary"
  }
  if (status === "error") {
    return "border-destructive/40 bg-destructive/10 text-destructive"
  }
  if (status === "running" || status === "pending") {
    return "border-border bg-muted text-muted-foreground"
  }
  return "border-border bg-muted text-muted-foreground"
}

function ToolStatusBadge(props: { status: ToolState["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", toolStatusTone(props.status))}
    >
      {statusLabel(props.status)}
    </Badge>
  )
}

function ToolHeader(props: {
  info: ToolInfo
  status: ToolState["status"]
  running: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={cn("text-sm font-medium text-foreground", props.running && "animate-pulse")}>
          {props.info.title}
        </span>
        {props.info.subtitle ? <span className="truncate text-sm text-muted-foreground">{props.info.subtitle}</span> : null}
        {props.info.detail ? <span className="truncate text-sm text-muted-foreground">{props.info.detail}</span> : null}
        {props.info.args?.map((arg) => (
          <span key={arg} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {arg}
          </span>
        ))}
      </div>
      <ToolStatusBadge status={props.status} />
    </div>
  )
}

function ToolCardWithDetails(props: {
  info: ToolInfo
  status: ToolState["status"]
  running: boolean
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false)

  useEffect(() => {
    if (props.status === "error") setOpen(true)
  }, [props.status])

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full rounded-lg border border-border bg-card p-3">
      <CollapsibleTrigger asChild>
        <button type="button" className="w-full text-left">
          <ToolHeader info={props.info} status={props.status} running={props.running} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2">{props.children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ToolOutputPanel(props: { output: string; status: ToolState["status"]; copyLabel: string }) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <pre
        className={cn(
          "max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground",
          props.status === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        {props.output}
      </pre>
      <div className="flex justify-start">
        <CopyAction value={props.output} label={props.copyLabel} />
      </div>
    </div>
  )
}

function DiagnosticList(props: { diagnostics: ToolDiagnostic[] }) {
  if (props.diagnostics.length === 0) return null

  return (
    <div className="mt-2 flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
      {props.diagnostics.map((diagnostic, index) => (
        <div key={index} className="flex items-baseline gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-destructive">error</span>
          <span className="shrink-0 text-destructive/80">
            [{diagnostic.range.start.line + 1}:{diagnostic.range.start.character + 1}]
          </span>
          <span className="text-destructive/90">{diagnostic.message}</span>
        </div>
      ))}
    </div>
  )
}

function ApplyPatchFileItem(props: { file: ApplyPatchFile }) {
  const [open, setOpen] = useState(props.file.type !== "delete")

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border bg-background">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{props.file.relativePath}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-primary">+{props.file.additions}</span>
              <span className="text-destructive">-{props.file.deletions}</span>
              <span className="capitalize">{props.file.type}</span>
            </div>
          </div>
          <ChevronRightIcon className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-2 border-t border-border p-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Before</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {props.file.before || "(empty)"}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">After</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {props.file.after || "(empty)"}
            </pre>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ToolPartCard(props: { part: MessagePart; onOpenSession?: (sessionID: string) => void }) {
  const state = parseToolState(props.part)
  const tool = String(props.part.tool ?? "")
  const info = getToolInfo(tool, state.input)

  const running = state.status === "pending" || state.status === "running"
  const childSessionId = readString(state.metadata.sessionId)
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const showOutput = output.trim().length > 0
  const filePath = readString(state.input.filePath)
  const diagnostics = readDiagnostics(state.metadata, filePath)
  const applyPatchFiles = readApplyPatchFiles(state.metadata)
  const questions = readQuestions(state.input)
  const questionAnswers = readQuestionAnswers(state.metadata)
  const renderFigure =
    (tool === "render_figure" || tool === "render_freeform_figure") && state.status === "completed"
      ? parseRenderFigureToolOutput(state)
      : undefined
  const shellCommand = readString(state.input.command) ?? readString(state.metadata.command) ?? ""
  const shellOutput = stripAnsi(output || (readString(state.metadata.output) ?? ""))
  const shellText = shellCommand ? `$ ${shellCommand}${shellOutput ? `\n\n${shellOutput}` : ""}` : shellOutput
  const fileDiff = isRecord(state.metadata.filediff) ? state.metadata.filediff : undefined
  const isBuddyCustom = isBuddyCustomTool(tool)

  const cardClassName = "w-full rounded-lg border border-border bg-card p-3"

  if (tool === "task") {
    const openChildSession = childSessionId && props.onOpenSession ? () => props.onOpenSession?.(childSessionId) : undefined
    const content = (
      <>
        <ToolHeader info={info} status={state.status} running={running} />
        {state.status === "error" && showOutput ? <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" /> : null}
      </>
    )

    if (openChildSession && state.status !== "error") {
      return (
        <button type="button" className={cn(cardClassName, "text-left transition-colors hover:border-foreground/30")} onClick={openChildSession}>
          {content}
        </button>
      )
    }

    return <div className={cardClassName}>{content}</div>
  }

  if (renderFigure) {
    const imageUrl = resolveApiUrl(renderFigure.url)
    const copyableImageUrl = stripUrlCredentials(imageUrl)

    return (
      <div className={cardClassName}>
        <ToolHeader info={info} status={state.status} running={running} />
        <figure className="mt-2 rounded-lg border border-border bg-background p-2">
          <img src={imageUrl} alt={renderFigure.alt} loading="lazy" className="h-auto w-full rounded-md" />
        </figure>
        {renderFigure.caption ? <div className="mt-1 text-sm text-muted-foreground">{renderFigure.caption}</div> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CopyAction value={copyableImageUrl} label="Copy image URL" />
          <span className="text-xs text-muted-foreground">
            {renderFigure.repairAttempts > 0
              ? `repaired ${renderFigure.repairAttempts} ${renderFigure.repairAttempts === 1 ? "time" : "times"}`
              : "rendered automatically from tool output"}
          </span>
        </div>
      </div>
    )
  }

  if (tool === "bash") {
    return (
      <ToolCardWithDetails info={info} status={state.status} running={running}>
        {shellText ? <ToolOutputPanel output={shellText} status={state.status} copyLabel="Copy shell output" /> : null}
        {!shellText && state.status === "completed" ? <div className="mt-2 text-xs text-muted-foreground">No output</div> : null}
      </ToolCardWithDetails>
    )
  }

  if (tool === "read") {
    const loadedFiles = readStringList(state.metadata.loaded)
    return (
      <div className={cardClassName}>
        <ToolHeader info={info} status={state.status} running={running} />
        {loadedFiles.length > 0 ? (
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {loadedFiles.map((loadedFile) => (
              <div key={loadedFile}>Loaded {loadedFile}</div>
            ))}
          </div>
        ) : null}
        {state.status === "error" && showOutput ? <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" /> : null}
      </div>
    )
  }

  if (tool === "list" || tool === "glob" || tool === "grep") {
    return (
      <ToolCardWithDetails info={info} status={state.status} running={running}>
        {showOutput ? (
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <Markdown text={output} cacheKey={`${props.part.id}:tool-output`} />
          </div>
        ) : null}
      </ToolCardWithDetails>
    )
  }

  if (tool === "webfetch") {
    const link = readString(state.input.url)

    return (
      <div className={cardClassName}>
        <ToolHeader info={info} status={state.status} running={running} />
        {!running && link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-sm text-primary underline-offset-2 hover:underline"
          >
            {link}
          </a>
        ) : null}
      </div>
    )
  }

  if (tool === "edit" || tool === "write") {
    const beforeText = typeof fileDiff?.before === "string" ? fileDiff.before : undefined
    const afterText = typeof fileDiff?.after === "string" ? fileDiff.after : undefined
    const writeContent = readString(state.input.content)

    return (
      <ToolCardWithDetails info={info} status={state.status} running={running}>
        {filePath ? <div className="text-xs text-muted-foreground">{dirname(filePath)}</div> : null}
        {beforeText !== undefined || afterText !== undefined ? (
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">Before</div>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                {beforeText || "(empty)"}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">After</div>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                {afterText || "(empty)"}
              </pre>
            </div>
          </div>
        ) : null}
        {writeContent ? (
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
            {writeContent}
          </pre>
        ) : null}
        <DiagnosticList diagnostics={diagnostics} />
        {showOutput ? <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" /> : null}
      </ToolCardWithDetails>
    )
  }

  if (tool === "apply_patch") {
    return (
      <ToolCardWithDetails
        info={{
          ...info,
          subtitle: applyPatchFiles.length > 0 ? `${applyPatchFiles.length} ${applyPatchFiles.length === 1 ? "file" : "files"}` : info.subtitle,
        }}
        status={state.status}
        running={running}
      >
        <div>
          {applyPatchFiles.length > 0 ? (
            <div className="space-y-2">
              {applyPatchFiles.map((file) => (
                <ApplyPatchFileItem key={file.filePath} file={file} />
              ))}
            </div>
          ) : null}
          {showOutput ? <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" /> : null}
        </div>
      </ToolCardWithDetails>
    )
  }

  if (tool === "question") {
    const hasAnswers = questionAnswers.length > 0
    const subtitle =
      questions.length === 0
        ? info.subtitle
        : hasAnswers
          ? `${questions.length} answered`
          : `${questions.length} ${questions.length === 1 ? "question" : "questions"}`

    return (
      <ToolCardWithDetails info={{ ...info, subtitle }} status={state.status} running={running} defaultOpen={hasAnswers}>
        {hasAnswers ? (
          <div className="space-y-2">
            {questions.map((question, index) => {
              const answers = questionAnswers[index] ?? []
              return (
                <div key={index} className="rounded-md border border-border bg-background p-2">
                  <div className="text-sm text-foreground">{question.question}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{answers.join(", ") || "(no answer)"}</div>
                </div>
              )
            })}
          </div>
        ) : null}
        {showOutput ? <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" /> : null}
      </ToolCardWithDetails>
    )
  }

  if (tool === "python_calculator") {
    const value = state.metadata.value
    const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)

    return (
      <ToolCardWithDetails info={info} status={state.status} running={running} defaultOpen={state.status !== "pending"}>
        {showOutput ? <ToolOutputPanel output={output} status={state.status} copyLabel="Copy result" /> : null}
        {!showOutput && valueText ? (
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
            {valueText}
          </pre>
        ) : null}
        <ToolAttachmentGallery attachments={state.attachments} />
      </ToolCardWithDetails>
    )
  }

  if (tool === "skill") {
    return (
      <div className={cardClassName}>
        <ToolHeader info={info} status={state.status} running={running} />
      </div>
    )
  }

  if (isBuddyCustom) {
    const artifact = readString(state.metadata.artifact)
    const value = state.metadata.value
    const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)

    return (
      <ToolCardWithDetails
        info={{ ...info, title: titleFromToolName(tool) }}
        status={state.status}
        running={running}
        defaultOpen={state.status !== "pending"}
      >
        {artifact ? (
          <div>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {artifact}
            </Badge>
          </div>
        ) : null}
        {showOutput ? <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" /> : null}
        {!showOutput && valueText ? (
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
            {valueText}
          </pre>
        ) : null}
        <ToolAttachmentGallery attachments={state.attachments} />
      </ToolCardWithDetails>
    )
  }

  return (
    <div className={cardClassName}>
      <ToolHeader info={info} status={state.status} running={running} />
      {state.status === "error" && showOutput ? <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" /> : null}
    </div>
  )
}

function AssistantPartRenderer(props: {
  part: MessagePart
  copyPartID?: string
  metaText?: string
  interrupted?: boolean
  onOpenSession?: (sessionID: string) => void
  stripLeadingFigureImage?: boolean
}) {
  if (props.part.type === "step-start" || props.part.type === "step-finish") {
    return null
  }

  if (props.part.type === "text") {
    return (
      <AssistantTextPart
        part={props.part}
        copyEnabled={props.copyPartID === props.part.id}
        metaText={props.metaText}
        interrupted={props.interrupted}
        stripLeadingFigureImage={props.stripLeadingFigureImage}
      />
    )
  }

  if (props.part.type === "reasoning") {
    return <ReasoningPart part={props.part} />
  }

  if (props.part.type === "tool") {
    return <ToolPartCard part={props.part} onOpenSession={props.onOpenSession} />
  }

  return (
    <div className="w-full rounded-md border border-border bg-background p-2">
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {JSON.stringify(props.part, null, 2)}
      </pre>
    </div>
  )
}

export function ChatTranscript(props: ChatTranscriptProps) {
  const providers = props.providers ?? []
  const turns = useMemo(() => buildTurns(props.messages), [props.messages])

  return (
    <TooltipProvider>
      <div className="flex w-full flex-col items-start gap-12">
        {turns.map((turn, turnIndex) => {
          const isLastTurn = turnIndex === turns.length - 1
          const userMessage = turn.user
          const userParts = userMessage?.parts ?? []
          const userFileParts = userParts.filter((part) => part.type === "file")
          const userAttachmentParts = userFileParts.filter(isAttachmentFilePart)
          const userInlineFileParts = userFileParts.filter((part) => !isAttachmentFilePart(part))
          const userAgentParts = userParts.filter((part) => part.type === "agent")
          const userTextParts = userParts.filter((part) => part.type === "text")

          const assistantMessages = turn.assistants
          const assistantParts = assistantMessages.flatMap((message) => message.parts)
          const assistantItems = groupAssistantParts(assistantParts)
          const assistantTextParts = assistantParts.filter(
            (part) => part.type === "text" && String(part.text ?? "").trim().length > 0,
          )

          const lastAssistantTextID = assistantTextParts.at(-1)?.id
          const lastAssistantInfo = assistantMessages.at(-1)?.info
          const assistantAborted = lastAssistantInfo?.role === "assistant" && lastAssistantInfo.finish === "aborted"
          const assistantCompleted = assistantMessages.reduce<number | undefined>((max, message) => {
            const completed = message.info.time?.completed
            if (typeof completed !== "number") return max
            if (typeof max !== "number") return completed
            return Math.max(max, completed)
          }, undefined)
          const turnStart = userMessage?.info.time?.created ?? assistantMessages[0]?.info.time?.created
          const turnDurationMs =
            typeof turnStart === "number" && typeof assistantCompleted === "number" && assistantCompleted >= turnStart
              ? assistantCompleted - turnStart
              : undefined
          const assistantMetaText = (() => {
            const info = assistantMessages.at(-1)?.info
            if (!info) return ""
            const tokenContext = tokenContextLabel(info, providers)
            return [
              titleCase(info.agent),
              modelLabel(info),
              tokenContext,
              formatDuration(turnDurationMs),
              assistantAborted ? "Interrupted" : "",
            ]
              .filter((value) => !!value)
              .join(" · ")
          })()
          const showAssistantSection = assistantMessages.length > 0 || (props.isBusy && isLastTurn)
          const showThinking = !!props.isBusy && isLastTurn && assistantItems.length === 0
          return (
            <article key={turn.key} className="relative w-full px-4 md:px-5">
              {userMessage ? (
                <div className="group/user flex w-full flex-col items-end gap-2 text-sm">
                  {userAttachmentParts.length > 0 ? (
                    <div className="ml-auto flex w-fit max-w-[min(82%,64ch)] flex-wrap justify-end gap-2">
                      {userAttachmentParts.map((part) => (
                        <FileAttachmentPart key={part.id} part={part} />
                      ))}
                    </div>
                  ) : null}
                  {userTextParts.map((part) => (
                    <UserMessagePart
                      key={part.id}
                      part={part}
                      info={userMessage.info}
                      references={userInlineFileParts}
                      agents={userAgentParts}
                    />
                  ))}
                </div>
              ) : null}

              {showAssistantSection ? (
                <div className="mt-[18px] flex w-full flex-col items-start gap-3">
                  {assistantItems.map((item, itemIndex) => {
                    if (item.type === "context") {
                      return <ContextToolGroup key={item.key} parts={item.parts} />
                    }

                    const previousItem = assistantItems[itemIndex - 1]
                    const previousPart = previousItem?.type === "part" ? previousItem.part : undefined
                    const previousPartState = previousPart ? parseToolState(previousPart) : undefined
                    const stripLeadingFigureImage =
                      item.part.type === "text" &&
                      previousPart?.type === "tool" &&
                      (String(previousPart.tool ?? "") === "render_figure" ||
                        String(previousPart.tool ?? "") === "render_freeform_figure") &&
                      previousPartState?.status === "completed" &&
                      !!parseRenderFigureToolOutput(previousPartState)

                    return (
                      <AssistantPartRenderer
                        key={item.key}
                        part={item.part}
                        copyPartID={lastAssistantTextID}
                        metaText={assistantMetaText}
                        interrupted={assistantAborted}
                        onOpenSession={props.onOpenSession}
                        stripLeadingFigureImage={stripLeadingFigureImage}
                      />
                    )
                  })}
                  {showThinking ? (
                    <div className="flex min-h-5 w-full items-center gap-2 text-sm font-medium text-muted-foreground">
                      <span className="animate-pulse">Thinking</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
