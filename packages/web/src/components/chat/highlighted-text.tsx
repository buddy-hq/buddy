import { useMemo } from "react"
import { parseTJsonObject, parseTNumber } from "./tools/types"
import { FileTypeIcon } from "../files/file-type-icon"
import { SkillIconMark } from "../skills/skill-icon-mark"
import { useSkillPresentationLookup } from "../skills/skill-presentation"
import { useDirectoryWorkspaceOptional } from "../directory-chat/directory-workspace-context"
import { RubiksCube } from "@/icons/app-icons"
import type { ChatAgentPart, ChatFilePart } from "./utils/part-guards"

type HighlightSegment = { text: string; type?: "file" | "agent" | "skill" }

type HighlightReference = {
  start: number
  end: number
  type: "file" | "agent" | "skill"
}

// A submitted skill command sits only at the start of a message. This extracts
// the candidate token; `InlineSkillReference` still requires a catalog match
// before rendering a pill, so arbitrary `/text` remains ordinary prose.
const LEADING_SKILL_PATTERN = /^\/([A-Za-z][A-Za-z0-9_-]*)(?=[^A-Za-z0-9_/\\-]|$)/

function readLeadingSkillReference(text: string): HighlightReference | undefined {
  const match = LEADING_SKILL_PATTERN.exec(text)
  if (!match) return undefined
  return { start: 0, end: match[0].length, type: "skill" }
}

function readSourceRange<TValue>(value: TValue): { start: number; end: number } | undefined {
  const record = parseTJsonObject(value)
  if (!record) return undefined

  const start = parseTNumber(record.start)
  const end = parseTNumber(record.end)
  if (start === undefined || end === undefined) return undefined
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start)
    return undefined

  return { start, end }
}

function readFileHighlightReference(part: ChatFilePart): HighlightReference | undefined {
  const textSource = part.source?.text
  if (!textSource) return undefined
  const range = readSourceRange(textSource)
  if (!range) return undefined

  return {
    ...range,
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

type THighlightedTextProps = {
  text: string
  references: ChatFilePart[]
  agents: ChatAgentPart[]
  inlineReferences?: string[]
}

const EMPTY_INLINE_REFERENCES: string[] = []

function stripMentionPrefix(value: string) {
  return value.startsWith("@") ? value.slice(1) : value
}

const INLINE_REFERENCE_CLASS =
  "mx-1 inline-flex max-w-full items-baseline gap-1 align-baseline font-medium text-text-interactive-base"
const INLINE_REFERENCE_ICON_CLASS = "relative top-px size-3 shrink-0"
/** Artwork, not a glyph — a skill's mark needs the extra pixels to read. */
const INLINE_REFERENCE_SKILL_ICON_CLASS = "relative top-[3px] size-4 shrink-0 rounded-[4px]"

function InlineFileReference({ text }: { text: string }) {
  return (
    <span className={INLINE_REFERENCE_CLASS}>
      <FileTypeIcon fileName={stripMentionPrefix(text)} className={INLINE_REFERENCE_ICON_CLASS} />
      <span className="truncate">{stripMentionPrefix(text)}</span>
    </span>
  )
}

function stripSkillPrefix(value: string) {
  return value.startsWith("/") ? value.slice(1) : value
}

/**
 * The sent form of a composer skill pill, so a message shows the skill the way
 * the composer, the slash menu and the sidebar do.
 */
function InlineSkillReference({ text }: { text: string }) {
  const workspace = useDirectoryWorkspaceOptional()
  const skillPresentation = useSkillPresentationLookup(workspace?.directory)
  const name = stripSkillPrefix(text)
  const presentation = skillPresentation(name)
  if (!presentation) return <>{text}</>

  return (
    <span className={INLINE_REFERENCE_CLASS}>
      <SkillIconMark
        icon={presentation.icon}
        className={INLINE_REFERENCE_SKILL_ICON_CLASS}
        fallback={<RubiksCube className={INLINE_REFERENCE_ICON_CLASS} />}
      />
      <span className="truncate">{presentation.displayName}</span>
    </span>
  )
}

export function HighlightedText({
  text,
  references,
  agents,
  inlineReferences = EMPTY_INLINE_REFERENCES,
}: THighlightedTextProps) {
  const segments = useMemo(() => {
    const allRefs = [
      readLeadingSkillReference(text),
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
        ) : segment.type === "skill" ? (
          <InlineSkillReference key={key} text={segment.text} />
        ) : (
          <span key={key} className={segment.type === "agent" ? "font-medium" : undefined}>
            {segment.text}
          </span>
        ),
      )}
    </>
  )
}
