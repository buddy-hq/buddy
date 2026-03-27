import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ChevronRightIcon,
  cn,
} from "@buddy/ui"

import { useThrottledText } from "../shared/hooks"
import { parseToolState } from "../tools/parse-tool-state"
import { getToolInfo } from "../tools/tool-info"
import type { ToolInfo, ToolState } from "../tools/types"
import type { MessagePart } from "@/state/chat-types"
import { AssistantPartRenderer } from "./assistant-part-renderer"
import { isRecord, reasoningHeading, stripAnsi } from "../shared/utils"

const PREVIEW_MAX_HEIGHT_PX = 80
const SUMMARY_ONLY_PREVIEW_TOOLS = new Set(["read", "pedagogy_resource_ingest_full_text", "skill"])

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

function buildSummary(entries: AbstractedEntry[]): string | undefined {
  const labels = new Set<string>()

  for (const entry of entries) {
    const label = entry.part.type === "reasoning" ? "Thinking" : entry.info?.title
    if (!label) continue
    labels.add(label)
  }

  const values = Array.from(labels).slice(0, 3)

  return values.length > 0 ? values.join(" · ") : undefined
}

function buildPreview(entry: AbstractedEntry | undefined): { title: string; detail?: string } {
  if (!entry) {
    return { title: "Working" }
  }

  if (entry.part.type === "reasoning") {
    const text = String(entry.part.text ?? "").trim()
    return {
      title: reasoningHeading(text) ?? "Thinking",
      detail: text || undefined,
    }
  }

  if (entry.part.type === "tool" && entry.info) {
    const toolName = String(entry.part.tool ?? "")
    const output = stripAnsi(entry.state?.output?.trim() ?? "")
    return {
      title: entry.info.title,
      detail: SUMMARY_ONLY_PREVIEW_TOOLS.has(toolName)
        ? entry.info.summary || entry.info.subtitle
        : output || entry.info.summary || entry.info.subtitle,
    }
  }

  return { title: "Working" }
}

interface AbstractedToolGroupProps {
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

export function AbstractedToolGroup({
  parts,
  onOpenSession,
  directory,
  copyPartID,
  metaText,
  interrupted,
  isBusy,
  collapsePreview,
  shellToolDefaultOpen,
}: AbstractedToolGroupProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [previewOffset, setPreviewOffset] = useState(0)
  const entries = useMemo(() => parts.map((part) => createEntry(part)), [parts])
  const activeEntry = useMemo(() => entries.findLast((entry) => entryIsActive(entry)), [entries])
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

  const previewEntry = activeEntry ?? (isBusy ? lastActiveEntryRef.current : undefined)
  const isWorking = Boolean(activeEntry || (isBusy && previewEntry))
  const showLivePreview = isWorking && !collapsePreview
  const stepCount = entries.length
  const summaryTitle = `${stepCount} ${stepCount === 1 ? "step" : "steps"}`
  const summaryDetail = useMemo(() => buildSummary(entries), [entries])
  const preview = useMemo(() => buildPreview(previewEntry), [previewEntry])
  const previewText = useThrottledText(preview.detail ?? "")
  const showPreview = showLivePreview && previewText.trim().length > 0
  const title = showLivePreview ? preview.title : summaryTitle

  useLayoutEffect(() => {
    if (!showPreview) {
      setPreviewOffset(0)
      return
    }

    const viewport = previewViewportRef.current
    const content = previewContentRef.current
    if (!viewport || !content) return

    const update = () => {
      const nextOffset = Math.min(0, viewport.clientHeight - content.scrollHeight)
      setPreviewOffset(nextOffset)
    }

    update()

    const observer = new ResizeObserver(() => {
      update()
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
        <button type="button" className="group flex w-full flex-col items-stretch py-1 text-left">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "min-w-0 truncate text-xs",
                showLivePreview ? "text-text-weak" : "text-text-weak/50",
              )}
            >
              {title}
            </span>
            {!showLivePreview && summaryDetail ? (
              <span className="min-w-0 truncate text-xs text-text-weak/30">{summaryDetail}</span>
            ) : null}
            <motion.div
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={SPRING_SNAPPY}
              className="ml-auto"
            >
              <ChevronRightIcon className="h-3 w-3 shrink-0 text-text-weak/30 group-hover:text-text-weak/60" />
            </motion.div>
          </div>

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
                  className="mt-1.5 overflow-hidden"
                  style={{ maxHeight: `${PREVIEW_MAX_HEIGHT_PX}px` }}
                >
                  <motion.div
                    ref={previewContentRef}
                    animate={{ y: previewOffset }}
                    transition={SPRING_GENTLE}
                  >
                    <p className="whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-text-weak/40">
                      {previewText}
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 flex flex-col gap-3 pl-3">
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
