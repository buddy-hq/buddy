export function createTestPdf(pageCount = 1): string {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) {
    throw new Error("Test PDF page count must be a positive integer")
  }

  const pageObjectStart = 3
  const contentsObjectNumber = pageObjectStart + pageCount
  const pageObjectNumbers = Array.from(
    { length: pageCount },
    (_, index) => pageObjectStart + index,
  )
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers
      .map((objectNumber) => `${objectNumber} 0 R`)
      .join(" ")}] /Count ${pageCount} >>`,
    ...pageObjectNumbers.map(
      () =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentsObjectNumber} 0 R >>`,
    ),
    "<< /Length 0 >>\nstream\n\nendstream",
  ])
}

export function createTextPdf(text: string): string {
  const escapedText = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")
  const content = `BT\n/F1 24 Tf\n72 720 Td\n(${escapedText}) Tj\nET`
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ])
}

function buildPdf(objects: string[]): string {
  let body = "%PDF-1.4\n"
  const offsets: number[] = []
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body)
  const xref = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  return `${body}xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
}
