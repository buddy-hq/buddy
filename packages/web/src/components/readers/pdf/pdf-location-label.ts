const PDF_PAGE_NUMBER_OFFSET = 1

export function pdfLocationLabel(input: {
  pageIndex: number
  pageCount: number
  pageLabel: string
}): string {
  const pageNumber = input.pageIndex + PDF_PAGE_NUMBER_OFFSET
  const base = `Page ${pageNumber.toLocaleString()} of ${input.pageCount.toLocaleString()}`
  return input.pageLabel === String(pageNumber) ? base : `${base} · Label ${input.pageLabel}`
}
