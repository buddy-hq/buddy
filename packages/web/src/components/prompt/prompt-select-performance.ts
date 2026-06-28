import type { MessagePart, MessageWithParts } from "@/state/chat-types"
import { parseToolState } from "@/components/chat/tools/parse-tool-state"
import { isChatToolPart } from "@/components/chat/utils/part-guards"
import { VIRTUAL_CHAT_TURN_ESTIMATE_PX } from "@/components/virtualization/virtualization-defaults"

import { buildTurns } from "@/components/chat/utils/message-utils"
import type { ChatTurn } from "@/components/chat/types"

export const PROMPT_SELECT_MODE_SETTLE_DELAY_MS = 250
export const PROMPT_SELECT_MODE_IDLE_TIMEOUT_MS = 500
export const PROMPT_SELECT_ANALYSIS_TURN_WINDOW = 24
export const PROMPT_SELECT_ANALYSIS_TEXT_THRESHOLD = 140_000
export const PROMPT_SELECT_MATH_SIGNAL_THRESHOLD = 400
export const PROMPT_SELECT_MERMAID_RENDER_THRESHOLD = 100
export const PROMPT_SELECT_FENCED_BLOCK_THRESHOLD = 40
export const PROMPT_SELECT_RENDER_HEAVY_SCORE_THRESHOLD = 700
export const PROMPT_SELECT_MERMAID_SIGNAL_WEIGHT = 0
export const PROMPT_SELECT_CODE_FENCE_SIGNAL_WEIGHT = 4
export const PROMPT_SELECT_RENDER_MERMAID_TOOL_WEIGHT = 0

const MATH_SIGNAL_PATTERN =
  /(\$\$?[^$\n]*|\\\[|\\\(|\\(?:frac|sum|int|prod|sqrt|begin|end|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|nabla|math[a-z]+|operatorname|text|ce|bond)\b)/gu
const MERMAID_BLOCK_PATTERN = /(^|\n)(`{3,}|~{3,})\s*mermaid(?:[ \t][^\n]*)?\r?\n/gu
const FENCED_BLOCK_PATTERN = /(^|\n)(`{3,}|~{3,})[^\n]*\r?\n/gu
const RENDER_MERMAID_TOOL_NAME = "render_mermaid"

export type PromptSelectMode = "radix" | "native"

export type PromptSelectPerformanceSummary = {
  turnCount: number
  analyzedTurnCount: number
  analyzedTextLength: number
  maxMessageTextLength: number
  mathSignalCount: number
  mermaidSignalCount: number
  renderMermaidToolCount: number
  fencedCodeBlockCount: number
  renderHeavySignalScore: number
  estimatedWindowHeight: number
  shouldPreferNativeSelects: boolean
}

function getPartTextLength(part: MessagePart) {
  return typeof part.text === "string" ? part.text.length : 0
}

function countMathSignals(text: string) {
  return text.match(MATH_SIGNAL_PATTERN)?.length ?? 0
}

function countMermaidSignals(text: string) {
  return text.match(MERMAID_BLOCK_PATTERN)?.length ?? 0
}

function countFencedCodeBlocks(text: string) {
  return text.match(FENCED_BLOCK_PATTERN)?.length ?? 0
}

function getMessageTextLength(message: MessageWithParts) {
  return message.parts.reduce((total, part) => total + getPartTextLength(part), 0)
}

function estimatePromptSelectTurnHeight(turn: ChatTurn): number {
  const userPartCount = turn.user?.parts.length ?? 0
  const assistantPartCount = turn.assistants.reduce(
    (count, message) => count + message.parts.length,
    0,
  )
  const assistantMessageCount = turn.assistants.length
  const userTextLength = turn.user ? getMessageTextLength(turn.user) : 0
  const assistantTextLength = turn.assistants.reduce(
    (total, message) => total + getMessageTextLength(message),
    0,
  )
  const combinedTextLength = userTextLength + assistantTextLength

  return Math.max(
    VIRTUAL_CHAT_TURN_ESTIMATE_PX,
    180 +
      userPartCount * 36 +
      assistantPartCount * 40 +
      assistantMessageCount * 48 +
      Math.ceil(combinedTextLength / 220) * 28,
  )
}

function flattenTurns(turns: ReturnType<typeof buildTurns>): MessageWithParts[] {
  const messages: MessageWithParts[] = []

  for (const turn of turns) {
    if (turn.user) {
      messages.push(turn.user)
    }
    messages.push(...turn.assistants)
  }

  return messages
}

export function getPromptSelectPerformanceSummary(
  messages: MessageWithParts[],
): PromptSelectPerformanceSummary {
  const turns = buildTurns(messages)
  // Chat and markdown virtualization keep old history mostly unmounted, so score a recent window.
  const analysisTurns = turns.slice(-PROMPT_SELECT_ANALYSIS_TURN_WINDOW)
  const analysisMessages = flattenTurns(analysisTurns)

  let analyzedTextLength = 0
  let maxMessageTextLength = 0
  let mathSignalCount = 0
  let mermaidSignalCount = 0
  let renderMermaidToolCount = 0
  let fencedCodeBlockCount = 0
  let renderHeavyToolScore = 0

  for (const message of analysisMessages) {
    const messageTextLength = getMessageTextLength(message)
    analyzedTextLength += messageTextLength
    maxMessageTextLength = Math.max(maxMessageTextLength, messageTextLength)

    for (const part of message.parts) {
      if (typeof part.text === "string" && part.text.length > 0) {
        const mermaidCount = countMermaidSignals(part.text)
        const fencedBlockCount = countFencedCodeBlocks(part.text)
        mathSignalCount += countMathSignals(part.text)
        mermaidSignalCount += mermaidCount
        fencedCodeBlockCount += Math.max(0, fencedBlockCount - mermaidCount)
      }

      if (!isChatToolPart(part)) continue

      if (part.tool === RENDER_MERMAID_TOOL_NAME) {
        const toolState = parseToolState(part)
        if (toolState.status !== "completed") continue

        renderMermaidToolCount += 1
        renderHeavyToolScore += PROMPT_SELECT_RENDER_MERMAID_TOOL_WEIGHT
      }
    }
  }

  const estimatedWindowHeight = analysisTurns.reduce(
    (total, turn) => total + estimatePromptSelectTurnHeight(turn),
    0,
  )
  const mermaidRenderCount = mermaidSignalCount + renderMermaidToolCount
  const renderHeavySignalScore =
    mathSignalCount +
    mermaidSignalCount * PROMPT_SELECT_MERMAID_SIGNAL_WEIGHT +
    fencedCodeBlockCount * PROMPT_SELECT_CODE_FENCE_SIGNAL_WEIGHT +
    renderHeavyToolScore
  const hasHeavyMathPressure = mathSignalCount >= PROMPT_SELECT_MATH_SIGNAL_THRESHOLD
  const hasHeavyMermaidPressure = mermaidRenderCount >= PROMPT_SELECT_MERMAID_RENDER_THRESHOLD
  const hasHeavyCodePressure =
    fencedCodeBlockCount >= PROMPT_SELECT_FENCED_BLOCK_THRESHOLD &&
    analyzedTextLength >= PROMPT_SELECT_ANALYSIS_TEXT_THRESHOLD
  const hasHeavyMixedPressure =
    renderHeavySignalScore >= PROMPT_SELECT_RENDER_HEAVY_SCORE_THRESHOLD &&
    analyzedTextLength >= PROMPT_SELECT_ANALYSIS_TEXT_THRESHOLD

  const shouldPreferNativeSelects =
    hasHeavyMathPressure || hasHeavyMermaidPressure || hasHeavyCodePressure || hasHeavyMixedPressure

  return {
    turnCount: turns.length,
    analyzedTurnCount: analysisTurns.length,
    analyzedTextLength,
    maxMessageTextLength,
    mathSignalCount,
    mermaidSignalCount,
    renderMermaidToolCount,
    fencedCodeBlockCount,
    renderHeavySignalScore,
    estimatedWindowHeight,
    shouldPreferNativeSelects,
  }
}
