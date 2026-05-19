import { useMemo, useState } from "react"

import { ChevronRightIcon, cn } from "@buddy/ui"
import { AnimatePresence, motion } from "motion/react"
import { AlertCircle, Panda, Wrench } from "lucide-react"

import type { MessagePart } from "@/state/chat-types"

import type { ToolIconRenderer } from "../tool-registry-types"
import { AssistantPartRenderer } from "../../parts/assistant-part/assistant-part"
import {
  buildHiddenStepsSummary,
  createHiddenStepsEntry,
  getGroupDominantIcon,
  getHiddenStepsEntryLabel,
  hiddenStepsEntryHasVisibleError,
  hiddenStepsEntryIsActive,
  hiddenStepsEntryUsesSummaryRow,
  type HiddenStepsEntry,
} from "./entries"
import { HiddenStepsSummaryRow } from "./summary-row"
import { MOTION_SNAPPY } from "../tool-motion"
import { TextShimmer } from "../text-shimmer"

const DEFAULT_STEPS_TITLE = "Steps"
const SHELL_TOOL_NAME = "bash"

const REASONING_ICON: ToolIconRenderer = (cls) => <Panda className={cls} />
const FALLBACK_ICON: ToolIconRenderer = (cls) => <Wrench className={cls} />

const EXPAND_TRANSITION = { duration: 0.35, ease: [0.4, 0, 0.2, 1] } as const

function entryIcon(entry: HiddenStepsEntry): ToolIconRenderer {
  if (entry.part.type === "reasoning") return REASONING_ICON
  return entry.icon ?? FALLBACK_ICON
}

type HiddenStepsItemEntryProps = {
  entry: HiddenStepsEntry
  directory?: string
  onOpenSession?: (sessionID: string) => void
  copyPartID?: string
  metaText?: string
  interrupted?: boolean
  shellToolDefaultOpen?: boolean
}

function HiddenStepsItemContent({
  entry,
  directory,
  onOpenSession,
  copyPartID,
  metaText,
  interrupted,
  shellToolDefaultOpen,
}: HiddenStepsItemEntryProps) {
  if (hiddenStepsEntryUsesSummaryRow(entry)) {
    return <HiddenStepsSummaryRow entry={entry} directory={directory} />
  }
  return (
    <AssistantPartRenderer
      part={entry.part}
      onOpenSession={onOpenSession}
      directory={directory}
      copyPartID={copyPartID}
      metaText={metaText}
      interrupted={interrupted}
      defaultOpen={
        entry.part.type === "tool" && String(entry.part.tool ?? "") === SHELL_TOOL_NAME
          ? shellToolDefaultOpen
          : undefined
      }
    />
  )
}

function HiddenStepsItemRow(props: HiddenStepsItemEntryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { entry } = props
  const icon = entryIcon(entry)
  const label = getHiddenStepsEntryLabel(entry)

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="group flex w-full cursor-default items-center gap-2 rounded-md px-1 py-1 text-xs text-text-weaker transition-colors hover:bg-surface-weak/50 hover:text-text-weak"
      >
        <span className="shrink-0">{icon("h-3.5 w-3.5 shrink-0")}</span>
        <span className="flex-1 truncate text-left">{label}</span>
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
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="item-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EXPAND_TRANSITION}
            style={{ overflow: "hidden" }}
          >
            <div className="pl-5 pt-1 pb-1">
              <HiddenStepsItemContent {...props} />
            </div>
          </motion.div>
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
  shellToolDefaultOpen?: boolean
}

export function HiddenSteps({
  parts,
  onOpenSession,
  directory,
  copyPartID,
  metaText,
  interrupted,
  isBusy,
  shellToolDefaultOpen,
}: HiddenStepsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { entries, isActive, hasError, summaryDetail, dominantIcon } = useMemo(() => {
    const entries = parts.map((part) => createHiddenStepsEntry(part))
    const isActive = entries.some(hiddenStepsEntryIsActive)
    const hasError = entries.some(hiddenStepsEntryHasVisibleError)
    return {
      entries,
      isActive,
      hasError,
      summaryDetail: buildHiddenStepsSummary(entries, Boolean(isBusy)),
      dominantIcon: getGroupDominantIcon(entries),
    }
  }, [parts, isBusy])

  const title = summaryDetail ?? DEFAULT_STEPS_TITLE
  const animateTitle = isActive && Boolean(isBusy)
  const topIcon: ToolIconRenderer = dominantIcon ?? REASONING_ICON

  const itemProps = {
    directory,
    onOpenSession,
    copyPartID,
    metaText,
    interrupted,
    shellToolDefaultOpen,
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="group flex w-full cursor-default items-center gap-2 text-xs text-text-weaker transition-colors duration-200 hover:text-text-weak active:scale-[0.98]"
      >
        <span className="shrink-0">{topIcon("h-3.5 w-3.5 shrink-0")}</span>
        <TextShimmer text={title} active={animateTitle} />
        {hasError && !isBusy && !isOpen ? (
          <AlertCircle className="h-3 w-3 shrink-0 text-text-weaker" />
        ) : null}
        <div className="h-px grow bg-linear-to-r from-border to-transparent" />
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
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="steps-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EXPAND_TRANSITION}
            style={{ overflow: "hidden" }}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
