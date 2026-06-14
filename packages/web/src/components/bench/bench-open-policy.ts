import { parseToolState } from "@/components/chat/tools/parse-tool-state"
import { isTerminalAssistantMessageInfo } from "@/state/chat-tool-parts"
import type { MessagePart, MessageWithParts } from "@/state/chat-types"
import {
  readHtmlWidgetOutputArtifact,
  type HtmlWidgetToolOutput,
  type HtmlWidgetViewportPreset,
} from "@/lib/html-widgets"
import {
  BENCH_CHAT_LAYOUT_FLOATING,
  type BenchChatLayoutMode,
  type BenchTarget,
} from "@/lib/bench-navigation"

export const BENCH_AUTO_OPEN_POLICY_WHITEBOARD = "whiteboard"
export const BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET = "fullscreen-html-widget"

const WHITEBOARD_CREATE_VIEW_TOOL = "whiteboard_create_view"
const PRESENT_HTML_WIDGET_TOOL = "present_html_widget"
const WHITEBOARD_ROUTE_SUFFIX = "/whiteboard"
const HTML_WIDGET_ROUTE_PREFIX = "/artifacts/html-widget/"
const HTML_WIDGET_FULLSCREEN_VIEWPORT_PRESETS = new Set<HtmlWidgetViewportPreset>([
  "standard_16_10",
  "wide_16_9",
])

export type BenchAutoOpenPolicyID =
  | typeof BENCH_AUTO_OPEN_POLICY_WHITEBOARD
  | typeof BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET

export type BenchAutoOpenCandidate = {
  policyID: BenchAutoOpenPolicyID
  key: string
  target: BenchTarget
  routeSuffix: string
  chatLayout: BenchChatLayoutMode
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

export function shouldAutoOpenBenchCandidate(input: {
  candidate: BenchAutoOpenCandidate | undefined
  pathname: string
  suppressedKey: string | undefined
}): boolean {
  if (!input.candidate) return false
  if (input.pathname.endsWith(input.candidate.routeSuffix)) return false
  return input.candidate.key !== input.suppressedKey
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
    key: `${input.messageID}:${input.part.id}`,
    target: { type: "whiteboard" },
    routeSuffix: WHITEBOARD_ROUTE_SUFFIX,
    chatLayout: BENCH_CHAT_LAYOUT_FLOATING,
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
    key: htmlWidgetAutoOpenKey(widget.artifactID),
    target: {
      type: "artifact",
      kind: "html-widget",
      artifactID: widget.artifactID,
    },
    routeSuffix: `${HTML_WIDGET_ROUTE_PREFIX}${encodeURIComponent(widget.artifactID)}`,
    chatLayout,
  }
}

export function readLatestBenchAutoOpenCandidate(
  messages: MessageWithParts[],
): BenchAutoOpenCandidate | undefined {
  for (const message of messages.toReversed()) {
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

    return undefined
  }

  return undefined
}
