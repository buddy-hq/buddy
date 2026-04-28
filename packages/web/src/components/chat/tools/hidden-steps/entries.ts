import type { MessagePart } from "@/state/chat-types"

import { reasoningHeading } from "../../utils/markdown"
import { stripAnsi } from "../../utils/path"
import { parseToolState } from "../parse-tool-state"
import { parseToolUiMetadata } from "../parse-tool-ui-metadata"
import { getToolInfo } from "../tool-info"
import type {
  ResolvedToolSummaryAggregate,
  ResolvedSummaryContentFormat,
  ResolvedToolSummary,
  ToolInfo,
  ToolPartProps,
  ToolState,
} from "../tool-registry-types"
import { resolveToolRenderer } from "../tool-renderer-resolver"
import { resolveToolSummary } from "../tool-summary-resolver"
import { isRecord } from "../types"

const SUMMARY_MAX_LABEL_COUNT = 3
const ABSTRACTED_THINKING_LABEL = "Thinking"
const ABSTRACTED_THOUGHT_LABEL = "Thought"
const ABSTRACTED_WORKING_LABEL = "Working"

export type HiddenStepsEntry = {
  part: MessagePart
  state?: ToolState
  info?: ToolInfo
  summary?: ResolvedToolSummary
}

export type HiddenStepsPreview = {
  title: string
  detail?: string
  kind: ResolvedSummaryContentFormat | "error"
}

type SummaryBucket = {
  key: string
  count: number
  latestLabel: string
  latestIndex: number
  aggregate?: ResolvedToolSummaryAggregate
}

export function getHiddenStepsReasoningLabel(text: string): string {
  return reasoningHeading(text) ?? ABSTRACTED_THINKING_LABEL
}

function normalizeHiddenStepsPreviewText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = stripAnsi(value).replace(/\r\n?/g, "\n").trim()
  return normalized || undefined
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

function hiddenStepsEntryHasError(entry: HiddenStepsEntry): boolean {
  return entry.part.type === "tool" && entry.state?.status === "error"
}

export function hiddenStepsEntryHasVisibleError(entry: HiddenStepsEntry): boolean {
  return hiddenStepsEntryHasError(entry) && entry.summary?.errorVisibility === "visible"
}

function hiddenStepsEntrySummaryLabel(entry: HiddenStepsEntry): string | undefined {
  if (entry.part.type === "reasoning") {
    return getHiddenStepsReasoningLabel(String(entry.part.text ?? "").trim())
  }

  return entry.summary?.label ?? entry.info?.title
}

function hiddenStepsEntrySummaryBucket(
  entry: HiddenStepsEntry,
): { key: string; label: string; aggregate?: ResolvedToolSummaryAggregate } | undefined {
  const label = hiddenStepsEntrySummaryLabel(entry)
  if (!label || entry.part.type === "reasoning") {
    return undefined
  }

  const aggregate = entry.summary?.aggregate
  if (!aggregate) {
    return { key: `label:${label}`, label }
  }

  const bucketLabel =
    aggregate.mode === "label-times" && aggregate.entryLabel === "title"
      ? (entry.info?.title ?? label)
      : label

  return { key: aggregate.key, label: bucketLabel, aggregate }
}

function formatSummaryBucket(bucket: SummaryBucket): string {
  if (bucket.aggregate) {
    switch (bucket.aggregate.mode) {
      case "label-times":
        return bucket.count === 1
          ? bucket.latestLabel
          : `${bucket.aggregate.label} ×${bucket.count}`
      case "action-times":
        return bucket.count === 1
          ? bucket.latestLabel
          : `${bucket.aggregate.action} ${bucket.count} times`
      case "count-items":
        return bucket.count === 1
          ? bucket.latestLabel
          : `${bucket.aggregate.past} ${bucket.count} ${bucket.count === 1 ? bucket.aggregate.singular : bucket.aggregate.plural}`
    }
  }

  return bucket.count === 1 ? bucket.latestLabel : `${bucket.latestLabel} ×${bucket.count}`
}

export function buildHiddenStepsSummary(entries: HiddenStepsEntry[]): string | undefined {
  const buckets = new Map<string, SummaryBucket>()
  let hasReasoning = false

  for (const [index, entry] of entries.entries()) {
    if (entry.part.type === "reasoning") {
      hasReasoning = true
    }

    const bucket = hiddenStepsEntrySummaryBucket(entry)
    if (!bucket) {
      continue
    }

    const existing = buckets.get(bucket.key)
    if (existing) {
      existing.count += 1
      existing.latestLabel = bucket.label
      existing.latestIndex = index
      continue
    }

    buckets.set(bucket.key, {
      key: bucket.key,
      count: 1,
      latestLabel: bucket.label,
      latestIndex: index,
      aggregate: bucket.aggregate,
    })
  }

  const detail = [...buckets.values()]
    .toSorted((left, right) => right.latestIndex - left.latestIndex)
    .slice(0, SUMMARY_MAX_LABEL_COUNT)
    .map((bucket) => formatSummaryBucket(bucket))
    .join(" · ")

  if (detail) {
    return detail
  }

  return hasReasoning ? ABSTRACTED_THOUGHT_LABEL : undefined
}

export function buildHiddenStepsPreview(entry: HiddenStepsEntry | undefined): HiddenStepsPreview {
  if (!entry) {
    return { title: ABSTRACTED_WORKING_LABEL, kind: "text" }
  }

  if (entry.part.type === "reasoning") {
    const text = String(entry.part.text ?? "").trim()

    return {
      title: getHiddenStepsReasoningLabel(text),
      detail: text || undefined,
      kind: "markdown",
    }
  }

  if (entry.part.type === "tool" && entry.info) {
    const errorText =
      entry.state?.status === "error" && entry.summary?.errorVisibility === "visible"
        ? entry.summary.errorPreview
        : undefined
    const previewText = normalizeHiddenStepsPreviewText(
      entry.summary?.preview?.value ?? entry.state?.output,
    )

    return {
      title: entry.info.title,
      detail: errorText ?? previewText ?? entry.info.summary ?? entry.info.subtitle,
      kind: errorText ? "error" : (entry.summary?.preview?.format ?? "text"),
    }
  }

  return { title: ABSTRACTED_WORKING_LABEL, kind: "text" }
}
