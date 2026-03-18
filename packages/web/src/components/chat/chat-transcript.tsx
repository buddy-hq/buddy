import { useMemo } from "react"
import { TooltipProvider } from "@buddy/ui"
import { computeTokenContextMetrics } from "@/state/context-metrics"
import type { MessageInfo, MessagePart, MessageWithParts, ProviderInfo } from "@/state/chat-types"

// Import all tool components (this registers them)
import "./tools"

// Import shared utilities
import { titleCase, formatDuration } from "./shared/utils"

// Import parts
import {
  UserMessagePart,
  AssistantTextPart,
  ReasoningPart,
  ToolPartCard,
  ContextToolGroup,
  FileAttachmentPart,
} from "./parts"
import { isAttachmentFilePart } from "./shared/highlighted-text"

// Import tool utilities
import { parseToolState } from "./tools/parse-tool-state"
import { parseRenderFigureToolOutput } from "./tools/render-figure-tool"
import { CONTEXT_TOOLS, HIDDEN_TOOLS } from "./tools/registry"

export type { MessageWithParts, ProviderInfo } from "@/state/chat-types"

interface ChatTranscriptProps {
  messages: MessageWithParts[]
  providers?: ProviderInfo[]
  isBusy?: boolean
  onOpenSession?: (sessionID: string) => void
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

function modelLabel(info: MessageInfo): string {
  if ("modelID" in info && info.modelID) {
    return info.modelID
  }
  if ("model" in info && info.model?.modelID) {
    return info.model.modelID
  }
  return ""
}

function tokenContextLabel(info: MessageInfo, providers: ProviderInfo[]): string {
  if (info.role !== "assistant") return ""
  const metrics = computeTokenContextMetrics({
    assistant: info,
    providers,
  })
  if (typeof metrics.remaining === "number") {
    return `${metrics.used.toLocaleString()} used · ${metrics.remaining.toLocaleString()} remaining`
  }
  return `${metrics.used.toLocaleString()} used`
}

function assistantPartRenderable(part: MessagePart): boolean {
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
    const partIsContextTool = part.type === "tool" && CONTEXT_TOOLS.has(String(part.tool ?? ""))
    if (partIsContextTool) {
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

function AssistantPartRenderer({
  part,
  copyPartID,
  metaText,
  interrupted,
  onOpenSession,
  stripLeadingFigureImage,
}: {
  part: MessagePart
  copyPartID?: string
  metaText?: string
  interrupted?: boolean
  onOpenSession?: (sessionID: string) => void
  stripLeadingFigureImage?: boolean
}) {
  if (part.type === "step-start" || part.type === "step-finish") {
    return null
  }

  if (part.type === "text") {
    return (
      <AssistantTextPart
        part={part}
        copyEnabled={copyPartID === part.id}
        metaText={metaText}
        interrupted={interrupted}
        stripLeadingFigureImage={stripLeadingFigureImage}
      />
    )
  }

  if (part.type === "reasoning") {
    return <ReasoningPart part={part} />
  }

  if (part.type === "tool") {
    return <ToolPartCard part={part} onOpenSession={onOpenSession} />
  }

  return (
    <div className="w-full rounded-md border border-border bg-background p-2">
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {JSON.stringify(part, null, 2)}
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
