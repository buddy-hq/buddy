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
import { FastForward, Panda, View } from "lucide-react"

import type { MessagePart } from "@/state/chat-types"

import type { ToolAttachment, ToolIconRenderer } from "../tool-registry-types"
import { AssistantPartRenderer } from "../../parts/assistant-part/assistant-part"
import { resolveAssetUrl } from "../../../../lib/resource-url"
import { useThrottledText } from "../../hooks/use-throttled-text"
import { getReadPreviewImageAttachments, isReadImagePreview } from "../read-image-preview"
import {
  buildHiddenStepsSummary,
  buildHiddenStepsPreview,
  createHiddenStepsEntry,
  hiddenStepsEntryHasVisibleError,
  hiddenStepsEntryIsActive,
  hiddenStepsEntryUsesSummaryRow,
  ABSTRACTED_THINKING_LABEL,
  type HiddenStepsEntry,
  type HiddenStepsPreview,
} from "./entries"
import { HiddenStepsSummaryRow } from "./summary-row"
import {
  HIDDEN_STEPS_ERROR_CLASS_NAME,
  HIDDEN_STEPS_MARKDOWN_CLASS_NAME,
  HIDDEN_STEPS_TEXT_CLASS_NAME,
} from "./styles"

import { MOTION_GENTLE, MOTION_SNAPPY } from "../tool-motion"
import { TextShimmer } from "../text-shimmer"

const DEFAULT_STEPS_TITLE = "Steps"

type HiddenStepsImageRowProps = {
  attachments: ToolAttachment[]
  small?: boolean
}

function HiddenStepsImageRow({ attachments, small }: HiddenStepsImageRowProps) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {attachments.map((attachment) => {
        const url =
          attachment.url.startsWith("data:") || attachment.url.startsWith("blob:")
            ? attachment.url
            : resolveAssetUrl(attachment.url)
        const label = attachment.filename ?? "image"

        return (
          <img
            key={attachment.id}
            src={url}
            alt={label}
            className={
              small
                ? "max-h-16 w-auto shrink-0 rounded-md border border-border-base object-contain bg-surface-weaker"
                : "max-h-28 w-auto shrink-0 rounded-md border border-border-base object-contain bg-surface-weaker"
            }
          />
        )
      })}
    </div>
  )
}
const PREVIEW_MAX_HEIGHT_PX = 80
const SHELL_TOOL_NAME = "bash"
const READ_TOOL_NAME = "read"

function isReadToolEntryWithState(
  entry: HiddenStepsEntry | undefined,
): entry is HiddenStepsEntry & { state: NonNullable<HiddenStepsEntry["state"]> } {
  return (
    entry?.part.type === "tool" &&
    String(entry.part.tool ?? "") === READ_TOOL_NAME &&
    entry.state !== undefined
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
  collapsePreview?: boolean
  shellToolDefaultOpen?: boolean
}

type HiddenStepsToggleProps = {
  isOpen: boolean
  title: string
  showLivePreview: boolean
  animateLiveTitle: boolean
  summaryDetail?: string
  icon?: ToolIconRenderer
}

type HiddenStepsPreviewPanelProps = {
  showPreview: boolean
  preview: HiddenStepsPreview
  previewText: string
  previewPartID?: string
  previewViewportHeight?: number
  directory?: string
  imageAttachments?: ToolAttachment[]
}

function HiddenStepsToggle({
  isOpen,
  title,
  showLivePreview,
  animateLiveTitle,
  summaryDetail,
  icon,
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
                : "text-inherit",
            )}
          >
            {showLivePreview ? (
              <span className="inline-flex items-center gap-1.5">
                {icon ? (
                  <span className="shrink-0">{icon("size-3.5 shrink-0 text-text-weaker")}</span>
                ) : null}
                <TextShimmer text={title} active={animateLiveTitle} />
              </span>
            ) : (
              title
            )}
          </span>
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
  directory,
  imageAttachments,
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
            className="mt-3 overflow-hidden px-2"
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
                  directory={directory}
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
              {imageAttachments && imageAttachments.length > 0 ? (
                <HiddenStepsImageRow attachments={imageAttachments} small />
              ) : null}
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
  const {
    entries,
    activeEntry,
    lastErrorEntry,
    errorCount,
    summaryDetail,
    completedReadImageAttachments,
  } = useMemo(() => {
    const entries = parts.map((part) => createHiddenStepsEntry(part))
    let activeEntry: HiddenStepsEntry | undefined
    let lastErrorEntry: HiddenStepsEntry | undefined
    let errorCount = 0
    const completedReadImageAttachments: ToolAttachment[] = []

    for (const entry of entries) {
      if (hiddenStepsEntryIsActive(entry)) {
        activeEntry = entry
      }

      if (hiddenStepsEntryHasVisibleError(entry)) {
        lastErrorEntry = entry
        errorCount += 1
      }

      if (
        entry.part.type === "tool" &&
        String(entry.part.tool ?? "") === READ_TOOL_NAME &&
        entry.state?.status === "completed"
      ) {
        completedReadImageAttachments.push(
          ...getReadPreviewImageAttachments({
            state: entry.state,
            filePath: entry.info?.subtitle,
          }),
        )
      }
    }

    return {
      entries,
      activeEntry,
      lastErrorEntry,
      errorCount,
      summaryDetail: buildHiddenStepsSummary(entries),
      completedReadImageAttachments,
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

  const previewImageAttachments = isReadToolEntryWithState(previewEntry)
    ? getReadPreviewImageAttachments({
        state: previewEntry.state,
        filePath: previewEntry.info?.subtitle,
      })
    : []

  const isImageRead = isReadToolEntryWithState(previewEntry)
    ? isReadImagePreview({ state: previewEntry.state, filePath: previewEntry.info?.subtitle })
    : false

  const toggleIcon: ToolIconRenderer | undefined = showLivePreview
    ? previewEntry?.part.type === "reasoning"
      ? title === ABSTRACTED_THINKING_LABEL
        ? (cn) => <Panda className={cn} />
        : (cn) => <FastForward className={cn} />
      : isImageRead
        ? (cn) => <View className={cn} />
        : previewEntry?.icon
    : undefined

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <HiddenStepsToggle
        isOpen={isOpen}
        title={title}
        showLivePreview={showLivePreview}
        animateLiveTitle={animateLiveTitle}
        summaryDetail={summaryDetail}
        icon={toggleIcon}
      />

      <HiddenStepsPreviewPanel
        showPreview={showPreview}
        preview={preview}
        previewText={previewText}
        previewPartID={previewEntry?.part.id}
        previewViewportHeight={showLivePreview ? PREVIEW_MAX_HEIGHT_PX : undefined}
        directory={directory}
        imageAttachments={showLivePreview ? previewImageAttachments : undefined}
      />

      {!isOpen && completedReadImageAttachments.length > 0 && !showLivePreview ? (
        <div className="mt-2.5 px-2">
          <HiddenStepsImageRow attachments={completedReadImageAttachments} />
        </div>
      ) : null}

      <CollapsibleContent>
        <div className="mt-3 px-2 flex flex-col gap-2.5">
          {entries.map((entry) =>
            hiddenStepsEntryUsesSummaryRow(entry) ? (
              <HiddenStepsSummaryRow key={entry.part.id} entry={entry} directory={directory} />
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
