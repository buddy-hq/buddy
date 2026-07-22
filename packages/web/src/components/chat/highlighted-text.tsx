import { useMemo } from "react"
import { cn } from "@buddy/ui"
import { isRecord } from "./tools/types"
import { FileTypeIcon } from "../files/file-type-icon"
import { RubiksCube } from "@/icons/app-icons"
import type { ChatAgentPart, ChatFilePart } from "./utils/part-guards"

type HighlightSegment = { text: string; type?: "file" | "agent" | "command" }

type HighlightReference = {
  start: number
  end: number
  type: "file" | "agent" | "command"
}

// A slash command / skill sits only at the very start of a message (the
// backend contract), so a leading `/name` token followed by a space or the end
// of the message is rendered as a pill — matching the composer's skill pill —
// rather than raw "/docx" text. Path-like "/usr/local" never matches: the token
// must be a bare command name terminated by whitespace or end.
const LEADING_COMMAND_PATTERN = /^\/([A-Za-z][A-Za-z0-9_-]*)(?=\s|$)/

function readLeadingCommandReference(text: string): HighlightReference | undefined {
  const match = LEADING_COMMAND_PATTERN.exec(text)
  if (!match) return undefined
  return { start: 0, end: match[0].length, type: "command" }
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

const INLINE_REFERENCE_CLASS =
  "mx-1 inline-flex max-w-full items-baseline gap-1 align-baseline font-medium text-text-interactive-base"
const INLINE_REFERENCE_ICON_CLASS = "relative top-px size-3 shrink-0"

function InlineFileReference({ text }: { text: string }) {
  return (
    <span className={INLINE_REFERENCE_CLASS}>
      <FileTypeIcon fileName={stripMentionPrefix(text)} className={INLINE_REFERENCE_ICON_CLASS} />
      <span className="truncate">{stripMentionPrefix(text)}</span>
    </span>
  )
}

function stripCommandPrefix(value: string) {
  return value.startsWith("/") ? value.slice(1) : value
}

function InlineCommandReference({ text }: { text: string }) {
  return (
    <span className={INLINE_REFERENCE_CLASS}>
      <RubiksCube className={INLINE_REFERENCE_ICON_CLASS} />
      <span className="truncate">{stripCommandPrefix(text)}</span>
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
      readLeadingCommandReference(text),
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
        ) : segment.type === "command" ? (
          <InlineCommandReference key={key} text={segment.text} />
        ) : (
          <span key={key} className={cn(segment.type === "agent" && "text-text-base font-medium")}>
            {segment.text}
          </span>
        ),
      )}
    </>
  )
}
