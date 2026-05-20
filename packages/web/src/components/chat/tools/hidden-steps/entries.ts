import type { MessagePart } from "@/state/chat-types"

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

export function getHiddenStepsReasoningLabel(text: string): string {
  return reasoningHeading(text) ?? ABSTRACTED_THINKING_LABEL
}

function isReasoningActive(part: MessagePart): boolean {
  if (part.type !== "reasoning") return false

  const time = isRecord(part.time) ? part.time : undefined
  return typeof time?.end !== "number"
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

export function hiddenStepsEntryIsActive(entry: HiddenStepsEntry): boolean {
  if (entry.part.type === "reasoning") return isReasoningActive(entry.part)
  if (entry.part.type === "tool") return isToolActive(entry.state)
  return false
}

export function getHiddenStepsEntryLabel(entry: HiddenStepsEntry): string {
  if (entry.part.type === "reasoning") {
    const heading = reasoningHeading(String(entry.part.text ?? "").trim())
    if (heading) return heading
    if (!hiddenStepsEntryIsActive(entry)) {
      const time = isRecord(entry.part.time) ? entry.part.time : undefined
      const start = typeof time?.start === "number" ? time.start : undefined
      const end = typeof time?.end === "number" ? time.end : undefined
      if (start !== undefined && end !== undefined) {
        const seconds = Math.max(1, Math.ceil((end - start) / 1000))
        return `${ABSTRACTED_THOUGHT_LABEL} for ${seconds}s`
      }
      return ABSTRACTED_THOUGHT_LABEL
    }
    return ABSTRACTED_THINKING_LABEL
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

function getReasoningDurationLabel(entries: HiddenStepsEntry[]): string {
  let totalMs = 0
  let hasTiming = false
  for (const entry of entries) {
    if (entry.part.type !== "reasoning") continue
    const time = isRecord(entry.part.time) ? entry.part.time : undefined
    const start = typeof time?.start === "number" ? time.start : undefined
    const end = typeof time?.end === "number" ? time.end : undefined
    if (start !== undefined && end !== undefined) {
      totalMs += end - start
      hasTiming = true
    }
  }
  if (!hasTiming) return ABSTRACTED_THOUGHT_LABEL
  const seconds = Math.max(1, Math.ceil(totalMs / 1000))
  return `${ABSTRACTED_THOUGHT_LABEL} for ${seconds}s`
}

export function buildHiddenStepsSummary(
  entries: HiddenStepsEntry[],
  isBusy: boolean,
): string | undefined {
  // While busy, surface only the active step — count summaries are end-state labels.
  if (isBusy) {
    const activeEntry = entries.toReversed().find(hiddenStepsEntryIsActive)
    if (activeEntry) return getHiddenStepsEntryLabel(activeEntry)
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
    if (hasReasoning) return `${toolSummary} · ${getReasoningDurationLabel(entries)}`
    return toolSummary
  }

  if (hasReasoning) return getReasoningDurationLabel(entries)

  return undefined
}
