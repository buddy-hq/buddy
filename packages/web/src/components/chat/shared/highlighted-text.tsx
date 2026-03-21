import { useMemo } from 'react'
import { cn } from '@buddy/ui'
import { isRecord } from './utils'
import type { MessagePart } from '@/state/chat-types'

type HighlightSegment = { text: string; type?: 'file' | 'agent' }

type HighlightReference = {
  start: number
  end: number
  type: 'file' | 'agent'
}

function readSourceRange(value: unknown): { start: number; end: number } | undefined {
  if (!isRecord(value)) return undefined

  const start = value.start
  const end = value.end
  if (typeof start !== 'number' || typeof end !== 'number') return undefined
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start)
    return undefined

  return { start, end }
}

function readFileHighlightReference(part: MessagePart): HighlightReference | undefined {
  if (part.type !== 'file') return undefined

  const source = isRecord(part.source) ? part.source : undefined
  const textSource = source ? readSourceRange(source.text) : undefined
  if (!textSource) return undefined

  return {
    ...textSource,
    type: 'file',
  }
}

function readAgentHighlightReference(part: MessagePart): HighlightReference | undefined {
  if (part.type !== 'agent') return undefined

  const source = readSourceRange(part.source)
  if (!source) return undefined

  return {
    ...source,
    type: 'agent',
  }
}

interface HighlightedTextProps {
  text: string
  references: MessagePart[]
  agents: MessagePart[]
}

export function HighlightedText({ text, references, agents }: HighlightedTextProps) {
  const segments = useMemo(() => {
    const allRefs = [
      ...references.map(readFileHighlightReference),
      ...agents.map(readAgentHighlightReference),
    ]
      .filter((ref): ref is HighlightReference => ref !== undefined)
      .sort((a, b) => a.start - b.start)

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

    return result
  }, [agents, references, text])

  return (
    <>
      {segments.map((segment, index) => (
        <span
          key={index}
          className={cn(
            segment.type === 'file' && 'text-primary',
            segment.type === 'agent' && 'text-foreground font-medium',
          )}
        >
          {segment.text}
        </span>
      ))}
    </>
  )
}

export function isAttachmentFilePart(part: MessagePart) {
  if (part.type !== 'file') return false

  const mime = typeof part.mime === 'string' ? part.mime : undefined
  if (!mime) return false

  return mime.startsWith('image/') || mime === 'application/pdf'
}
