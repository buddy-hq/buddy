import type { Citation } from "@buddy/citation-contract"
import { language } from "@/context/language"
import { fileNameFromPath } from "@/lib/workspace-file-paths"

export type QuoteData = {
  text: string
  source?: "reading" | "markdown" | "message" | "web"
  path?: string
  comment?: string
  citation?: Citation
}

export type QuoteKind = Citation["source"]["kind"] | "message"

export type QuoteView = {
  kind: QuoteKind
  excerpt: string
  label: string
  comment?: string
  path?: string
  citation?: Citation
}

function quoteKind(data: QuoteData): QuoteKind {
  if (data.citation) return data.citation.source.kind
  if (data.source === "markdown") return "document"
  if (data.source === "message") return "message"
  if (data.source === "web") return "web"
  return "reading"
}

function quotePath(data: QuoteData): string | undefined {
  const source = data.citation?.source
  if (source?.kind === "web") return undefined
  const path = source && source.kind !== "chat" ? (source.path ?? data.path) : data.path
  return path?.trim() ? path : undefined
}

function webHostname(citation: Citation | undefined): string | undefined {
  if (citation?.source.kind !== "web") return undefined
  try {
    return new URL(citation.source.url).hostname || undefined
  } catch {
    return undefined
  }
}

function fallbackLabel(kind: QuoteKind, citation: Citation | undefined): string {
  if (kind === "chat") return language.t("chat.selection.chatTitle")
  if (kind === "message") return language.t("chat.selection.messageTitle")
  const title = citation?.presentation?.title
  if (title) return title
  if (kind === "web") return webHostname(citation) ?? language.t("chat.selection.webTitle")
  return language.t(
    kind === "document" ? "chat.selection.documentTitle" : "chat.selection.passageTitle",
  )
}

export function quoteView(data: QuoteData): QuoteView {
  const kind = quoteKind(data)
  const path = quotePath(data)
  const comment = (data.citation?.comment ?? data.comment)?.trim()
  return Object.assign(
    {
      kind,
      excerpt: data.citation?.excerpt ?? data.text,
      label: path ? fileNameFromPath(path) : fallbackLabel(kind, data.citation),
    },
    comment ? { comment } : undefined,
    path ? { path } : undefined,
    data.citation ? { citation: data.citation } : undefined,
  )
}
