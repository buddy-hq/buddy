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
import { parseToolState } from "../parse-tool-state"
import { getToolInfo } from "../tool-info"
import type { ToolInfo, ToolState } from "../types"
import type { MessagePart } from "@/state/chat-types"
import { AssistantPartRenderer } from "../../parts/assistant-part/assistant-part"
import { isRecord } from "../types"
import { reasoningHeading } from "../../utils/markdown"
import { stripAnsi } from "../../utils/path"

const PREVIEW_MAX_HEIGHT_PX = 80
const ABSTRACTED_THINKING_LABEL = "Thinking"
const ABSTRACTED_WORKING_LABEL = "Working"
const ABSTRACTED_STEP_LABELS = {
  singular: "step",
  plural: "steps",
} as const
const SUMMARY_ONLY_PREVIEW_TOOLS = new Set([
  "read",
  "learner_snapshot_read",
  "pedagogy_resource_ingest_full_text",
  "skill",
])

const SPRING_SNAPPY = { type: "spring", stiffness: 500, damping: 35, mass: 0.8 } as const
const SPRING_GENTLE = { type: "spring", stiffness: 300, damping: 30, mass: 1 } as const

type AbstractedEntry = {
  part: MessagePart
  state?: ToolState
  info?: ToolInfo
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
  return {
    part,
    state,
    info: getToolInfo(String(part.tool ?? ""), state),
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
  if (!entryHasError(entry)) return undefined

  const errorText = stripAnsi(String(entry.state?.error ?? "")).trim()
  if (errorText) return errorText

  const outputText = stripAnsi(String(entry.state?.output ?? "")).trim()
  if (outputText) return outputText

  return entry.info?.title ? `${entry.info.title} failed.` : "Step failed."
}

function buildSummary(entries: AbstractedEntry[]): string | undefined {
  const labels = new Set<string>()

  for (const entry of entries) {
    const label = entry.part.type === "reasoning" ? ABSTRACTED_THINKING_LABEL : entry.info?.title
    if (!label) continue
    labels.add(label)
  }

  const values = Array.from(labels).slice(0, 3)

  return values.length > 0 ? values.join(" · ") : undefined
}

function buildPreview(entry: AbstractedEntry | undefined): { title: string; detail?: string } {
  if (!entry) {
    return { title: ABSTRACTED_WORKING_LABEL }
  }

  if (entry.part.type === "reasoning") {
    const text = String(entry.part.text ?? "").trim()
    return {
      title: reasoningHeading(text) ?? ABSTRACTED_THINKING_LABEL,
      detail: text || undefined,
    }
  }

  if (entry.part.type === "tool" && entry.info) {
    const toolName = String(entry.part.tool ?? "")
    const errorText = entryErrorText(entry)
    const output = stripAnsi(entry.state?.output?.trim() ?? "")
    return {
      title: entry.info.title,
      detail: errorText
        ? errorText
        : SUMMARY_ONLY_PREVIEW_TOOLS.has(toolName)
          ? entry.info.summary || entry.info.subtitle
          : output || entry.info.summary || entry.info.subtitle,
    }
  }

  return { title: ABSTRACTED_WORKING_LABEL }
}

interface HiddenStepsProps {
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
  const lastErrorEntry = useMemo(() => entries.findLast((entry) => entryHasError(entry)), [entries])
  const errorCount = useMemo(
    () => entries.filter((entry) => entryHasError(entry)).length,
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

  const lingeringLivePreview =
    !activeEntry && !lastErrorEntry && isBusy ? lastActiveEntryRef.current : undefined
  const previewEntry = activeEntry ?? lastErrorEntry ?? lingeringLivePreview
  const showLivePreview = Boolean(activeEntry || lingeringLivePreview) && !collapsePreview
  const showErrorPreview = Boolean(!activeEntry && lastErrorEntry) && !collapsePreview
  const previewViewportHeight = showLivePreview ? PREVIEW_MAX_HEIGHT_PX : undefined
  const stepCount = entries.length
  const summaryTitle = `${stepCount} ${
    stepCount === 1 ? ABSTRACTED_STEP_LABELS.singular : ABSTRACTED_STEP_LABELS.plural
  }`
  const summaryDetail = useMemo(() => buildSummary(entries), [entries])
  const preview = useMemo(() => buildPreview(previewEntry), [previewEntry])
  const previewText = useThrottledText(preview.detail ?? "")
  const showPreview = (showLivePreview || showErrorPreview) && previewText.trim().length > 0
  const title = showLivePreview || showErrorPreview ? preview.title : summaryTitle

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
          <div className="flex shrink-0 items-center gap-2 text-xs transition-colors duration-200 text-text-weak/40 group-hover:text-text-weak/70">
            <span
              className={cn(
                "truncate",
                showLivePreview
                  ? "text-text-weak"
                  : errorCount > 0
                    ? "text-icon-critical-base/80"
                    : "text-inherit",
              )}
            >
              {title}
            </span>
            {!showLivePreview && errorCount > 0 ? (
              <span className="shrink-0 text-icon-critical-base/70">
                {errorCount} {errorCount === 1 ? "error" : "errors"}
              </span>
            ) : null}
            {!showLivePreview && summaryDetail ? (
              <span className="truncate text-text-weak/30">{summaryDetail}</span>
            ) : null}
            <motion.div
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={SPRING_SNAPPY}
              className="flex items-center"
            >
              <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
            </motion.div>
          </div>

          <div className="h-px grow bg-linear-to-r from-border/40 to-transparent" />
        </button>
      </CollapsibleTrigger>

      <AnimatePresence initial={false}>
        {showPreview ? (
          <motion.div
            key="preview"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_GENTLE}
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
                <p
                  className={
                    showErrorPreview
                      ? "whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-icon-critical-base/80"
                      : "whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-text-weak/40"
                  }
                >
                  {previewText}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <CollapsibleContent>
        <div className="mt-2 flex flex-col gap-3">
          {parts.map((part) => (
            <AssistantPartRenderer
              key={part.id}
              part={part}
              onOpenSession={onOpenSession}
              directory={directory}
              copyPartID={copyPartID}
              metaText={metaText}
              interrupted={interrupted}
              defaultOpen={
                part.type === "tool" && String(part.tool ?? "") === "bash"
                  ? shellToolDefaultOpen
                  : undefined
              }
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
