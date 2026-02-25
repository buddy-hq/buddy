import { useEffect, useMemo, useRef, useState } from "react"
import { Markdown } from "@/components/Markdown"
import { computeTokenContextMetrics } from "@/state/context-metrics"
import type { MessageInfo, MessagePart, MessageWithParts, ProviderInfo } from "@/state/chat-types"
import "./chat-transcript.css"

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
  start?: number
  end?: number
  output?: string
  error?: string
  title?: string
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

  return {
    status,
    input,
    metadata,
    start,
    end,
    output,
    error,
    title,
  }
}

function getToolInfo(tool: string, input: Record<string, unknown>) {
  const filePath = typeof input.filePath === "string" ? input.filePath : undefined
  const path = typeof input.path === "string" ? input.path : undefined
  const pattern = typeof input.pattern === "string" ? input.pattern : undefined
  const include = typeof input.include === "string" ? input.include : undefined
  const url = typeof input.url === "string" ? input.url : undefined
  const description = typeof input.description === "string" ? input.description : undefined
  const subagent = typeof input.subagent_type === "string" ? input.subagent_type : undefined

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

function toolProgressLines(part: MessagePart, state: ToolState, nowMs = Date.now()) {
  const metadata = state.metadata
  const lines: string[] = []

  const phase = readString(metadata.phase)
  const agent = readString(metadata.agent)
  const sessionId = readString(metadata.sessionId)
  const elapsedMs = typeof metadata.elapsedMs === "number" ? metadata.elapsedMs : undefined

  if (phase) lines.push(`phase: ${phase}`)
  if (agent) lines.push(`sub-agent: ${agent}`)
  if (sessionId) lines.push(`sub-session: ${sessionId}`)
  if (typeof elapsedMs === "number") {
    lines.push(`elapsed: ${Math.max(0, Math.round(elapsedMs / 1000))}s`)
  } else if ((state.status === "pending" || state.status === "running") && typeof state.start === "number") {
    lines.push(`elapsed: ${Math.max(0, Math.round((nowMs - state.start) / 1000))}s`)
  }

  const progress = isRecord(metadata.progress) ? metadata.progress : undefined
  const tools = progress && isRecord(progress.tools) ? progress.tools : undefined

  if (progress && typeof progress.messages === "number") {
    lines.push(`child messages: ${progress.messages}`)
  }

  if (tools) {
    const pending = typeof tools.pending === "number" ? tools.pending : 0
    const running = typeof tools.running === "number" ? tools.running : 0
    const completed = typeof tools.completed === "number" ? tools.completed : 0
    const error = typeof tools.error === "number" ? tools.error : 0
    lines.push(`child tools: pending=${pending}, running=${running}, completed=${completed}, error=${error}`)
  }

  if (!lines.length && part.type === "tool" && part.tool === "task" && state.status !== "completed") {
    lines.push("running sub-agent...")
  }

  return lines
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

function copyableTextFromParts(input: {
  role: "YOU" | "BUDDY"
  id: string
  parts: MessagePart[]
}) {
  const blocks: string[] = []
  blocks.push(`${input.role} (${input.id})`)

  for (const part of input.parts) {
    if (part.type === "text") {
      blocks.push(String(part.text ?? ""))
      continue
    }

    if (part.type === "reasoning") {
      blocks.push(`[reasoning]\n${String(part.text ?? "")}`)
      continue
    }

    if (part.type === "tool") {
      const state = parseToolState(part)
      const title = String(part.tool ?? "tool")
      const payload = state.output || (state.error ? unwrapError(state.error) : "")
      blocks.push(`[tool:${title} status=${statusLabel(state.status)}]\n${payload}`)
    }
  }

  return blocks.join("\n\n").trim()
}

function CopyAction(props: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    if (!props.value) return
    if (!("clipboard" in navigator)) return

    try {
      await navigator.clipboard.writeText(props.value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <button
      type="button"
      className={props.className ?? "buddy-copy-action"}
      onClick={onCopy}
      title={copied ? "Copied" : props.label ?? "Copy"}
      aria-label={copied ? "Copied" : props.label ?? "Copy"}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

function UserMessagePart(props: { part: MessagePart; info: MessageInfo }) {
  const text = String(props.part.text ?? "")
  const throttledText = useThrottledText(text)
  if (!throttledText.trim()) return null

  const meta = [
    titleCase("agent" in props.info ? props.info.agent : undefined),
    modelLabel(props.info),
    formatTime(props.info.time?.created),
  ]
    .filter((value) => !!value)
    .join(" · ")

  return (
    <div className="buddy-user-bubble-wrap">
      <div className="buddy-user-bubble">
        <Markdown text={throttledText} />
      </div>
      <div className="buddy-message-meta-row">
        {meta ? <span className="buddy-message-meta">{meta}</span> : <span />}
        <CopyAction value={text} className="buddy-copy-action buddy-copy-action-inline" />
      </div>
    </div>
  )
}

function AssistantTextPart(props: {
  part: MessagePart
  copyEnabled: boolean
  metaText?: string
  interrupted?: boolean
}) {
  const text = String(props.part.text ?? "")
  const throttledText = useThrottledText(text)
  if (!throttledText.trim()) return null

  return (
    <div className="buddy-assistant-text-part">
      <div className="buddy-markdown-surface">
        <Markdown text={throttledText} />
      </div>
      {props.copyEnabled ? (
        <div className="buddy-message-meta-row">
          {props.metaText ? (
            <span className="buddy-message-meta" data-interrupted={props.interrupted ? "" : undefined}>
              {props.metaText}
            </span>
          ) : (
            <span />
          )}
          <CopyAction value={text} className="buddy-copy-action buddy-copy-action-inline" />
        </div>
      ) : null}
    </div>
  )
}

function ReasoningPart(props: { part: MessagePart }) {
  const text = String(props.part.text ?? "")
  const throttledText = useThrottledText(text)
  if (!throttledText.trim()) return null

  return (
    <details className="buddy-reasoning-part">
      <summary>Thinking</summary>
      <div className="buddy-reasoning-body">
        <Markdown text={throttledText} />
      </div>
    </details>
  )
}

function toolTitleClass(status: ToolState["status"]) {
  return status === "running" || status === "pending" ? "buddy-tool-title buddy-shimmer" : "buddy-tool-title"
}

function ContextToolGroup(props: { parts: MessagePart[] }) {
  const states = useMemo(() => props.parts.map((part) => parseToolState(part)), [props.parts])
  const pending = states.some((state) => state.status === "pending" || state.status === "running")
  const summary = contextSummary(props.parts)

  return (
    <details className="buddy-context-group" open={pending}>
      <summary>
        <div className="buddy-context-trigger">
          <span className={pending ? "buddy-shimmer" : ""}>{pending ? "Gathering context" : "Gathered context"}</span>
          {summary ? <span className="buddy-context-summary">{summary}</span> : null}
        </div>
      </summary>
      <div className="buddy-context-list">
        {props.parts.map((part, index) => {
          const state = states[index]
          if (!state) return null
          const info = getToolInfo(String(part.tool ?? ""), state.input)
          return (
            <div key={part.id} className="buddy-context-item">
              <div className="buddy-context-item-main">
                <span className={toolTitleClass(state.status)}>{info.title}</span>
                {info.subtitle ? <span className="buddy-context-item-subtitle">{info.subtitle}</span> : null}
                {info.args?.map((arg) => (
                  <span key={`${part.id}:${arg}`} className="buddy-context-item-arg">
                    {arg}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </details>
  )
}

function ToolPartCard(props: {
  part: MessagePart
  onOpenSession?: (sessionID: string) => void
}) {
  const state = parseToolState(props.part)
  const tool = String(props.part.tool ?? "")
  const info = getToolInfo(tool, state.input)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const running = state.status === "pending" || state.status === "running"
    if (!running) return

    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [state.status])

  const progressLines = toolProgressLines(props.part, state, nowMs)
  const childSessionId = readString(state.metadata.sessionId)
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const showOutput = output.trim().length > 0

  const subtitle =
    tool === "task" && childSessionId && props.onOpenSession ? (
      <button
        type="button"
        className="buddy-subagent-link"
        onClick={() => props.onOpenSession?.(childSessionId)}
      >
        {info.subtitle || childSessionId}
      </button>
    ) : info.subtitle ? (
      <span className="buddy-tool-subtitle-text">{info.subtitle}</span>
    ) : null

  if (tool === "task") {
    return (
      <div className="buddy-tool-card buddy-tool-card-task">
        <div className="buddy-tool-summary">
          <div className="buddy-tool-main">
            <span className={toolTitleClass(state.status)}>{info.title}</span>
            {subtitle}
            {info.detail ? <span className="buddy-tool-detail">{info.detail}</span> : null}
            {info.args?.map((arg) => (
              <span key={`${props.part.id}:${arg}`} className="buddy-tool-arg">
                {arg}
              </span>
            ))}
          </div>
          <span className={`buddy-tool-status buddy-tool-status-${state.status}`}>{statusLabel(state.status)}</span>
        </div>

        <div className="buddy-tool-body">
          {state.title ? <div className="buddy-tool-title-meta">{state.title}</div> : null}

          {progressLines.length > 0 ? (
            <div className="buddy-tool-progress-lines">
              {progressLines.map((line, index) => (
                <div key={`${props.part.id}:progress:${index}`}>{line}</div>
              ))}
            </div>
          ) : null}

          {showOutput ? (
            <>
              <pre className="buddy-tool-output" data-status={state.status}>
                {output}
              </pre>
              <CopyAction value={output} className="buddy-copy-action" />
            </>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <details className="buddy-tool-card" open={state.status === "error"}>
      <summary>
        <div className="buddy-tool-summary">
          <div className="buddy-tool-main">
            <span className={toolTitleClass(state.status)}>{info.title}</span>
            {subtitle}
            {info.detail ? <span className="buddy-tool-detail">{info.detail}</span> : null}
            {info.args?.map((arg) => (
              <span key={`${props.part.id}:${arg}`} className="buddy-tool-arg">
                {arg}
              </span>
            ))}
          </div>
          <span className={`buddy-tool-status buddy-tool-status-${state.status}`}>{statusLabel(state.status)}</span>
        </div>
      </summary>

      <div className="buddy-tool-body">
        {state.title ? <div className="buddy-tool-title-meta">{state.title}</div> : null}

        {progressLines.length > 0 ? (
          <div className="buddy-tool-progress-lines">
            {progressLines.map((line, index) => (
              <div key={`${props.part.id}:progress:${index}`}>{line}</div>
            ))}
          </div>
        ) : null}

        {showOutput ? (
          <pre className="buddy-tool-output" data-status={state.status}>
            {output}
          </pre>
        ) : (
          <div className="buddy-tool-output-empty">
            {state.status === "completed" ? "No output" : "Waiting for output..."}
          </div>
        )}

        {showOutput ? <CopyAction value={output} className="buddy-copy-action" /> : null}
      </div>
    </details>
  )
}

function AssistantPartRenderer(props: {
  part: MessagePart
  copyPartID?: string
  metaText?: string
  interrupted?: boolean
  onOpenSession?: (sessionID: string) => void
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
    <div className="buddy-raw-part">
      <pre>{JSON.stringify(props.part, null, 2)}</pre>
    </div>
  )
}

export function ChatTranscript(props: ChatTranscriptProps) {
  const providers = props.providers ?? []
  const turns = useMemo(() => buildTurns(props.messages), [props.messages])

  return (
    <div className="buddy-chat-transcript">
      {turns.map((turn, turnIndex) => {
        const isLastTurn = turnIndex === turns.length - 1
        const userMessage = turn.user

        const assistantMessages = turn.assistants
        const assistantParts = assistantMessages.flatMap((message) => message.parts)
        const assistantItems = groupAssistantParts(assistantParts)
        const assistantTextParts = assistantParts.filter(
          (part) => part.type === "text" && String(part.text ?? "").trim().length > 0,
        )

        const lastAssistantTextID = assistantTextParts.at(-1)?.id
        const assistantAborted = assistantMessages.at(-1)?.info.finish === "aborted"
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
          <article key={turn.key} className="buddy-turn">
            {userMessage ? (
              <section className="buddy-turn-section">
                <header className="buddy-turn-header">
                  <span className="buddy-turn-role">You</span>
                  <CopyAction
                    value={copyableTextFromParts({
                      role: "YOU",
                      id: userMessage.info.id,
                      parts: userMessage.parts,
                    })}
                    className="buddy-copy-action"
                  />
                </header>
                <div className="buddy-turn-body">
                  {userMessage.parts.map((part) => (
                    <UserMessagePart key={part.id} part={part} info={userMessage.info} />
                  ))}
                </div>
              </section>
            ) : null}

            {showAssistantSection ? (
              <section className="buddy-turn-section">
                <header className="buddy-turn-header">
                  <span className="buddy-turn-role">Buddy{assistantAborted ? " (aborted)" : ""}</span>
                  {assistantParts.length > 0 ? (
                    <CopyAction
                      value={copyableTextFromParts({
                        role: "BUDDY",
                        id: assistantMessages[0]?.info.id ?? `turn-${turnIndex}`,
                        parts: assistantParts,
                      })}
                      className="buddy-copy-action"
                    />
                  ) : null}
                </header>
                <div className="buddy-turn-body">
                  {assistantItems.map((item) => {
                    if (item.type === "context") {
                      return <ContextToolGroup key={item.key} parts={item.parts} />
                    }

                    return (
                      <AssistantPartRenderer
                        key={item.key}
                        part={item.part}
                        copyPartID={lastAssistantTextID}
                        metaText={assistantMetaText}
                        interrupted={assistantAborted}
                        onOpenSession={props.onOpenSession}
                      />
                    )
                  })}
                  {showThinking ? <div className="buddy-thinking buddy-shimmer">Thinking...</div> : null}
                </div>
              </section>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
