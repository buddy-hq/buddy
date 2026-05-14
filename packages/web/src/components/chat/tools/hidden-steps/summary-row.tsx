import { Markdown } from "@/components/markdown/Markdown"

import type { ResolvedSummaryContent, ResolvedSummaryContentFormat } from "../tool-registry-types"
import type { HiddenStepsEntry } from "./entries"
import { HIDDEN_STEPS_MARKDOWN_CLASS_NAME } from "./styles"

function detailKindClassName(kind: ResolvedSummaryContentFormat): string {
  return kind === "markdown"
    ? HIDDEN_STEPS_MARKDOWN_CLASS_NAME
    : "whitespace-pre-wrap break-words font-mono text-xs text-text-weaker"
}

function detailCacheKey(partID: string, detail: ResolvedSummaryContent): string {
  return `${partID}:hidden-detail:${detail.format}:${detail.value}`
}

function uniqueDetails(
  details: Array<ResolvedSummaryContent | undefined>,
): ResolvedSummaryContent[] {
  const seen = new Set<string>()
  const values: ResolvedSummaryContent[] = []

  for (const detail of details) {
    if (!detail) {
      continue
    }

    const value = detail.value.trim()
    if (!value) {
      continue
    }

    const key = `${detail.format}:${value}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    values.push({ ...detail, value })
  }

  return values
}

function buildSummaryRowDetails(entry: HiddenStepsEntry): ResolvedSummaryContent[] {
  return uniqueDetails(entry.summary?.details ?? [])
}

export function HiddenStepsSummaryRow(props: { entry: HiddenStepsEntry; directory?: string }) {
  const { entry, directory } = props
  if (!entry.info || !entry.summary) {
    return null
  }

  const details = buildSummaryRowDetails(entry)

  return (
    <div className="rounded-md border border-border-base bg-background-base px-3 py-2">
      <div className="mb-2 text-xs font-medium text-text-weak">{entry.info.title}</div>
      {details.map((detail) =>
        detail.format === "markdown" ? (
          <Markdown
            key={detailCacheKey(entry.part.id, detail)}
            text={detail.value}
            cacheKey={detailCacheKey(entry.part.id, detail)}
            className={detailKindClassName(detail.format)}
            directory={directory}
          />
        ) : (
          <div
            key={detailCacheKey(entry.part.id, detail)}
            className={detailKindClassName(detail.format)}
          >
            {detail.value}
          </div>
        ),
      )}
    </div>
  )
}
