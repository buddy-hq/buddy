import { useMemo } from "react"
import { cn } from "@buddy/ui"
import { isRecord } from "./tools/types"
import { FileTypeIcon } from "../files/file-type-icon"
import type { ChatAgentPart, ChatFilePart } from "./utils/part-guards"

type HighlightSegment = { text: string; type?: "file" | "agent" }

type HighlightReference = {
  start: number
  end: number
  type: "file" | "agent"
}

function readSourceRange(value: unknown): { start: number; end: number } | undefined {
  if (!isRecord(value)) return undefined

  const start = value.start
  const end = value.end
  if (typeof start !== "number" || typeof end !== "number") return undefined
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start)
    return undefined

  return { start, end }
}

function readFileHighlightReference(part: ChatFilePart): HighlightReference | undefined {
  const source = isRecord(part.source) ? part.source : undefined
  const textSource = source ? readSourceRange(source.text) : undefined
  if (!textSource) return undefined

  return {
    ...textSource,
    type: "file",
  }
}

function readAgentHighlightReference(part: ChatAgentPart): HighlightReference | undefined {
  const source = readSourceRange(part.source)
  if (!source) return undefined

  return {
    ...source,
    type: "agent",
  }
}

interface HighlightedTextProps {
  text: string
  references: ChatFilePart[]
  agents: ChatAgentPart[]
  inlineReferences?: string[]
}

function stripMentionPrefix(value: string) {
  return value.startsWith("@") ? value.slice(1) : value
}

function InlineFileReference({ text }: { text: string }) {
  return (
    <span className="mx-1 inline-flex max-w-full items-baseline gap-1 align-baseline font-medium text-text-interactive-base">
      <FileTypeIcon
        fileName={stripMentionPrefix(text)}
        className="relative top-px size-3 shrink-0"
      />
      <span className="truncate">{stripMentionPrefix(text)}</span>
    </span>
  )
}

export function HighlightedText({
  text,
  references,
  agents,
  inlineReferences = [],
}: HighlightedTextProps) {
  const segments = useMemo(() => {
    const allRefs = [
      ...references.map(readFileHighlightReference),
      ...agents.map(readAgentHighlightReference),
    ]
      .filter((ref): ref is HighlightReference => ref !== undefined)
      .toSorted((a, b) => a.start - b.start)

    const result: HighlightSegment[] = []
    let lastIndex = 0

    for (const ref of allRefs) {
      if (ref.start < lastIndex || ref.end > text.length) continue

      if (ref.start > lastIndex) {
        result.push({ text: text.slice(lastIndex, ref.start) })
      }

      result.push({ text: text.slice(ref.start, ref.end), type: ref.type })
      lastIndex = ref.end
    }

    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex) })
    }

    if (inlineReferences.length === 0) return result

    const inlineReferenceSet = new Set(inlineReferences)
    return result.flatMap((segment): HighlightSegment[] => {
      if (segment.type !== undefined) return [segment]
      const nestedSegments: HighlightSegment[] = []
      let cursor = 0
      const pattern = /@\S+/g
      for (const match of segment.text.matchAll(pattern)) {
        const token = match[0] ?? ""
        const index = match.index ?? 0
        if (!inlineReferenceSet.has(token)) continue
        if (index > cursor) {
          nestedSegments.push({ text: segment.text.slice(cursor, index) })
        }
        nestedSegments.push({ text: token, type: "file" })
        cursor = index + token.length
      }
      if (cursor < segment.text.length) {
        nestedSegments.push({ text: segment.text.slice(cursor) })
      }
      return nestedSegments.length > 0 ? nestedSegments : [segment]
    })
  }, [agents, inlineReferences, references, text])

  const keyedSegments = useMemo(() => {
    let cursor = 0
    return segments.map((segment) => {
      const start = cursor
      cursor += segment.text.length
      return {
        key: `${segment.type ?? "plain"}:${start}:${cursor}:${segment.text}`,
        segment,
      }
    })
  }, [segments])

  return (
    <>
      {keyedSegments.map(({ key, segment }) =>
        segment.type === "file" ? (
          <InlineFileReference key={key} text={segment.text} />
        ) : (
          <span key={key} className={cn(segment.type === "agent" && "text-text-base font-medium")}>
            {segment.text}
          </span>
        ),
      )}
    </>
  )
}
