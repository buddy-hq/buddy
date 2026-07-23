import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { ChevronRightIcon, cn } from "@buddy/ui"
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react"

import type { MessagePart } from "@/state/chat-types"

import { AssistantPartRenderer } from "../../parts/assistant-part/assistant-part"
import { stripAnsi } from "../../utils/path"
import { ToolAttachmentGallery } from "../tool-attachments"
import { ToolErrorPanel } from "../tool-error-panel"
import { MOTION_SNAPPY } from "../tool-motion"
import { ToolOutputPanel } from "../tool-output-panel"
import { TextShimmer } from "../text-shimmer"
import type { ToolIconRenderer } from "../tool-registry-types"
import { readString } from "../types"
import {
  activityEntryIsActive,
  activityEntryLabel,
  activityHeaderKey,
  createActivityEntry,
  resolveActivityHeader,
  type ActivityEntry,
  type ActivityHeader,
  type ToolActivityEntry,
} from "./entries"
import { ActivityFileChangeDetails, hasActivityFileChangeDetails } from "./file-change-details"

const EXPAND_TRANSITION = { duration: 0.35, ease: [0.4, 0, 0.2, 1] } as const
const HEADER_STATUS_TRANSITION = {
  duration: 0.18,
  ease: [0.23, 1, 0.32, 1],
} as const

// Dead-zone tuning. See docs/dead-zone.md for the vocabulary and the reasoning
// behind these numbers before changing them.
//
// Mid-turn dead zone: a gap between steps while more output is still coming; the
// previous step's label keeps shimmering during the wait. 600ms is an
// intentional, conservative step up from 400ms to cut label churn; may rise to
// ~800ms later.
export const MID_TURN_DEAD_ZONE_MS = 600
// End-of-turn dead zone: the empty tail after the answer, where we can't yet
// tell "the turn is ending" from "a real pause". Higher than mid-turn so the
// end-of-turn flash never paints, while a genuine >1.2s pause still surfaces a
// word.
export const END_OF_TURN_DEAD_ZONE_MS = 1200

function useDelayedWorkingGapHeader(input: {
  resolved: ActivityHeader
  waitingBetweenEntries: boolean
}): ActivityHeader {
  const [revealWorkingGap, setRevealWorkingGap] = useState(false)
  const previousHeaderRef = useRef(input.resolved)

  if (!input.waitingBetweenEntries) previousHeaderRef.current = input.resolved

  useEffect(() => {
    if (!input.waitingBetweenEntries) {
      setRevealWorkingGap(false)
      return
    }

    const timer = setTimeout(() => setRevealWorkingGap(true), MID_TURN_DEAD_ZONE_MS)
    return () => clearTimeout(timer)
  }, [input.waitingBetweenEntries])

  return input.waitingBetweenEntries && !revealWorkingGap
    ? previousHeaderRef.current
    : input.resolved
}

// True only after `active` has held continuously for `delayMs`. Resets the
// moment `active` goes false, so a state that clears before the delay (the
// end-of-turn flash) never flips this on.
function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false)

  useEffect(() => {
    if (!active) {
      setElapsed(false)
      return
    }

    const timer = setTimeout(() => setElapsed(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return active && elapsed
}

function ActivityHeaderStatus(props: { icon: ToolIconRenderer; title: string; shimmer: boolean }) {
  const isPresent = useIsPresent()
  const reduceMotion = useReducedMotion()
  const hiddenState = reduceMotion
    ? { opacity: 0 }
    : {
        opacity: 0,
        filter: "blur(2px)",
        transform: "translateY(1px)",
      }
  const visibleState = reduceMotion
    ? { opacity: 1 }
    : {
        opacity: 1,
        filter: "blur(0px)",
        transform: "translateY(0px)",
      }

  return (
    <motion.span
      aria-hidden={isPresent ? undefined : true}
      className="flex min-w-0 items-center gap-2 [grid-area:1/1]"
      initial={hiddenState}
      animate={visibleState}
      exit={hiddenState}
      transition={reduceMotion ? { duration: 0 } : HEADER_STATUS_TRANSITION}
    >
      <span className="shrink-0">{props.icon("h-3.5 w-3.5 shrink-0")}</span>
      <TextShimmer text={props.title} active={props.shimmer} truncate className="min-w-0 shrink" />
    </motion.span>
  )
}

function hasStringContent(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function toolShellText(entry: ToolActivityEntry): string | undefined {
  const { state } = entry
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

function toolText(entry: ToolActivityEntry): string | undefined {
  if (entry.presentation.outcome.type === "neutral") return undefined

  const { state } = entry
  if (entry.presentation.renderer === "read" || entry.presentation.renderer === "skill") {
    return undefined
  }
  if (entry.presentation.renderer === "todo" && entry.presentation.outcome.type !== "failure") {
    return undefined
  }
  if (entry.presentation.renderer === "bash") return toolShellText(entry)

  const text =
    (state.status === "error" ? state.error : undefined) ??
    state.output ??
    readString(state.metadata.output) ??
    (state.metadata.value === undefined ? undefined : JSON.stringify(state.metadata.value, null, 2))
  const trimmed = text?.trim()
  return trimmed ? trimmed : undefined
}

function activityEntryHasDetails(entry: ActivityEntry): boolean {
  if (entry.kind === "reasoning") return hasStringContent(entry.part.text)
  if (entry.presentation.outcome.type === "neutral") return false
  return Boolean(
    hasActivityFileChangeDetails(entry) || toolText(entry) || entry.state.attachments.length,
  )
}

function activityEntryHasStreamingReasoning(entry: ActivityEntry, streaming: boolean): boolean {
  return Boolean(streaming && entry.kind === "reasoning" && activityEntryIsActive(entry))
}

function ActivityContentFrame({ stable, children }: { stable: boolean; children: ReactNode }) {
  return (
    <motion.div
      data-activity-row-stable-streaming={stable ? "true" : undefined}
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

function ActivityToolDetails({ entry }: { entry: ToolActivityEntry }) {
  const hasFileChangeDetails = hasActivityFileChangeDetails(entry)
  const text = toolText(entry)
  const { attachments } = entry.state
  const failure = entry.presentation.outcome.type === "failure"

  return (
    <div className="flex min-w-0 w-full max-w-full flex-col gap-2">
      {hasFileChangeDetails ? <ActivityFileChangeDetails entry={entry} /> : null}
      {text && (!hasFileChangeDetails || failure) ? (
        failure ? (
          <ToolErrorPanel error={text} />
        ) : (
          <ToolOutputPanel output={text} />
        )
      ) : null}
      <ToolAttachmentGallery attachments={attachments} />
    </div>
  )
}

type ActivityItemProps = {
  entry: ActivityEntry
  directory?: string
  onOpenSession?: (sessionID: string) => void
  copyPartID?: string
  metaText?: string
  interrupted?: boolean
  streaming: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function ActivityItemContent({
  entry,
  directory,
  onOpenSession,
  copyPartID,
  metaText,
  interrupted,
  streaming,
}: ActivityItemProps) {
  if (entry.kind === "tool") return <ActivityToolDetails entry={entry} />

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

function ActivityItemRow(props: ActivityItemProps) {
  const [localOpen, setLocalOpen] = useState(false)
  const { entry } = props
  const isOpen = props.open ?? localOpen
  const hasDetails = activityEntryHasDetails(entry)
  const stableStreamingDetails = activityEntryHasStreamingReasoning(entry, props.streaming)
  const setIsOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(isOpen) : next
    if (props.onOpenChange) {
      props.onOpenChange(value)
      return
    }
    setLocalOpen(value)
  }

  return (
    <div data-activity-entry={entry.kind}>
      <button
        type="button"
        onClick={() => {
          if (hasDetails) setIsOpen((value) => !value)
        }}
        className={cn(
          "group flex w-full cursor-default items-center gap-2 rounded-md px-1 py-1.5 text-xs text-text-weaker transition-colors",
          hasDetails && "hover:bg-surface-weak/50 hover:text-text-weak",
        )}
      >
        <span className="shrink-0">{entry.icon("h-3.5 w-3.5 shrink-0")}</span>
        <span className="flex-1 truncate text-left">{activityEntryLabel(entry)}</span>
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
        {hasDetails && isOpen ? (
          <ActivityContentFrame stable={stableStreamingDetails}>
            <div className="pl-5 pt-1 pb-1">
              <ActivityItemContent {...props} />
            </div>
          </ActivityContentFrame>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

type ActivityRowProps = {
  parts: MessagePart[]
  seed: string
  zeroEntryLabel: string
  onOpenSession?: (sessionID: string) => void
  directory?: string
  copyPartID?: string
  metaText?: string
  interrupted?: boolean
  isBusy?: boolean
  isCurrent?: boolean
  // The start-of-turn "Thinking" placeholder. Shows immediately (it's the
  // "message received" signal); exempt from the end-of-turn dead-zone delay.
  initial?: boolean
  expansionState?: ActivityRowExpansionState
  onExpansionStateChange?: (state: ActivityRowExpansionState) => void
}

export type ActivityRowExpansionState = {
  open: boolean
  itemOpenByPartID: Record<string, boolean>
}

export function ActivityRow({
  parts,
  seed,
  zeroEntryLabel,
  onOpenSession,
  directory,
  copyPartID,
  metaText,
  interrupted,
  isBusy = false,
  isCurrent = isBusy,
  initial = false,
  expansionState,
  onExpansionStateChange,
}: ActivityRowProps) {
  const [localOpen, setLocalOpen] = useState(false)
  const isOpen = expansionState?.open ?? localOpen
  const entries = useMemo(() => parts.flatMap((part) => createActivityEntry(part) ?? []), [parts])
  const resolvedHeader = useMemo(
    () =>
      resolveActivityHeader({
        entries,
        busy: isBusy,
        current: isCurrent,
        zeroEntryLabel,
      }),
    [entries, isBusy, isCurrent, zeroEntryLabel],
  )
  const waitingBetweenEntries = Boolean(
    isBusy && isCurrent && entries.length > 0 && !entries.some(activityEntryIsActive),
  )
  const header = useDelayedWorkingGapHeader({
    resolved: resolvedHeader,
    waitingBetweenEntries,
  })
  // End-of-turn dead zone: an empty, busy tail row that is not the start-of-turn
  // "Thinking" placeholder. Hold it back until END_OF_TURN_DEAD_ZONE_MS so the
  // turn-ending case unmounts before its working word ever paints (the flash),
  // while a genuinely long post-answer pause still reveals one.
  const endOfTurnDeadZone = entries.length === 0 && isBusy && isCurrent && !initial
  const endOfTurnDeadZoneRevealed = useDelayedFlag(endOfTurnDeadZone, END_OF_TURN_DEAD_ZONE_MS)
  const hideEndOfTurnDeadZone = endOfTurnDeadZone && !endOfTurnDeadZoneRevealed
  const canOpen = entries.length > 0
  const stableStreamingDetails =
    isOpen && entries.some((entry) => activityEntryHasStreamingReasoning(entry, isBusy))

  if (entries.length === 0 && !isBusy) return null

  const setIsOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(isOpen) : next
    if (expansionState && onExpansionStateChange) {
      onExpansionStateChange({ ...expansionState, open: value })
      return
    }
    setLocalOpen(value)
  }

  const itemProps = {
    directory,
    onOpenSession,
    copyPartID,
    metaText,
    interrupted,
    streaming: isBusy,
  }

  return (
    <div
      aria-hidden={hideEndOfTurnDeadZone ? true : undefined}
      className={cn("w-full", hideEndOfTurnDeadZone && "invisible")}
      data-activity-row={seed}
    >
      <button
        type="button"
        onClick={() => {
          if (canOpen) setIsOpen((value) => !value)
        }}
        className="group flex min-w-0 w-full cursor-default items-center gap-2 py-1.5 text-xs text-text-weaker transition-colors duration-200 hover:text-text-weak active:scale-[0.98]"
      >
        <span className="inline-grid min-w-0 shrink">
          <AnimatePresence initial={false}>
            <ActivityHeaderStatus
              key={activityHeaderKey(header)}
              icon={header.icon}
              title={header.label}
              shimmer={header.shimmer}
            />
          </AnimatePresence>
        </span>
        {isOpen ? (
          <div className="h-px min-w-6 grow bg-linear-to-r from-border to-transparent" />
        ) : (
          <span className="min-w-0 flex-1" aria-hidden="true" />
        )}
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
        {canOpen && isOpen ? (
          <ActivityContentFrame stable={stableStreamingDetails}>
            <div className="mt-1 flex flex-col">
              {entries.map((entry) => (
                <ActivityItemRow
                  key={entry.part.id}
                  entry={entry}
                  open={expansionState?.itemOpenByPartID[entry.part.id]}
                  onOpenChange={
                    expansionState && onExpansionStateChange
                      ? (open) =>
                          onExpansionStateChange({
                            ...expansionState,
                            itemOpenByPartID: {
                              ...expansionState.itemOpenByPartID,
                              [entry.part.id]: open,
                            },
                          })
                      : undefined
                  }
                  {...itemProps}
                />
              ))}
            </div>
          </ActivityContentFrame>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
