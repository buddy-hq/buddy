import { createElement } from "react"
import { Panda } from "lucide-react"

import type { MessagePart } from "@/state/chat-types"

import { formatThoughtForLabel } from "../../utils/format"
import { reasoningHeading } from "../../utils/markdown"
import {
  getPatchFileCount,
  isFileToolName,
  isMultiFilePatch,
  resolveFileToolFileName,
  resolveFileToolIcon,
  resolveFileToolPath,
  resolveSettledFileToolIcon,
  type TFileToolName,
} from "../file-tool-icon"
import { parseToolState } from "../parse-tool-state"
import { parseToolUiMetadata } from "../parse-tool-ui-metadata"
import {
  formatSkillReferenceBurstLabel,
  formatSettledSkillToolCountLabel,
  formatSettledSkillToolLabel,
  getSkillReferenceBurstVerb,
  getSkillReferenceGroupKey,
  resolveSkillReferenceInfo,
} from "../skill-reference"
import { getToolInfo } from "../tool-info"
import { SKILL_TOOL_ICON } from "../tool-icons"
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

export const HIDDEN_STEPS_REASONING_ICON: ToolIconRenderer = (className) =>
  createElement(Panda, { className })

const FILE_TOOL_VERBS: Record<TFileToolName, string> = {
  read: "Reading",
  edit: "Editing",
  write: "Writing",
  apply_patch: "Patching",
}

export type THiddenStepsHeaderResult = {
  label?: string
  icon?: ToolIconRenderer
  throttleFileTools?: boolean
  fileName?: string
  verb?: string
}

type TFileToolHeaderTarget = {
  label: string
  icon?: ToolIconRenderer
  fileName?: string
  verb: string
}

type TResolvedFileTarget = {
  fileName?: string
  isSkillReference: boolean
}

function formatFileToolBurstLabel(verb: string, fileName?: string): string {
  return fileName ? `${verb} ${fileName}` : verb
}

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

  const entryIcon = isFileToolName(tool)
    ? resolveFileToolIcon(tool, state, info, renderer.icon)
    : renderer.icon

  return {
    part,
    state,
    info,
    summary: renderer.summary ? resolveToolSummary(renderer.summary, props) : undefined,
    countSummary: renderer.summary?.countSummary,
    icon: entryIcon,
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
        return formatThoughtForLabel(end - start)
      }
      return ABSTRACTED_THOUGHT_LABEL
    }
    return ABSTRACTED_THINKING_LABEL
  }
  return entry.summary?.label ?? entry.info?.title ?? "Tool"
}

function hiddenStepsToolGroupKey(entry: HiddenStepsEntry): string | undefined {
  if (entry.part.type !== "tool") return undefined
  const skillName = String(entry.part.tool ?? "") === "skill" ? entry.info?.subtitle : undefined
  if (skillName) {
    return getSkillReferenceGroupKey(skillName)
  }
  const skillReference =
    String(entry.part.tool ?? "") === "read" && entry.state && entry.info
      ? resolveSkillReferenceInfo({
          filePath: resolveFileToolPath("read", entry.state, entry.info),
          title: entry.info.title,
          subtitle: entry.info.subtitle,
          detail: entry.info.detail,
        })
      : undefined
  if (skillReference) {
    return getSkillReferenceGroupKey(skillReference.skillName)
  }
  if (entry.countSummary) {
    return `${entry.countSummary.verb}:${entry.countSummary.plural}`
  }
  return entry.info?.title ?? String(entry.part.tool ?? "unknown")
}

function hiddenStepsSettledEntryIcon(entry: HiddenStepsEntry): ToolIconRenderer | undefined {
  if (entry.part.type !== "tool" || !entry.state || !entry.info) return undefined

  const tool = String(entry.part.tool ?? "")
  if (isFileToolName(tool)) {
    return resolveSettledFileToolIcon(
      tool,
      entry.state,
      entry.info,
      resolveToolRenderer(tool, parseToolUiMetadata(entry.state.metadata)).icon,
    )
  }

  return entry.icon
}

function hiddenStepsSettledIconKey(entry: HiddenStepsEntry): string {
  if (entry.part.type !== "tool") return "unknown"

  const tool = String(entry.part.tool ?? "")
  if (
    isFileToolName(tool) &&
    entry.state &&
    entry.info &&
    tool === "read" &&
    resolveSkillReferenceInfo({
      filePath: resolveFileToolPath(tool, entry.state, entry.info),
      title: entry.info.title,
      subtitle: entry.info.subtitle,
      detail: entry.info.detail,
    })
  ) {
    return "skill"
  }
  if (isFileToolName(tool)) return tool

  return entry.info?.title ?? tool
}

export function getGroupDominantIcon(entries: HiddenStepsEntry[]): ToolIconRenderer | undefined {
  const toolGroups = new Map<string, { count: number; entries: HiddenStepsEntry[] }>()

  for (const entry of entries) {
    if (entry.part.type !== "tool") continue
    const key = hiddenStepsToolGroupKey(entry)
    if (!key) continue

    const existing = toolGroups.get(key)
    if (existing) {
      existing.count++
      existing.entries.push(entry)
    } else {
      toolGroups.set(key, { count: 1, entries: [entry] })
    }
  }

  let maxToolCount = 0
  let dominantEntries: HiddenStepsEntry[] = []
  for (const { count, entries: groupEntries } of toolGroups.values()) {
    if (count > maxToolCount) {
      maxToolCount = count
      dominantEntries = groupEntries
    }
  }

  if (dominantEntries.length === 0) {
    return entries.some((entry) => entry.part.type === "reasoning")
      ? HIDDEN_STEPS_REASONING_ICON
      : undefined
  }

  const iconCounts = new Map<string, { count: number; icon: ToolIconRenderer }>()
  for (const entry of dominantEntries) {
    const icon = hiddenStepsSettledEntryIcon(entry)
    if (!icon) continue
    const key = hiddenStepsSettledIconKey(entry)
    const existing = iconCounts.get(key)
    if (existing) {
      existing.count++
    } else {
      iconCounts.set(key, { count: 1, icon })
    }
  }

  let maxIconCount = 0
  let dominant: ToolIconRenderer | undefined
  for (const { count, icon } of iconCounts.values()) {
    if (count > maxIconCount) {
      maxIconCount = count
      dominant = icon
    }
  }

  return dominant
}

export function getActiveHiddenStepsEntry(entries: HiddenStepsEntry[]): HiddenStepsEntry | undefined {
  return entries.toReversed().find(hiddenStepsEntryIsActive)
}

function findActiveEntryAndIndex(entries: HiddenStepsEntry[]): {
  activeEntry?: HiddenStepsEntry
  activeIndex: number
} {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (hiddenStepsEntryIsActive(entries[i])) {
      return { activeEntry: entries[i], activeIndex: i }
    }
  }
  return { activeIndex: -1 }
}

function findMostRecentToolEntry(
  entries: HiddenStepsEntry[],
): { entry: HiddenStepsEntry; index: number } | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].part.type === "tool") {
      return { entry: entries[i], index: i }
    }
  }
  return undefined
}

function resolveFileTargetForEntry(entry: HiddenStepsEntry): TResolvedFileTarget | undefined {
  if (entry.part.type !== "tool" || !entry.state || !entry.info) return undefined
  const tool = String(entry.part.tool ?? "")
  if (!isFileToolName(tool)) return undefined
  if (tool === "read") {
    const skillReference = resolveSkillReferenceInfo({
      filePath: resolveFileToolPath(tool, entry.state, entry.info),
      title: entry.info.title,
      subtitle: entry.info.subtitle,
      detail: entry.info.detail,
    })
    if (skillReference) {
      return {
        fileName: skillReference.displayName,
        isSkillReference: true,
      }
    }
  }
  return {
    fileName: resolveFileToolFileName(tool, entry.state, entry.info),
    isSkillReference: false,
  }
}

function multiFilePatchLabel(state: ToolState): string {
  const count = getPatchFileCount(state)
  return `Patching ${count} files`
}

function findLastKnownFileTarget(
  entries: HiddenStepsEntry[],
  fromIndex: number,
): TResolvedFileTarget | undefined {
  for (let i = fromIndex; i >= 0; i--) {
    const entry = entries[i]
    if (entry.part.type === "reasoning") continue
    if (entry.part.type !== "tool") continue

    const tool = String(entry.part.tool ?? "")
    if (!isFileToolName(tool)) break

    if (tool === "apply_patch" && entry.state && isMultiFilePatch(entry.state)) break

    const target = resolveFileTargetForEntry(entry)
    if (target?.fileName) return target
  }
  return undefined
}

export function resolveFileToolHeaderTarget(
  entries: HiddenStepsEntry[],
  isBusy: boolean,
): TFileToolHeaderTarget | undefined {
  if (!isBusy) return undefined

  const { activeEntry, activeIndex } = findActiveEntryAndIndex(entries)

  if (activeEntry) {
    if (activeEntry.part.type === "reasoning") return undefined
    if (activeEntry.part.type !== "tool") return undefined

    const activeTool = String(activeEntry.part.tool ?? "")
    if (!isFileToolName(activeTool)) return undefined
    const activeSkillReference =
      activeTool === "read" && activeEntry.state && activeEntry.info
        ? resolveSkillReferenceInfo({
            filePath: resolveFileToolPath(activeTool, activeEntry.state, activeEntry.info),
            title: activeEntry.info.title,
            subtitle: activeEntry.info.subtitle,
            detail: activeEntry.info.detail,
          })
        : undefined

    if (
      activeTool === "apply_patch" &&
      activeEntry.state &&
      isMultiFilePatch(activeEntry.state)
    ) {
      return {
        label: multiFilePatchLabel(activeEntry.state),
        fileName: undefined,
        verb: FILE_TOOL_VERBS.apply_patch,
      }
    }

    const activePath =
      activeTool === "read" && activeEntry.state && activeEntry.info
        ? resolveFileToolPath(activeTool, activeEntry.state, activeEntry.info)
        : undefined
    const lastKnownFileTarget =
      activeIndex >= 0 ? findLastKnownFileTarget(entries, activeIndex - 1) : undefined
    let fileName = resolveFileTargetForEntry(activeEntry)?.fileName
    if (!fileName && lastKnownFileTarget?.fileName) {
      fileName = lastKnownFileTarget.fileName
    }
    const verb = FILE_TOOL_VERBS[activeTool]
    if (activeSkillReference) {
      return {
        label: formatSkillReferenceBurstLabel(activeSkillReference.displayName),
        icon: SKILL_TOOL_ICON,
        fileName: activeSkillReference.displayName,
        verb: getSkillReferenceBurstVerb(),
      }
    }
    if (activeTool === "read" && !activePath && lastKnownFileTarget?.isSkillReference) {
      return {
        label: getSkillReferenceBurstVerb(),
        icon: SKILL_TOOL_ICON,
        fileName: undefined,
        verb: getSkillReferenceBurstVerb(),
      }
    }
    return {
      label: formatFileToolBurstLabel(verb, fileName),
      fileName,
      verb,
    }
  }

  const lastTool = findMostRecentToolEntry(entries)
  if (!lastTool) return undefined

  const lastToolName = String(lastTool.entry.part.tool ?? "")
  if (!isFileToolName(lastToolName)) return undefined

  if (
    lastToolName === "apply_patch" &&
    lastTool.entry.state &&
    isMultiFilePatch(lastTool.entry.state)
  ) {
    return {
      label: multiFilePatchLabel(lastTool.entry.state),
      fileName: undefined,
      verb: FILE_TOOL_VERBS.apply_patch,
    }
  }

  const lastToolPath =
    lastToolName === "read" && lastTool.entry.state && lastTool.entry.info
      ? resolveFileToolPath(lastToolName, lastTool.entry.state, lastTool.entry.info)
      : undefined
  const lastKnownFileTarget = findLastKnownFileTarget(entries, lastTool.index - 1)
  let fileName = resolveFileTargetForEntry(lastTool.entry)?.fileName
  if (!fileName && lastKnownFileTarget?.fileName) {
    fileName = lastKnownFileTarget.fileName
  }
  const verb = FILE_TOOL_VERBS[lastToolName]
  const lastSkillReference =
    lastToolName === "read" && lastTool.entry.state && lastTool.entry.info
      ? resolveSkillReferenceInfo({
          filePath: resolveFileToolPath(lastToolName, lastTool.entry.state, lastTool.entry.info),
          title: lastTool.entry.info.title,
          subtitle: lastTool.entry.info.subtitle,
          detail: lastTool.entry.info.detail,
        })
      : undefined
  if (lastSkillReference) {
    return {
      label: formatSkillReferenceBurstLabel(lastSkillReference.displayName),
      icon: SKILL_TOOL_ICON,
      fileName: lastSkillReference.displayName,
      verb: getSkillReferenceBurstVerb(),
    }
  }
  if (lastToolName === "read" && !lastToolPath && lastKnownFileTarget?.isSkillReference) {
    return {
      label: getSkillReferenceBurstVerb(),
      icon: SKILL_TOOL_ICON,
      fileName: undefined,
      verb: getSkillReferenceBurstVerb(),
    }
  }
  if (fileName) {
    return { label: formatFileToolBurstLabel(verb, fileName), fileName, verb }
  }

  return { label: verb, fileName: undefined, verb }
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
  return formatThoughtForLabel(totalMs)
}

export function buildHiddenStepsSummary(
  entries: HiddenStepsEntry[],
  isBusy: boolean,
): string | undefined {
  // While busy, surface only the active step — count summaries are end-state labels.
  if (isBusy) {
    const activeEntry = getActiveHiddenStepsEntry(entries)
    if (activeEntry) return getHiddenStepsEntryLabel(activeEntry)
  }

  // Completed (or no active step): build count summary.
  let hasReasoning = false
  type Group = { count: number; entry: HiddenStepsEntry; skillName?: string }
  const groups = new Map<string, Group>()

  for (const entry of entries) {
    if (entry.part.type === "reasoning") {
      hasReasoning = true
    } else if (entry.part.type === "tool" && entry.info?.title) {
      const skillName = String(entry.part.tool ?? "") === "skill" ? entry.info.subtitle : undefined
      const skillReference =
        String(entry.part.tool ?? "") === "read" && entry.state && entry.info
          ? resolveSkillReferenceInfo({
              filePath: resolveFileToolPath("read", entry.state, entry.info),
              title: entry.info.title,
              subtitle: entry.info.subtitle,
              detail: entry.info.detail,
            })
          : undefined
      const resolvedSkillName = skillName ?? skillReference?.skillName
      const key = resolvedSkillName
        ? getSkillReferenceGroupKey(resolvedSkillName)
        : entry.countSummary
          ? `${entry.countSummary.verb}:${entry.countSummary.plural}`
          : entry.info.title
      const existing = groups.get(key)
      if (existing) {
        existing.count++
      } else {
        groups.set(key, { count: 1, entry, ...(resolvedSkillName ? { skillName: resolvedSkillName } : {}) })
      }
    }
  }

  if (groups.size > 0) {
    const sortedGroups = [...groups.values()].toSorted((a, b) => b.count - a.count)
    const skillGroups = sortedGroups.filter((group) => group.skillName)
    const nonSkillGroups = sortedGroups.filter((group) => !group.skillName)
    const summaryParts: string[] = []

    if (skillGroups.length === 1) {
      const skillName = skillGroups[0]?.skillName
      if (skillName) summaryParts.push(formatSettledSkillToolLabel(skillName))
    } else if (skillGroups.length > 1) {
      summaryParts.push(formatSettledSkillToolCountLabel(skillGroups.length))
    }

    summaryParts.push(
      ...nonSkillGroups.slice(0, Math.max(0, SUMMARY_CUTOFF - summaryParts.length)).map(({ count, entry }) =>
        entry.countSummary
          ? formatCountSummary(entry.countSummary, count)
          : count === 1
            ? (entry.info?.title ?? "Tool")
            : `${entry.info?.title ?? "Tool"} ×${count}`,
      ),
    )

    const toolSummary = summaryParts.join(" · ")
    if (hasReasoning) return `${toolSummary} · ${getReasoningDurationLabel(entries)}`
    return toolSummary
  }

  if (hasReasoning) return getReasoningDurationLabel(entries)

  return undefined
}

export function resolveHiddenStepsHeader(
  entries: HiddenStepsEntry[],
  isBusy: boolean,
): THiddenStepsHeaderResult {
  if (isBusy) {
    const fileTarget = resolveFileToolHeaderTarget(entries, isBusy)
    if (fileTarget) {
      return {
        label: fileTarget.label,
        icon: fileTarget.icon,
        throttleFileTools: true,
        fileName: fileTarget.fileName,
        verb: fileTarget.verb,
      }
    }
  }

  const activeEntry = isBusy ? getActiveHiddenStepsEntry(entries) : undefined
  if (activeEntry) {
    return {
      label: getHiddenStepsEntryLabel(activeEntry),
      icon: activeEntry.icon,
      throttleFileTools: false,
    }
  }

  return {
    label: buildHiddenStepsSummary(entries, isBusy),
    icon: getGroupDominantIcon(entries),
    throttleFileTools: false,
  }
}
