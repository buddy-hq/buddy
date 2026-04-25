import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ChevronRightIcon,
  cn,
} from "@buddy/ui"

import { useThrottledText } from "../../hooks/use-throttled-text"
import { Markdown } from "@/components/markdown/Markdown"
import { parseToolState } from "../parse-tool-state"
import { TextShimmer } from "../text-shimmer"
import {
  getToolRenderer,
  HIDDEN_STEP_DETAIL_KIND,
  type HiddenStepDetail,
  type HiddenStepDetailKind,
  type HiddenStepPresentation,
  type ToolPartProps,
} from "../registry"
import { getToolInfo } from "../tool-info"
import type { ToolInfo, ToolState } from "../types"
import type { MessagePart } from "@/state/chat-types"
import { AssistantPartRenderer } from "../../parts/assistant-part/assistant-part"
import { isRecord } from "../types"
import { reasoningHeading } from "../../utils/markdown"
import { stripAnsi } from "../../utils/path"
import { language } from "@/context/language"

const PREVIEW_MAX_HEIGHT_PX = 80
const SUMMARY_MAX_LABEL_COUNT = 3
const ABSTRACTED_THINKING_LABEL = "Thinking"
const ABSTRACTED_THOUGHT_LABEL = "Thought"
const ABSTRACTED_WORKING_LABEL = "Working"
const READ_TOOL_NAMES = new Set(["read"])
const SEARCH_TOOL_NAMES = new Set(["list", "glob", "grep", "websearch", "codesearch"])
const SHELL_TOOL_NAME = "bash"
import { MOTION_SNAPPY, MOTION_GENTLE } from "../tool-motion"

const PREVIEW_KIND = {
  markdown: HIDDEN_STEP_DETAIL_KIND.markdown,
  text: HIDDEN_STEP_DETAIL_KIND.text,
  error: "error",
} as const

type AbstractedEntry = {
  part: MessagePart
  state?: ToolState
  info?: ToolInfo
  hiddenSteps?: HiddenStepPresentation
}

type PreviewKind = HiddenStepDetailKind | (typeof PREVIEW_KIND)["error"]

type HiddenStepsPreview = {
  title: string
  detail?: string
  kind: PreviewKind
}

type SummaryBucket = {
  key: string
  count: number
  latestLabel: string
  latestIndex: number
}

function entryUsesSummaryOnlyRendering(entry: AbstractedEntry): boolean {
  return entry.part.type === "tool" && entry.hiddenSteps?.summaryOnly === true
}

function entrySuppressesErrorPreview(entry: AbstractedEntry): boolean {
  return entry.part.type === "tool" && entry.hiddenSteps?.suppressErrorPreview === true
}

function isReasoningActive(part: MessagePart): boolean {
  if (part.type !== "reasoning") return false
  const time = isRecord(part.time) ? part.time : undefined
  return typeof time?.end !== "number"
}

function isToolActive(state: ToolState | undefined): boolean {
  return state?.status === "pending" || state?.status === "running"
}

function createEntry(part: MessagePart): AbstractedEntry {
  if (part.type !== "tool") {
    return { part }
  }

  const state = parseToolState(part)
  const info = getToolInfo(String(part.tool ?? ""), state)
  const tool = String(part.tool ?? "")
  const renderer = getToolRenderer(tool)
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
    hiddenSteps: renderer?.hiddenSteps?.(props),
  }
}

function entryIsActive(entry: AbstractedEntry): boolean {
  if (entry.part.type === "reasoning") return isReasoningActive(entry.part)
  if (entry.part.type === "tool") return isToolActive(entry.state)
  return false
}

function entryHasError(entry: AbstractedEntry): boolean {
  return entry.part.type === "tool" && entry.state?.status === "error"
}

function entryErrorText(entry: AbstractedEntry): string | undefined {
  if (!entryHasError(entry) || entrySuppressesErrorPreview(entry)) return undefined

  const errorText = stripAnsi(String(entry.state?.error ?? "")).trim()
  if (errorText) return errorText

  const outputText = stripAnsi(String(entry.state?.output ?? "")).trim()
  if (outputText) return outputText

  if (entry.part.type === "tool" && String(entry.part.tool ?? "") === SHELL_TOOL_NAME) {
    return `${language.t("chatTools.shell")} failed.`
  }

  return entry.info?.title ? `${entry.info.title} failed.` : "Step failed."
}

function entryHasVisibleError(entry: AbstractedEntry): boolean {
  return entryHasError(entry) && !entrySuppressesErrorPreview(entry)
}

function entrySummaryBucket(entry: AbstractedEntry): { key: string; label: string } | undefined {
  const label = entrySummaryLabel(entry)
  if (!label) {
    return undefined
  }

  if (entry.part.type === "reasoning") {
    return undefined
  }

  const tool = String(entry.part.tool ?? "")
  if (READ_TOOL_NAMES.has(tool)) {
    return { key: "read", label }
  }

  if (SEARCH_TOOL_NAMES.has(tool)) {
    return { key: "search", label }
  }

  return { key: `label:${label}`, label }
}

function formatSummaryBucket(bucket: SummaryBucket): string {
  if (bucket.key === "reasoning") {
    return ABSTRACTED_THINKING_LABEL
  }

  if (bucket.key === "read") {
    return bucket.count === 1 ? bucket.latestLabel : `Read ${bucket.count} files`
  }

  if (bucket.key === "search") {
    return bucket.count === 1 ? bucket.latestLabel : `Searched ${bucket.count} times`
  }

  return bucket.count === 1 ? bucket.latestLabel : `${bucket.latestLabel} ×${bucket.count}`
}

function buildSummary(entries: AbstractedEntry[]): string | undefined {
  const buckets = new Map<string, SummaryBucket>()
  let hasReasoning = false

  for (const [index, entry] of entries.entries()) {
    if (entry.part.type === "reasoning") {
      hasReasoning = true
    }

    const bucket = entrySummaryBucket(entry)
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
    })
  }

  const orderedBuckets = [...buckets.values()].toSorted(
    (left, right) => right.latestIndex - left.latestIndex,
  )
  const detail = orderedBuckets
    .slice(0, SUMMARY_MAX_LABEL_COUNT)
    .map((bucket) => formatSummaryBucket(bucket))
    .join(" · ")

  if (detail) {
    return detail
  }

  return hasReasoning ? ABSTRACTED_THOUGHT_LABEL : undefined
}

function normalizePreviewText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = stripAnsi(value).replace(/\r\n?/g, "\n").trim()
  return normalized || undefined
}

function entrySummaryLabel(entry: AbstractedEntry): string | undefined {
  if (entry.part.type === "reasoning") {
    const text = String(entry.part.text ?? "").trim()
    return reasoningHeading(text) ?? ABSTRACTED_THINKING_LABEL
  }

  return entry.hiddenSteps?.summaryLabel ?? entry.info?.title
}

function buildPreview(entry: AbstractedEntry | undefined): HiddenStepsPreview {
  if (!entry) {
    return { title: ABSTRACTED_WORKING_LABEL, kind: PREVIEW_KIND.text }
  }

  if (entry.part.type === "reasoning") {
    const text = String(entry.part.text ?? "").trim()
    return {
      title: reasoningHeading(text) ?? ABSTRACTED_THINKING_LABEL,
      detail: text || undefined,
      kind: PREVIEW_KIND.markdown,
    }
  }

  if (entry.part.type === "tool" && entry.info) {
    const errorText = entryErrorText(entry)
    const previewText = normalizePreviewText(
      entry.hiddenSteps?.preview?.text ?? entry.state?.output,
    )
    return {
      title: entry.info.title,
      detail: errorText ?? previewText ?? entry.info.summary ?? entry.info.subtitle,
      kind: errorText
        ? PREVIEW_KIND.error
        : (entry.hiddenSteps?.preview?.kind ?? PREVIEW_KIND.text),
    }
  }

  return { title: ABSTRACTED_WORKING_LABEL, kind: PREVIEW_KIND.text }
}

function detailKindClassName(kind: HiddenStepDetailKind): string {
  return kind === HIDDEN_STEP_DETAIL_KIND.markdown
    ? "text-xs text-text-weaker"
    : "whitespace-pre-wrap break-words font-mono text-xs text-text-weaker"
}

function detailCacheKey(partID: string, detail: HiddenStepDetail): string {
  return `${partID}:hidden-detail:${detail.kind ?? HIDDEN_STEP_DETAIL_KIND.text}:${detail.text}`
}

function buildSummaryOnlyDetails(entry: AbstractedEntry): HiddenStepDetail[] {
  if (!entry.info || entry.part.type !== "tool") {
    return []
  }

  if (entry.hiddenSteps?.rowDetails) {
    return entry.hiddenSteps.rowDetails
  }

  return [entry.info.subtitle, entry.info.summary]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((text) => ({ text, kind: HIDDEN_STEP_DETAIL_KIND.text }))
}

function SummaryOnlyToolRow({ entry }: { entry: AbstractedEntry }) {
  if (!entry.info) {
    return null
  }

  const details = buildSummaryOnlyDetails(entry)

  return (
    <div className="rounded-md border border-border-base bg-background-base px-3 py-2">
      <div className="text-xs font-medium text-text-weak">{entry.info.title}</div>
      {details.map((detail) =>
        detail.kind === HIDDEN_STEP_DETAIL_KIND.markdown ? (
          <Markdown
            key={detailCacheKey(entry.part.id, detail)}
            text={detail.text}
            cacheKey={detailCacheKey(entry.part.id, detail)}
            className={`mt-1 ${detailKindClassName(detail.kind)}`}
          />
        ) : (
          <div
            key={detailCacheKey(entry.part.id, detail)}
            className={`mt-1 ${detailKindClassName(detail.kind ?? HIDDEN_STEP_DETAIL_KIND.text)}`}
          >
            {detail.text}
          </div>
        ),
      )}
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
  collapsePreview?: boolean
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
  collapsePreview,
  shellToolDefaultOpen,
}: HiddenStepsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const entries = useMemo(() => parts.map((part) => createEntry(part)), [parts])
  const activeEntry = useMemo(() => entries.findLast((entry) => entryIsActive(entry)), [entries])
  const lastErrorEntry = useMemo(
    () => entries.findLast((entry) => entryHasVisibleError(entry)),
    [entries],
  )
  const errorCount = useMemo(
    () => entries.filter((entry) => entryHasVisibleError(entry)).length,
    [entries],
  )
  const lastActiveEntryRef = useRef<AbstractedEntry | undefined>(undefined)
  const previewViewportRef = useRef<HTMLDivElement>(null)
  const previewContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeEntry) {
      lastActiveEntryRef.current = activeEntry
      return
    }

    if (!isBusy) {
      lastActiveEntryRef.current = undefined
    }
  }, [activeEntry, isBusy])

  // Auto-expand if there are errors and the agent has finished working
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
  const previewViewportHeight = showLivePreview ? PREVIEW_MAX_HEIGHT_PX : undefined
  const summaryDetail = useMemo(() => buildSummary(entries), [entries])
  const preview = useMemo(() => buildPreview(previewEntry), [previewEntry])
  const throttledPreviewText = useThrottledText(preview.detail ?? "")
  const previewText =
    preview.kind === PREVIEW_KIND.error ? (preview.detail ?? "") : throttledPreviewText
  const hasPreviewText = previewText.trim().length > 0
  const showPreview = showLivePreview || (showErrorPreview && hasPreviewText)
  const title = showLivePreview || showErrorPreview ? preview.title : (summaryDetail ?? "Steps")
  const animateLiveTitle = showLivePreview && Boolean(isBusy)

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
    if (!viewport || !content) return

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
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-3 w-full">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group mt-2 mb-1 flex w-full cursor-default items-center gap-3 transition-transform duration-200 ease-out active:scale-[0.98]"
        >
          <div className="flex shrink-0 items-center gap-2 text-xs transition-colors duration-200 text-text-weaker group-hover:text-text-weak">
            <span
              className={cn(
                "relative truncate",
                showLivePreview
                  ? "text-text-base group-hover:text-text-strong transition-colors"
                  : errorCount > 0
                    ? "text-icon-critical-base"
                    : "text-inherit",
              )}
            >
              {showLivePreview ? <TextShimmer text={title} active={animateLiveTitle} /> : title}
            </span>
            {!showLivePreview && errorCount > 0 ? (
              <span className="shrink-0 flex items-center gap-1 rounded bg-surface-critical-base/10 px-1.5 py-px text-icon-critical-base font-medium">
                {errorCount} {errorCount === 1 ? "error" : "errors"}
              </span>
            ) : null}
            {!showLivePreview && summaryDetail && summaryDetail !== title ? (
              <span className="truncate text-text-weaker group-hover:text-text-weak transition-colors">
                {summaryDetail}
              </span>
            ) : null}
            <motion.div
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={MOTION_SNAPPY}
              className="flex items-center text-text-weaker group-hover:text-text-weak transition-colors"
            >
              <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
            </motion.div>
          </div>

          <div className="h-px grow bg-linear-to-r from-border to-transparent" />
        </button>
      </CollapsibleTrigger>

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
              className="mt-1.5 overflow-hidden"
              style={{
                ...(typeof previewViewportHeight === "number"
                  ? { height: `${previewViewportHeight}px` }
                  : {}),
                maxHeight: `${PREVIEW_MAX_HEIGHT_PX}px`,
              }}
            >
              <div ref={previewContentRef} className="flex min-h-full flex-col">
                {preview.kind === PREVIEW_KIND.markdown ? (
                  <Markdown
                    text={previewText}
                    cacheKey={
                      previewEntry ? `${previewEntry.part.id}:hidden-preview` : "hidden-preview"
                    }
                    className="text-[11px] leading-[1.6] text-text-weaker [&_blockquote]:border-border-base/70 [&_blockquote]:text-text-weaker [&_code]:text-[0.92em] [&_h1]:text-[11px] [&_h2]:text-[11px] [&_h3]:text-[11px] [&_h4]:text-[11px] [&_h5]:text-[11px] [&_h6]:text-[11px] [&_li]:mb-1 [&_ol]:mb-2 [&_p]:mb-2 [&_pre]:my-2 [&_table]:my-2 [&_ul]:mb-2"
                  />
                ) : (
                  <div
                    className={
                      preview.kind === PREVIEW_KIND.error
                        ? "whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-icon-critical-base"
                        : "whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-text-weaker"
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

      <CollapsibleContent>
        <div className="mt-2 flex flex-col gap-3">
          {entries.map((entry) =>
            entryUsesSummaryOnlyRendering(entry) ? (
              <SummaryOnlyToolRow key={entry.part.id} entry={entry} />
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
