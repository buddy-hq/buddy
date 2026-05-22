import type { MessagePart } from "@/state/chat-types"

import { formatDuration } from "../../utils/format"
import { reasoningHeading } from "../../utils/markdown"
import { parseToolState } from "../parse-tool-state"
import { parseToolUiMetadata } from "../parse-tool-ui-metadata"
import { getToolInfo } from "../tool-info"
import { isPermissionDenied } from "../tool-permission"
import type {
  ResolvedToolSummary,
  ToolCountSummary,
  ToolIconRenderer,
  ToolInfo,
  ToolPartProps,
  ToolState,
} from "../tool-registry-types"
import { resolveToolRenderer } from "../tool-renderer-resolver"
import { resolveToolSummary } from "../tool-summary-resolver"
import { isRecord } from "../types"

export const ABSTRACTED_THINKING_LABEL = "Thinking"
const ABSTRACTED_THOUGHT_LABEL = "Thought"

export type HiddenStepsEntry = {
  part: MessagePart
  state?: ToolState
  info?: ToolInfo
  summary?: ResolvedToolSummary
  countSummary?: ToolCountSummary
  icon?: ToolIconRenderer
}

export type HiddenStepsContext = {
  followupStartedAt?: number
}

export function getHiddenStepsReasoningLabel(text: string): string {
  return reasoningHeading(text) ?? ABSTRACTED_THINKING_LABEL
}

function readReasoningTime(part: MessagePart) {
  return isRecord(part.time) ? part.time : undefined
}

function reasoningDurationLabel(start: number, end: number): string {
  return formatDuration(Math.max(1000, end - start))
}

function reasoningEffectiveEnd(
  part: MessagePart,
  context?: HiddenStepsContext,
): number | undefined {
  const time = readReasoningTime(part)
  if (typeof time?.end === "number") return time.end
  const followupStartedAt = context?.followupStartedAt
  if (typeof followupStartedAt !== "number") return undefined
  return typeof time?.start === "number" && followupStartedAt >= time.start
    ? followupStartedAt
    : undefined
}

function isReasoningActive(part: MessagePart, context?: HiddenStepsContext): boolean {
  if (part.type !== "reasoning") return false

  return reasoningEffectiveEnd(part, context) === undefined
}

function isToolActive(state: ToolState | undefined): boolean {
  return state?.status === "pending" || state?.status === "running"
}

export function createHiddenStepsEntry(part: MessagePart): HiddenStepsEntry {
  if (part.type !== "tool") {
    return { part }
  }

  const state = parseToolState(part)
  const tool = String(part.tool ?? "")
  const info = getToolInfo(tool, state)
  const renderer = resolveToolRenderer(tool, parseToolUiMetadata(state.metadata))
  const props: ToolPartProps = {
    part,
    state,
    info,
    tool,
  }

  return {
    part,
    state,
    info,
    summary: renderer.summary ? resolveToolSummary(renderer.summary, props) : undefined,
    countSummary: renderer.summary?.countSummary,
    icon: renderer.icon,
  }
}

export function hiddenStepsEntryUsesSummaryRow(entry: HiddenStepsEntry): boolean {
  return entry.part.type === "tool" && entry.summary?.display === "row"
}

export function hiddenStepsEntryIsActive(
  entry: HiddenStepsEntry,
  context?: HiddenStepsContext,
): boolean {
  if (entry.part.type === "reasoning") return isReasoningActive(entry.part, context)
  if (entry.part.type === "tool") {
    return typeof context?.followupStartedAt === "number" ? false : isToolActive(entry.state)
  }
  return false
}

export function getHiddenStepsEntryLabel(
  entry: HiddenStepsEntry,
  context?: HiddenStepsContext,
): string {
  if (entry.part.type === "reasoning") {
    const heading = reasoningHeading(String(entry.part.text ?? "").trim())
    if (!hiddenStepsEntryIsActive(entry, context)) {
      const time = readReasoningTime(entry.part)
      const start = typeof time?.start === "number" ? time.start : undefined
      const end = reasoningEffectiveEnd(entry.part, context)
      if (start !== undefined && end !== undefined) {
        const durationLabel = reasoningDurationLabel(start, end)
        if (heading) {
          return `${ABSTRACTED_THOUGHT_LABEL}: ${heading} · ${durationLabel}`
        }
        return `${ABSTRACTED_THOUGHT_LABEL} for ${durationLabel}`
      }
      if (heading) return `${ABSTRACTED_THOUGHT_LABEL}: ${heading}`
      return ABSTRACTED_THOUGHT_LABEL
    }
    return heading ?? ABSTRACTED_THINKING_LABEL
  }
  return entry.summary?.label ?? entry.info?.title ?? "Tool"
}

export function getGroupDominantIcon(entries: HiddenStepsEntry[]): ToolIconRenderer | undefined {
  const counts = new Map<string, { count: number; icon: ToolIconRenderer }>()
  for (const entry of entries) {
    if (entry.part.type !== "tool" || !entry.icon) continue
    const key = entry.info?.title ?? "unknown"
    const existing = counts.get(key)
    if (existing) {
      existing.count++
    } else {
      counts.set(key, { count: 1, icon: entry.icon })
    }
  }

  let max = 0
  let dominant: ToolIconRenderer | undefined
  for (const { count, icon } of counts.values()) {
    if (count > max) {
      max = count
      dominant = icon
    }
  }
  return dominant
}

function hiddenStepsEntryHasError(entry: HiddenStepsEntry): boolean {
  return entry.part.type === "tool" && entry.state?.status === "error"
}

export function hiddenStepsEntryHasVisibleError(entry: HiddenStepsEntry): boolean {
  // Permission denials are user choices, not failures — don't count as errors.
  if (entry.state && isPermissionDenied(entry.state)) return false
  return hiddenStepsEntryHasError(entry) && entry.summary?.errorVisibility === "visible"
}

const SUMMARY_CUTOFF = 3

function formatCountSummary(cs: ToolCountSummary, count: number): string {
  return `${cs.verb} ${count} ${count === 1 ? cs.singular : cs.plural}`
}

function getReasoningDurationLabel(
  entries: HiddenStepsEntry[],
  context?: HiddenStepsContext,
): string {
  let totalMs = 0
  let hasTiming = false
  for (const entry of entries) {
    if (entry.part.type !== "reasoning") continue
    const time = readReasoningTime(entry.part)
    const start = typeof time?.start === "number" ? time.start : undefined
    const end = reasoningEffectiveEnd(entry.part, context)
    if (start !== undefined && end !== undefined) {
      totalMs += end - start
      hasTiming = true
    }
  }
  if (!hasTiming) return ABSTRACTED_THOUGHT_LABEL
  return `${ABSTRACTED_THOUGHT_LABEL} for ${formatDuration(Math.max(1000, totalMs))}`
}

export function buildHiddenStepsSummary(
  entries: HiddenStepsEntry[],
  input: { isBusy: boolean; followupStartedAt?: number },
): string | undefined {
  const context: HiddenStepsContext = {
    followupStartedAt: input.followupStartedAt,
  }

  // While busy, surface only the active step — count summaries are end-state labels.
  if (input.isBusy) {
    const activeEntry = entries.toReversed().find((entry) => hiddenStepsEntryIsActive(entry, context))
    if (activeEntry) return getHiddenStepsEntryLabel(activeEntry, context)
  }

  // Completed (or no active step): build count summary.
  let hasReasoning = false
  type Group = { count: number; entry: HiddenStepsEntry }
  const groups = new Map<string, Group>()

  for (const entry of entries) {
    if (entry.part.type === "reasoning") {
      hasReasoning = true
    } else if (entry.part.type === "tool" && entry.info?.title) {
      const key = entry.countSummary
        ? `${entry.countSummary.verb}:${entry.countSummary.plural}`
        : entry.info.title
      const existing = groups.get(key)
      if (existing) {
        existing.count++
      } else {
        groups.set(key, { count: 1, entry })
      }
    }
  }

  if (groups.size > 0) {
    const toolSummary = [...groups.values()]
      .toSorted((a, b) => b.count - a.count)
      .slice(0, SUMMARY_CUTOFF)
      .map(({ count, entry }) =>
        entry.countSummary
          ? formatCountSummary(entry.countSummary, count)
          : count === 1
            ? (entry.info?.title ?? "Tool")
            : `${entry.info?.title ?? "Tool"} ×${count}`,
      )
      .join(" · ")
    if (hasReasoning) return `${toolSummary} · ${getReasoningDurationLabel(entries, context)}`
    return toolSummary
  }

  if (hasReasoning) {
    if (entries.length === 1 && entries[0]?.part.type === "reasoning") {
      return getHiddenStepsEntryLabel(entries[0], context)
    }
    return getReasoningDurationLabel(entries, context)
  }

  return undefined
}
