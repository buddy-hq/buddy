import { createElement } from "react"
import type { ToolPresentationSnapshot } from "@buddy/transcript-contract/tool-presentation"

import { Panda } from "@/icons/app-icons"
import type { MessagePart } from "@/state/chat-types"

import { formatThoughtForLabel } from "../../utils/format"
import { reasoningHeading } from "../../utils/markdown"
import { isChatToolPart } from "../../utils/part-guards"
import { parseToolPresentation } from "../parse-tool-presentation"
import { parseToolState } from "../parse-tool-state"
import { getToolInfo } from "../tool-info"
import type { ToolIconRenderer, ToolInfo, ToolState } from "../tool-registry-types"
import { resolveToolIcon } from "../tool-renderer-resolver"
import { parseTJsonObject, parseTNumber, parseTString } from "../types"

export const ACTIVITY_THINKING_LABEL = "Thinking"
const ACTIVITY_THOUGHT_LABEL = "Thought"
const ACTIVITY_FALLBACK_LABEL = "Steps"
const SETTLED_SUMMARY_LIMIT = 3

export const ACTIVITY_WORKING_LABELS = [
  "Pondering",
  "Foraging",
  "Researching",
  "Reasoning",
  "Digging",
  "Gathering",
  "Pawing",
  "Exploring",
  "Checking",
  "Connecting",
  "Organizing",
  "Drafting",
  "Reviewing",
  "Refining",
  "Preparing",
  "Chomping",
] as const

export const ACTIVITY_REASONING_ICON: ToolIconRenderer = (className) =>
  createElement(Panda, { className })

type VisibleToolPresentationSnapshot = Exclude<ToolPresentationSnapshot, { archetype: "silent" }>

export type ReasoningActivityEntry = {
  kind: "reasoning"
  part: MessagePart
  icon: ToolIconRenderer
}

export type ToolActivityEntry = {
  kind: "tool"
  part: MessagePart
  state: ToolState
  info: ToolInfo
  presentation: VisibleToolPresentationSnapshot
  icon: ToolIconRenderer
}

export type ActivityEntry = ReasoningActivityEntry | ToolActivityEntry

export type ActivityHeader = {
  identity: string
  label: string
  icon: ToolIconRenderer
  shimmer: boolean
}

export function activityHeaderKey(header: ActivityHeader): string {
  return header.identity
}

function entryHeaderIdentity(entry: ActivityEntry): string {
  if (entry.kind === "reasoning") return "reasoning"
  return entry.presentation.archetype === "activity"
    ? `activity:${entry.presentation.summary.category}`
    : `tool:${entry.presentation.renderer}`
}

function isReasoningActive(part: MessagePart): boolean {
  if (part.type !== "reasoning") return false
  const time = parseTJsonObject(part.time)
  return parseTNumber(time?.end) === undefined
}

function isToolActive(state: ToolState): boolean {
  return state.status === "pending" || state.status === "running"
}

export function createActivityEntry(part: MessagePart): ActivityEntry | undefined {
  if (part.type === "reasoning") {
    return { kind: "reasoning", part, icon: ACTIVITY_REASONING_ICON }
  }
  if (!isChatToolPart(part)) return undefined

  const presentation = parseToolPresentation(part)
  if (
    !presentation ||
    presentation.archetype === "silent" ||
    presentation.outcome.type === "silent"
  ) {
    return undefined
  }

  const state = parseToolState(part)
  return {
    kind: "tool",
    part,
    state,
    presentation,
    info: getToolInfo(state, presentation),
    icon: resolveToolIcon(presentation.icon),
  }
}

export function activityEntryIsActive(entry: ActivityEntry): boolean {
  return entry.kind === "reasoning" ? isReasoningActive(entry.part) : isToolActive(entry.state)
}

function reasoningEntryHeading(entry: ReasoningActivityEntry): string | undefined {
  return reasoningHeading(parseTString(entry.part.text)?.trim() ?? "")
}

function reasoningEntryLabel(entry: ReasoningActivityEntry): string {
  const heading = reasoningEntryHeading(entry)
  if (heading) return heading
  if (activityEntryIsActive(entry)) return ACTIVITY_THINKING_LABEL

  const time = parseTJsonObject(entry.part.time)
  const start = parseTNumber(time?.start)
  const end = parseTNumber(time?.end)
  return start !== undefined && end !== undefined
    ? formatThoughtForLabel(end - start)
    : ACTIVITY_THOUGHT_LABEL
}

function toolEntryLabel(entry: ToolActivityEntry): string {
  const { action, detail } = entry.presentation
  return detail ? `${action} ${detail}` : action
}

export function activityEntryLabel(entry: ActivityEntry): string {
  return entry.kind === "reasoning" ? reasoningEntryLabel(entry) : toolEntryLabel(entry)
}

function activeToolLabel(entry: ToolActivityEntry): string {
  return entry.presentation.archetype === "activity"
    ? entry.presentation.summary.label
    : entry.presentation.action
}

function totalReasoningDurationLabel(entries: ActivityEntry[]): string {
  let totalMs = 0
  let hasTiming = false

  for (const entry of entries) {
    if (entry.kind !== "reasoning") continue
    const time = parseTJsonObject(entry.part.time)
    const start = parseTNumber(time?.start)
    const end = parseTNumber(time?.end)
    if (start === undefined || end === undefined) continue
    totalMs += end - start
    hasTiming = true
  }

  return hasTiming ? formatThoughtForLabel(totalMs) : ACTIVITY_THOUGHT_LABEL
}

type SettledSummary = {
  key: string
  label: string
}

type SettledGroup = SettledSummary & {
  identity: string
  count: number
  firstIndex: number
  icon: ToolIconRenderer
}

function successfulToolSummary(entry: ToolActivityEntry): SettledSummary | undefined {
  const { presentation } = entry
  if (
    presentation.archetype !== "activity" ||
    presentation.phase !== "completed" ||
    presentation.outcome.type !== "success"
  ) {
    return undefined
  }
  return { key: presentation.summary.category, label: presentation.summary.label }
}

function neutralToolSummary(entry: ToolActivityEntry): SettledSummary | undefined {
  const { action, outcome } = entry.presentation
  return outcome.type === "neutral" ? { key: outcome.reason, label: action } : undefined
}

function settledToolGroups(
  entries: ActivityEntry[],
  summarize: (entry: ToolActivityEntry) => SettledSummary | undefined,
): SettledGroup[] {
  const groups = new Map<string, SettledGroup>()

  entries.forEach((entry, index) => {
    if (entry.kind !== "tool") return
    const summary = summarize(entry)
    if (!summary) return

    const existing = groups.get(summary.key)
    if (existing) {
      existing.count += 1
      return
    }
    groups.set(summary.key, {
      ...summary,
      identity: entryHeaderIdentity(entry),
      count: 1,
      firstIndex: index,
      icon: entry.icon,
    })
  })

  return [...groups.values()].toSorted(
    (left, right) => right.count - left.count || left.firstIndex - right.firstIndex,
  )
}

function settledGroupsHeader(groups: SettledGroup[]): ActivityHeader | undefined {
  const [first] = groups
  if (!first) return undefined
  return {
    identity: first.identity,
    label: groups
      .slice(0, SETTLED_SUMMARY_LIMIT)
      .map((group) => group.label)
      .join(" · "),
    icon: first.icon,
    shimmer: false,
  }
}

function settledHeader(entries: ActivityEntry[]): ActivityHeader {
  const toolHeader =
    settledGroupsHeader(settledToolGroups(entries, successfulToolSummary)) ??
    settledGroupsHeader(settledToolGroups(entries, neutralToolSummary))
  if (toolHeader) return toolHeader

  if (entries.some((entry) => entry.kind === "reasoning")) {
    return {
      identity: "reasoning",
      label: totalReasoningDurationLabel(entries),
      icon: ACTIVITY_REASONING_ICON,
      shimmer: false,
    }
  }

  return {
    identity: "fallback",
    label: ACTIVITY_FALLBACK_LABEL,
    icon: entries.find((entry) => entry.kind === "tool")?.icon ?? ACTIVITY_REASONING_ICON,
    shimmer: false,
  }
}

export function activityWorkingLabel(seed: string): string {
  const checksum = Array.from(seed).reduce(
    (total, character) => total + (character.codePointAt(0) ?? 0),
    0,
  )
  return (
    ACTIVITY_WORKING_LABELS[checksum % ACTIVITY_WORKING_LABELS.length] ?? ACTIVITY_WORKING_LABELS[0]
  )
}

export function resolveActivityHeader(input: {
  entries: ActivityEntry[]
  busy: boolean
  current: boolean
  zeroEntryLabel: string
}): ActivityHeader {
  const activeEntry = input.entries.toReversed().find(activityEntryIsActive)
  if (activeEntry) {
    const label =
      activeEntry.kind === "tool" ? activeToolLabel(activeEntry) : reasoningEntryLabel(activeEntry)
    return {
      identity: entryHeaderIdentity(activeEntry),
      label,
      icon: activeEntry.icon,
      shimmer: true,
    }
  }

  if (input.busy && input.current) {
    const previousEntry = input.entries.at(-1)
    return {
      // This placeholder renders the reasoning icon, so with no previous entry
      // its identity must be "reasoning" (not a distinct "zero-entry"). The
      // header identity is the AnimatePresence key: a distinct key here would
      // crossfade the (identical) "Thinking" header when the first real
      // reasoning entry arrives — the optimistic/tail thinking-block flash.
      identity: previousEntry ? entryHeaderIdentity(previousEntry) : "reasoning",
      label: input.zeroEntryLabel,
      icon: ACTIVITY_REASONING_ICON,
      shimmer: true,
    }
  }

  return settledHeader(input.entries)
}
