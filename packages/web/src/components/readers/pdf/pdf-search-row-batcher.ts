import type { ReaderSearchResult, ReaderSearchRow } from "../reader-types"

type PdfSearchResultRow = Extract<ReaderSearchRow, { kind: "result" }>

export type PdfSearchRowBatcher = {
  queue: (results: ReaderSearchResult[]) => void
  cancel: () => void
}

export function createPdfSearchRowBatcher(input: {
  schedule: (flush: () => void) => number
  cancelScheduled: (frame: number) => void
  onRows: (rows: PdfSearchResultRow[]) => void
}): PdfSearchRowBatcher {
  let scheduledFrame: number | null = null
  let pendingRows: PdfSearchResultRow[] = []

  function cancel(): void {
    if (scheduledFrame !== null) {
      input.cancelScheduled(scheduledFrame)
      scheduledFrame = null
    }
    pendingRows = []
  }

  function queue(results: ReaderSearchResult[]): void {
    if (results.length === 0) return
    pendingRows.push(
      ...results.map(
        (result): PdfSearchResultRow => ({
          id: result.id,
          kind: "result",
          result,
        }),
      ),
    )
    if (scheduledFrame !== null) return
    scheduledFrame = input.schedule(() => {
      scheduledFrame = null
      const rows = pendingRows
      pendingRows = []
      if (rows.length > 0) input.onRows(rows)
    })
  }

  return { queue, cancel }
}
