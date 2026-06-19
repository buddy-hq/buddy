import { useMemo, useState, type ReactNode } from "react"

import { ChevronRightIcon, cn } from "@buddy/ui"
import { AnimatePresence, motion } from "motion/react"
import { AlertCircle, Wrench } from "lucide-react"

import type { MessagePart } from "@/state/chat-types"

import type { ToolIconRenderer } from "../tool-registry-types"
import { AssistantPartRenderer } from "../../parts/assistant-part/assistant-part"
import {
  createHiddenStepsEntry,
  getHiddenStepsEntryLabel,
  HIDDEN_STEPS_REASONING_ICON,
  hiddenStepsEntryHasVisibleError,
  hiddenStepsEntryIsActive,
  hiddenStepsEntryUsesSummaryRow,
  resolveHiddenStepsHeader,
  type HiddenStepsEntry,
} from "./entries"
import { useFileToolHeaderDisplay } from "./use-file-tool-header-display"
import { HiddenStepsSummaryRow } from "./summary-row"
import { MOTION_SNAPPY } from "../tool-motion"
import { TextShimmer } from "../text-shimmer"
import { ToolOutputPanel } from "../tool-output-panel"
import { ToolErrorPanel } from "../tool-error-panel"
import { ToolAttachmentGallery } from "../tool-attachments"
import { isPermissionDenied } from "../tool-permission"
import { readString } from "../types"
import { stripAnsi } from "../../utils/path"
import { hasHiddenFileChangeDetails, HiddenFileChangeDetails } from "./file-change-details"

const DEFAULT_STEPS_TITLE = "Steps"

const FALLBACK_ICON: ToolIconRenderer = (cls) => <Wrench className={cls} />

const EXPAND_TRANSITION = { duration: 0.35, ease: [0.4, 0, 0.2, 1] } as const

function entryIcon(entry: HiddenStepsEntry): ToolIconRenderer {
  if (entry.part.type === "reasoning") return HIDDEN_STEPS_REASONING_ICON
  return entry.icon ?? FALLBACK_ICON
}

function hiddenStepsEntrySummaryRowHasDetails(entry: HiddenStepsEntry): boolean {
  if (!hiddenStepsEntryUsesSummaryRow(entry)) return false
  return Boolean(entry.summary?.details?.some((detail) => detail.value.trim().length > 0))
}

function hasStringContent(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function hiddenStepsEntryHasShellText(entry: HiddenStepsEntry): boolean {
  if (entry.part.type !== "tool") return false
  const state = entry.state
  if (!state || isPermissionDenied(state)) return false

  return (
    hasStringContent(readString(state.input.command)) ||
    hasStringContent(readString(state.metadata.command)) ||
    hasStringContent(state.output) ||
    hasStringContent(readString(state.metadata.output)) ||
    (state.status === "error" && hasStringContent(state.error))
  )
}

function hiddenStepsEntryShellText(entry: HiddenStepsEntry): string | undefined {
  if (entry.part.type !== "tool") return undefined
  const state = entry.state
  if (!state || isPermissionDenied(state)) return undefined

  const command = readString(state.input.command) ?? readString(state.metadata.command) ?? ""
  const output =
    state.output ??
    readString(state.metadata.output) ??
    (state.status === "error" ? state.error : undefined) ??
    ""
  const shellOutput = stripAnsi(output)
  const shellText = command ? `$ ${command}${shellOutput ? `\n\n${shellOutput}` : ""}` : shellOutput
  const trimmed = shellText.trim()
  return trimmed ? trimmed : undefined
}

function hiddenStepsEntryHasToolText(entry: HiddenStepsEntry): boolean {
  if (entry.part.type !== "tool") return false
  if (entry.part.tool === "read") return false
  if (entry.part.tool === "skill") return false
  if (entry.part.tool === "bash") return hiddenStepsEntryHasShellText(entry)

  const state = entry.state
  if (!state || isPermissionDenied(state)) return false

  return (
    (state.status === "error" && hasStringContent(state.error)) ||
    hasStringContent(state.output) ||
    hasStringContent(readString(state.metadata.output)) ||
    state.metadata.value !== undefined
  )
}

function hiddenStepsEntryToolText(entry: HiddenStepsEntry): string | undefined {
  if (entry.part.type !== "tool") return undefined
  if (entry.part.tool === "read") return undefined
  if (entry.part.tool === "skill") return undefined
  if (entry.part.tool === "bash") return hiddenStepsEntryShellText(entry)
  const state = entry.state
  if (!state || isPermissionDenied(state)) return undefined

  const text =
    (state.status === "error" ? state.error : undefined) ??
    state.output ??
    readString(state.metadata.output) ??
    (state.metadata.value === undefined ? undefined : JSON.stringify(state.metadata.value, null, 2))
  const trimmed = text?.trim()
  return trimmed ? trimmed : undefined
}

function hiddenStepsEntryHasDetails(entry: HiddenStepsEntry): boolean {
  if (entry.part.type === "reasoning") return true
  if (entry.part.type !== "tool") return false
  if (entry.part.tool === "read") return false
  if (entry.part.tool === "skill") return false
  if (hiddenStepsEntryUsesSummaryRow(entry)) return hiddenStepsEntrySummaryRowHasDetails(entry)
  return Boolean(
    hasHiddenFileChangeDetails(entry) ||
    hiddenStepsEntryHasToolText(entry) ||
    entry.state?.attachments.length,
  )
}

function hiddenStepsEntryHasStreamingReasoning(entry: HiddenStepsEntry, streaming?: boolean) {
  return Boolean(streaming && entry.part.type === "reasoning" && hiddenStepsEntryIsActive(entry))
}

function HiddenStepsContentFrame({ stable, children }: { stable: boolean; children: ReactNode }) {
  return (
    <motion.div
      data-hidden-steps-stable-streaming={stable ? "true" : undefined}
      initial={stable ? false : { height: 0, opacity: 0 }}
      animate={stable ? { opacity: 1 } : { height: "auto", opacity: 1 }}
      exit={stable ? { opacity: 0 } : { height: 0, opacity: 0 }}
      transition={EXPAND_TRANSITION}
      style={stable ? undefined : { overflow: "hidden" }}
    >
      {children}
    </motion.div>
  )
}

function HiddenStepsToolDetails({ entry }: { entry: HiddenStepsEntry }) {
  if (entry.part.type !== "tool" || !entry.state) return null
  const hasFileChangeDetails = hasHiddenFileChangeDetails(entry)
  const text = hiddenStepsEntryToolText(entry)
  const attachments = entry.state.attachments

  return (
    <div className="flex min-w-0 w-full max-w-full flex-col gap-2">
      {hasFileChangeDetails ? <HiddenFileChangeDetails entry={entry} /> : null}
      {text && (!hasFileChangeDetails || entry.state.status === "error") ? (
        entry.state.status === "error" ? (
          <ToolErrorPanel error={text} />
        ) : (
          <ToolOutputPanel output={text} />
        )
      ) : null}
      <ToolAttachmentGallery attachments={attachments} />
    </div>
  )
}

type HiddenStepsItemEntryProps = {
  entry: HiddenStepsEntry
  directory?: string
  onOpenSession?: (sessionID: string) => void
  copyPartID?: string
  metaText?: string
  interrupted?: boolean
  streaming?: boolean
}

function HiddenStepsItemContent({
  entry,
  directory,
  onOpenSession,
  copyPartID,
  metaText,
  interrupted,
  streaming,
}: HiddenStepsItemEntryProps) {
  if (hiddenStepsEntryUsesSummaryRow(entry)) {
    return <HiddenStepsSummaryRow entry={entry} directory={directory} />
  }

  if (entry.part.type === "tool") {
    return <HiddenStepsToolDetails entry={entry} />
  }

  return (
    <AssistantPartRenderer
      part={entry.part}
      onOpenSession={onOpenSession}
      directory={directory}
      copyPartID={copyPartID}
      metaText={metaText}
      interrupted={interrupted}
      streaming={streaming}
    />
  )
}

function HiddenStepsItemRow(props: HiddenStepsItemEntryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { entry } = props
  const icon = entryIcon(entry)
  const label = getHiddenStepsEntryLabel(entry)
  const hasDetails = hiddenStepsEntryHasDetails(entry)
  const stableStreamingDetails = hiddenStepsEntryHasStreamingReasoning(entry, props.streaming)

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasDetails) setIsOpen((v) => !v)
        }}
        className={cn(
          "group flex w-full cursor-default items-center gap-2 rounded-md px-1 py-1 text-xs text-text-weaker transition-colors",
          hasDetails && "hover:bg-surface-weak/50 hover:text-text-weak",
        )}
      >
        <span className="shrink-0">{icon("h-3.5 w-3.5 shrink-0")}</span>
        <span className="flex-1 truncate text-left">{label}</span>
        {hasDetails ? (
          <motion.div
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={MOTION_SNAPPY}
            className={cn(
              "shrink-0 transition-opacity",
              isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </motion.div>
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {hasDetails && isOpen && (
          <HiddenStepsContentFrame stable={stableStreamingDetails}>
            <div className="pl-5 pt-1 pb-1">
              <HiddenStepsItemContent {...props} />
            </div>
          </HiddenStepsContentFrame>
        )}
      </AnimatePresence>
    </div>
  )
}

type HiddenStepsProps = {
  parts: MessagePart[]
  onOpenSession?: (sessionID: string) => void
  directory?: string
  copyPartID?: string
  metaText?: string
  interrupted?: boolean
  isBusy?: boolean
}

export function HiddenSteps({
  parts,
  onOpenSession,
  directory,
  copyPartID,
  metaText,
  interrupted,
  isBusy,
}: HiddenStepsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { entries, isActive, hasError, resolvedHeader } = useMemo(() => {
    const entries = parts.map((part) => createHiddenStepsEntry(part))
    const isActive = entries.some(hiddenStepsEntryIsActive)
    const hasError = entries.some(hiddenStepsEntryHasVisibleError)
    return {
      entries,
      isActive,
      hasError,
      resolvedHeader: resolveHiddenStepsHeader(entries, Boolean(isBusy)),
    }
  }, [parts, isBusy])

  const displayHeader = useFileToolHeaderDisplay({
    label: resolvedHeader.label,
    icon: resolvedHeader.icon,
    throttleFileTools: resolvedHeader.throttleFileTools,
    fileName: resolvedHeader.fileName,
    verb: resolvedHeader.verb,
    isBusy: Boolean(isBusy),
  })

  const title = displayHeader.label ?? DEFAULT_STEPS_TITLE
  const animateTitle = isActive && Boolean(isBusy)
  const canOpen = entries.length > 1 || entries.some(hiddenStepsEntryHasDetails)
  const stableStreamingDetails =
    isOpen && entries.some((entry) => hiddenStepsEntryHasStreamingReasoning(entry, isBusy))
  const hasActiveReasoning = entries.some(
    (entry) => entry.part.type === "reasoning" && hiddenStepsEntryIsActive(entry),
  )
  const topIcon: ToolIconRenderer | undefined = isBusy
    ? (displayHeader.icon ?? (hasActiveReasoning ? HIDDEN_STEPS_REASONING_ICON : undefined))
    : displayHeader.icon

  const itemProps = {
    directory,
    onOpenSession,
    copyPartID,
    metaText,
    interrupted,
    streaming: Boolean(isBusy),
  }

  return (
    <div className="my-2 w-full">
      <button
        type="button"
        onClick={() => {
          if (canOpen) setIsOpen((v) => !v)
        }}
        className="group flex min-w-0 w-full cursor-default items-center gap-2 text-xs text-text-weaker transition-colors duration-200 hover:text-text-weak active:scale-[0.98]"
      >
        {topIcon ? <span className="shrink-0">{topIcon("h-3.5 w-3.5 shrink-0")}</span> : null}
        <TextShimmer text={title} active={animateTitle} truncate className="min-w-0 shrink" />
        {hasError && !isBusy && !isOpen ? (
          <AlertCircle className="h-3 w-3 shrink-0 text-text-weaker" />
        ) : null}
        <div className="h-px min-w-6 grow bg-linear-to-r from-border to-transparent" />
        {canOpen ? (
          <motion.div
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={MOTION_SNAPPY}
            className={cn(
              "shrink-0 transition-opacity",
              isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </motion.div>
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {canOpen && isOpen && (
          <HiddenStepsContentFrame stable={stableStreamingDetails}>
            <div className="mt-1 flex flex-col">
              {entries.length === 1 ? (
                <div className="pl-5 pt-1 pb-1">
                  <HiddenStepsItemContent entry={entries[0]} {...itemProps} />
                </div>
              ) : (
                entries.map((entry) => (
                  <HiddenStepsItemRow key={entry.part.id} entry={entry} {...itemProps} />
                ))
              )}
            </div>
          </HiddenStepsContentFrame>
        )}
      </AnimatePresence>
    </div>
  )
}
