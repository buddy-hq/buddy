import { parseToolState } from "@/components/chat/tools/parse-tool-state"
import { isTerminalAssistantMessageInfo } from "@/state/chat-tool-parts"
import type { MessagePart, MessageWithParts } from "@/state/chat-types"
import {
  readHtmlWidgetOutputArtifact,
  type HtmlWidgetToolOutput,
  type HtmlWidgetViewportPreset,
} from "@/lib/html-widgets"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_CHAT_LAYOUT_FLOATING,
  type BenchAutoOpenPolicyID,
  type BenchChatLayoutMode,
  type BenchTarget,
} from "@/lib/bench-navigation"

export {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
} from "@/lib/bench-navigation"
export type { BenchAutoOpenPolicyID } from "@/lib/bench-navigation"

const WHITEBOARD_CREATE_VIEW_TOOL = "whiteboard_create_view"
const PRESENT_HTML_WIDGET_TOOL = "present_html_widget"
const BENCH_PRESENT_TOOL = "bench_present"
const HTML_WIDGET_FULLSCREEN_VIEWPORT_PRESETS = new Set<HtmlWidgetViewportPreset>([
  "standard_16_10",
  "wide_16_9",
])

export type BenchAutoOpenCandidate = {
  policyID: BenchAutoOpenPolicyID
  eventKey: string
  target: BenchTarget
}

export type BenchPresentationAction =
  | {
      action: "open"
      eventKey: string
      target: BenchTarget
    }
  | {
      action: "close"
      eventKey: string
    }

export function htmlWidgetAutoOpenKey(artifactID: string): string {
  return `${BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET}:${artifactID}`
}

export function isFullscreenHtmlWidgetViewportPreset(
  preset: HtmlWidgetViewportPreset,
): boolean {
  return HTML_WIDGET_FULLSCREEN_VIEWPORT_PRESETS.has(preset)
}

export function resolveHtmlWidgetBenchChatLayout(
  widget: Pick<HtmlWidgetToolOutput, "viewport">,
): BenchChatLayoutMode | undefined {
  return isFullscreenHtmlWidgetViewportPreset(widget.viewport.preset)
    ? BENCH_CHAT_LAYOUT_FLOATING
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readBenchPresentationResult(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== "string") return undefined

  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function readBenchTargetFromPresentationResult(value: unknown): BenchTarget | undefined {
  if (!isRecord(value)) return undefined

  const type = readString(value.type)
  if (type === "whiteboard") {
    return { type: "whiteboard" }
  }

  if (type === "markdown") {
    const path = readString(value.path)
    return path ? { type: "markdown", path } : undefined
  }

  if (type === "file") {
    const path = readString(value.path)
    return path ? { type: "file", path } : undefined
  }

  if (type === "reading") {
    const path = readString(value.path)
    if (!path) return undefined
    const resourceID = readString(value.resourceID)
    return resourceID ? { type: "reading", path, resourceID } : { type: "reading", path }
  }

  return undefined
}

function readBenchPresentationAction(input: {
  messageID: string
  part: MessagePart
}): BenchPresentationAction | undefined {
  if (input.part.type !== "tool" || input.part.tool !== BENCH_PRESENT_TOOL) return undefined

  const state = parseToolState(input.part)
  if (state.status !== "completed") return undefined

  const result = readBenchPresentationResult(state.output)
  const status = readString(result?.status)
  const reason = readString(result?.reason) ?? "unknown"
  const eventKey = `${input.messageID}:${input.part.id}:bench-present:${status ?? "unknown"}:${reason}`

  if (status === "closed") {
    return {
      action: "close",
      eventKey,
    }
  }

  if (status !== "presented" && status !== "already_presenting") {
    return undefined
  }

  const target = readBenchTargetFromPresentationResult(result?.target)
  if (!target) return undefined

  return {
    action: "open",
    eventKey,
    target,
  }
}

function isActiveWhiteboardCreatePart(part: MessagePart): boolean {
  if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL) return false
  const state = parseToolState(part)
  return state.status === "pending" || state.status === "running"
}

function readWhiteboardAutoOpenCandidate(input: {
  messageID: string
  part: MessagePart
}): BenchAutoOpenCandidate | undefined {
  if (!isActiveWhiteboardCreatePart(input.part)) return undefined

  return {
    policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
    eventKey: `${input.messageID}:${input.part.id}`,
    target: { type: "whiteboard" },
  }
}

function readHtmlWidgetAutoOpenCandidate(part: MessagePart): BenchAutoOpenCandidate | undefined {
  if (part.type !== "tool" || part.tool !== PRESENT_HTML_WIDGET_TOOL) return undefined

  const state = parseToolState(part)
  if (state.status !== "completed") return undefined

  const widget = readHtmlWidgetOutputArtifact(state.metadata)
  if (!widget) return undefined

  const chatLayout = resolveHtmlWidgetBenchChatLayout(widget)
  if (!chatLayout) return undefined

  return {
    policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
    eventKey: htmlWidgetAutoOpenKey(widget.artifactID),
    target: {
      type: "artifact",
      kind: "html-widget",
      artifactID: widget.artifactID,
    },
  }
}

export function readLatestBenchPresentationAction(
  messages: MessageWithParts[],
): BenchPresentationAction | undefined {
  for (const message of messages.toReversed()) {
    if (message.info.role === "user") {
      return undefined
    }

    if (message.info.role !== "assistant") {
      continue
    }

    for (const part of message.parts.toReversed()) {
      const action = readBenchPresentationAction({
        messageID: message.info.id,
        part,
      })
      if (action) return action
    }
  }

  return undefined
}

export function readLatestBenchAutoOpenCandidate(
  messages: MessageWithParts[],
): BenchAutoOpenCandidate | undefined {
  for (const message of messages.toReversed()) {
    if (message.info.role === "user") {
      return undefined
    }

    if (message.info.role !== "assistant") {
      continue
    }

    const activeAssistant =
      !isTerminalAssistantMessageInfo(message.info)

    for (const part of message.parts.toReversed()) {
      if (activeAssistant) {
        const whiteboardCandidate = readWhiteboardAutoOpenCandidate({
          messageID: message.info.id,
          part,
        })
        if (whiteboardCandidate) return whiteboardCandidate
      }

      const htmlWidgetCandidate = readHtmlWidgetAutoOpenCandidate(part)
      if (htmlWidgetCandidate) return htmlWidgetCandidate
    }
  }

  return undefined
}
