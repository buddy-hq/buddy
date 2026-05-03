import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Markdown } from "@/components/markdown/Markdown"
import {
  ChevronRightIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@buddy/ui"
import { AnimatePresence, motion } from "motion/react"

import type { MessagePart } from "@/state/chat-types"

import { AssistantPartRenderer } from "../../parts/assistant-part/assistant-part"
import { useThrottledText } from "../../hooks/use-throttled-text"
import {
  buildHiddenStepsSummary,
  buildHiddenStepsPreview,
  createHiddenStepsEntry,
  hiddenStepsEntryHasVisibleError,
  hiddenStepsEntryIsActive,
  hiddenStepsEntryUsesSummaryRow,
  type HiddenStepsEntry,
  type HiddenStepsPreview,
} from "./entries"
import { HiddenStepsSummaryRow } from "./summary-row"
import {
  HIDDEN_STEPS_ERROR_CLASS_NAME,
  HIDDEN_STEPS_MARKDOWN_CLASS_NAME,
  HIDDEN_STEPS_TEXT_CLASS_NAME,
} from "./styles"

import { CONTENT_REVEAL_TRANSITION, MOTION_GENTLE, MOTION_SNAPPY } from "../tool-motion"
import { TextShimmer } from "../text-shimmer"

const DEFAULT_STEPS_TITLE = "Steps"
const PREVIEW_MAX_HEIGHT_PX = 80
const SHELL_TOOL_NAME = "bash"

type HiddenStepsProps = {
  parts: MessagePart[]
  onOpenSession?: (sessionID: string) => void
  directory?: string
  copyPartID?: string
  metaText?: string
  interrupted?: boolean
  isBusy?: boolean
  collapsePreview?: boolean
  shellToolDefaultOpen?: boolean
}

type HiddenStepsToggleProps = {
  isOpen: boolean
  title: string
  showLivePreview: boolean
  animateLiveTitle: boolean
  errorCount: number
  summaryDetail?: string
}

type HiddenStepsPreviewPanelProps = {
  showPreview: boolean
  preview: HiddenStepsPreview
  previewText: string
  previewPartID?: string
  previewViewportHeight?: number
}

function HiddenStepsToggle({
  isOpen,
  title,
  showLivePreview,
  animateLiveTitle,
  errorCount,
  summaryDetail,
}: HiddenStepsToggleProps) {
  return (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        className="group flex w-full cursor-default items-center gap-3 transition-transform duration-200 ease-out active:scale-[0.98]"
      >
        <div className="flex shrink-0 items-center gap-2 text-xs text-text-weaker transition-colors duration-200 group-hover:text-text-weak">
          <span
            className={cn(
              "relative truncate",
              showLivePreview
                ? "text-text-base transition-colors group-hover:text-text-strong"
                : errorCount > 0
                  ? "text-icon-critical-base"
                  : "text-inherit",
            )}
          >
            {showLivePreview ? <TextShimmer text={title} active={animateLiveTitle} /> : title}
          </span>
          {!showLivePreview && errorCount > 0 ? (
            <span className="flex shrink-0 items-center gap-1 rounded bg-surface-critical-base/10 px-1.5 py-px font-medium text-icon-critical-base">
              {errorCount} {errorCount === 1 ? "error" : "errors"}
            </span>
          ) : null}
          {!showLivePreview && summaryDetail && summaryDetail !== title ? (
            <span className="truncate text-text-weaker transition-colors group-hover:text-text-weak">
              {summaryDetail}
            </span>
          ) : null}
          <motion.div
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={MOTION_SNAPPY}
            className="flex items-center text-text-weaker transition-colors group-hover:text-text-weak"
          >
            <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
          </motion.div>
        </div>

        <div className="h-px grow bg-linear-to-r from-border to-transparent" />
      </button>
    </CollapsibleTrigger>
  )
}

function HiddenStepsPreviewPanel({
  showPreview,
  preview,
  previewText,
  previewPartID,
  previewViewportHeight,
}: HiddenStepsPreviewPanelProps) {
  const previewViewportRef = useRef<HTMLDivElement>(null)
  const previewContentRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!showPreview) {
      const viewport = previewViewportRef.current
      if (viewport) {
        viewport.scrollTop = 0
      }
      return
    }

    const viewport = previewViewportRef.current
    const content = previewContentRef.current
    if (!viewport || !content) {
      return
    }

    const pinPreviewToBottom = () => {
      viewport.scrollTop = Math.max(0, content.scrollHeight - viewport.clientHeight)
    }

    pinPreviewToBottom()

    const observer = new ResizeObserver(() => {
      pinPreviewToBottom()
    })

    observer.observe(viewport)
    observer.observe(content)
    return () => {
      observer.disconnect()
    }
  }, [previewText, showPreview])

  return (
    <AnimatePresence initial={false}>
      {showPreview ? (
        <motion.div
          key="preview"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={MOTION_GENTLE}
          className="overflow-hidden"
        >
          <div
            ref={previewViewportRef}
            data-preview-viewport=""
            className="mt-3 overflow-hidden"
            style={{
              ...(typeof previewViewportHeight === "number"
                ? { height: `${previewViewportHeight}px` }
                : {}),
              maxHeight: `${PREVIEW_MAX_HEIGHT_PX}px`,
            }}
          >
            <div ref={previewContentRef} className="flex min-h-full flex-col">
              {preview.kind === "markdown" ? (
                <Markdown
                  text={previewText}
                  cacheKey={previewPartID ? `${previewPartID}:hidden-preview` : "hidden-preview"}
                  className={HIDDEN_STEPS_MARKDOWN_CLASS_NAME}
                />
              ) : (
                <div
                  className={
                    preview.kind === "error"
                      ? HIDDEN_STEPS_ERROR_CLASS_NAME
                      : HIDDEN_STEPS_TEXT_CLASS_NAME
                  }
                >
                  {previewText}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function HiddenSteps({
  parts,
  onOpenSession,
  directory,
  copyPartID,
  metaText,
  interrupted,
  isBusy,
  collapsePreview,
  shellToolDefaultOpen,
}: HiddenStepsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const lastActiveEntryRef = useRef<HiddenStepsEntry | undefined>(undefined)
  const { entries, activeEntry, lastErrorEntry, errorCount, summaryDetail } = useMemo(() => {
    const entries = parts.map((part) => createHiddenStepsEntry(part))
    let activeEntry: HiddenStepsEntry | undefined
    let lastErrorEntry: HiddenStepsEntry | undefined
    let errorCount = 0

    for (const entry of entries) {
      if (hiddenStepsEntryIsActive(entry)) {
        activeEntry = entry
      }

      if (hiddenStepsEntryHasVisibleError(entry)) {
        lastErrorEntry = entry
        errorCount += 1
      }
    }

    return {
      entries,
      activeEntry,
      lastErrorEntry,
      errorCount,
      summaryDetail: buildHiddenStepsSummary(entries),
    }
  }, [parts])

  useEffect(() => {
    if (activeEntry) {
      lastActiveEntryRef.current = activeEntry
      return
    }

    if (!isBusy) {
      lastActiveEntryRef.current = undefined
    }
  }, [activeEntry, isBusy])

  useEffect(() => {
    if (errorCount > 0 && !isBusy) {
      setIsOpen(true)
    }
  }, [errorCount, isBusy])

  const lingeringLivePreview =
    !activeEntry && !lastErrorEntry && isBusy ? lastActiveEntryRef.current : undefined
  const previewEntry = activeEntry ?? lastErrorEntry ?? lingeringLivePreview
  const showLivePreview = Boolean(activeEntry || lingeringLivePreview) && !collapsePreview
  const showErrorPreview = Boolean(!activeEntry && lastErrorEntry) && !collapsePreview
  const preview = buildHiddenStepsPreview(previewEntry)
  const throttledPreviewText = useThrottledText(preview.detail ?? "")
  const previewText = preview.kind === "error" ? (preview.detail ?? "") : throttledPreviewText
  const hasPreviewText = previewText.trim().length > 0
  const showPreview = showLivePreview || (showErrorPreview && hasPreviewText)
  const title =
    showLivePreview || showErrorPreview ? preview.title : (summaryDetail ?? DEFAULT_STEPS_TITLE)
  const animateLiveTitle = showLivePreview && Boolean(isBusy)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <HiddenStepsToggle
        isOpen={isOpen}
        title={title}
        showLivePreview={showLivePreview}
        animateLiveTitle={animateLiveTitle}
        errorCount={errorCount}
        summaryDetail={summaryDetail}
      />

      <HiddenStepsPreviewPanel
        showPreview={showPreview}
        preview={preview}
        previewText={previewText}
        previewPartID={previewEntry?.part.id}
        previewViewportHeight={showLivePreview ? PREVIEW_MAX_HEIGHT_PX : undefined}
      />

      <CollapsibleContent>
        <div className="mt-3 px-2 flex flex-col gap-1.5">
          {entries.map((entry) =>
            hiddenStepsEntryUsesSummaryRow(entry) ? (
              <HiddenStepsSummaryRow key={entry.part.id} entry={entry} />
            ) : (
              <AssistantPartRenderer
                key={entry.part.id}
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
            ),
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
