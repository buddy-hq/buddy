const PDF_HEADER = "%PDF-1.7\n"
const PDF_OBJECT_HEADER_SUFFIX = " 0 obj\n"
const PDF_OBJECT_FOOTER = "\nendobj\n"
const PDF_XREF_OFFSET_WIDTH = 10
const PDF_PAGE_WIDTH = 612
const PDF_PAGE_HEIGHT = 792
const PDF_LANDSCAPE_PAGE_WIDTH = 792
const PDF_LANDSCAPE_PAGE_HEIGHT = 612
const PDF_COMPACT_PAGE_WIDTH = 420
const PDF_COMPACT_PAGE_HEIGHT = 595
const PDF_TEXT_X = 72
const PDF_TEXT_Y = 720
const PDF_CROPPED_PAGE_TEXT_Y = 520
const PDF_FONT_SIZE = 18

type PdfObject = {
  id: number
  body: string
}

type PdfPageGeometry = {
  mediaBox: readonly [number, number, number, number]
  cropBox?: readonly [number, number, number, number]
  rotation?: number
}

function pdfString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")
}

function contentStream(text: string, y = PDF_TEXT_Y): string {
  const content = `BT /F1 ${PDF_FONT_SIZE} Tf ${PDF_TEXT_X} ${y} Td (${pdfString(text)}) Tj ET`
  return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
}

function boxValue(box: readonly [number, number, number, number]): string {
  return `[${box.join(" ")}]`
}

function pageObject(contentObjectId: number, geometry: PdfPageGeometry): string {
  const cropBox = geometry.cropBox ? ` /CropBox ${boxValue(geometry.cropBox)}` : ""
  const rotation = geometry.rotation === undefined ? "" : ` /Rotate ${geometry.rotation}`
  return `<< /Type /Page /Parent 2 0 R /MediaBox ${boxValue(geometry.mediaBox)}${cropBox}${rotation} /Resources << /Font << /F1 9 0 R >> >> /Contents ${contentObjectId} 0 R >>`
}

function createObjects(): PdfObject[] {
  return [
    {
      id: 1,
      body: "<< /Type /Catalog /Pages 2 0 R /Outlines 10 0 R /PageLabels 15 0 R /PageMode /UseOutlines >>",
    },
    { id: 2, body: "<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>" },
    {
      id: 3,
      body: pageObject(4, { mediaBox: [0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT] }),
    },
    { id: 4, body: contentStream("Buddy PDF page one alpha") },
    {
      id: 5,
      body: pageObject(6, {
        mediaBox: [0, 0, PDF_LANDSCAPE_PAGE_WIDTH, PDF_LANDSCAPE_PAGE_HEIGHT],
        cropBox: [18, 24, 774, 588],
        rotation: 90,
      }),
    },
    { id: 6, body: contentStream("Buddy PDF page two beta", PDF_CROPPED_PAGE_TEXT_Y) },
    {
      id: 7,
      body: pageObject(8, {
        mediaBox: [0, 0, PDF_COMPACT_PAGE_WIDTH, PDF_COMPACT_PAGE_HEIGHT],
        cropBox: [10, 20, 410, 575],
      }),
    },
    { id: 8, body: contentStream("Buddy PDF page three gamma", PDF_CROPPED_PAGE_TEXT_Y) },
    { id: 9, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    { id: 10, body: "<< /Type /Outlines /First 11 0 R /Last 13 0 R /Count 3 >>" },
    {
      id: 11,
      body: "<< /Title (Page one) /Parent 10 0 R /Dest [3 0 R /Fit] /Next 12 0 R >>",
    },
    {
      id: 12,
      body: "<< /Title (Page two) /Parent 10 0 R /Dest [5 0 R /Fit] /Prev 11 0 R /Next 13 0 R >>",
    },
    {
      id: 13,
      body: "<< /Title (Page three) /Parent 10 0 R /Dest [7 0 R /Fit] /Prev 12 0 R >>",
    },
    {
      id: 14,
      body: "<< /Title (Buddy Synthetic PDF) /Author (Buddy Tests) >>",
    },
    {
      id: 15,
      body: "<< /Nums [0 << /S /r >> 1 << /S /D /P (Sheet ) /St 7 >> 2 << /P (Appendix) >>] >>",
    },
  ]
}

/**
 * Builds a deterministic, dependency-free PDF with three pages, searchable
 * text, metadata, an outline, page labels, mixed page sizes, crop boxes, and
 * rotation. Keeping this fixture in source form avoids an opaque binary test
 * asset while still exercising PDF.js's real parser.
 */
export function createSyntheticMultiPagePdf(): Uint8Array<ArrayBuffer> {
  const objects = createObjects()
  let source = PDF_HEADER
  const offsets = new Map<number, number>()

  for (const object of objects) {
    offsets.set(object.id, source.length)
    source += `${object.id}${PDF_OBJECT_HEADER_SUFFIX}${object.body}${PDF_OBJECT_FOOTER}`
  }

  const xrefOffset = source.length
  const objectCount = objects.length + 1
  source += `xref\n0 ${objectCount}\n`
  source += `${"0".repeat(PDF_XREF_OFFSET_WIDTH)} 65535 f \n`
  for (let objectId = 1; objectId < objectCount; objectId += 1) {
    const offset = offsets.get(objectId)
    if (offset === undefined) throw new Error(`Missing PDF object ${objectId}`)
    source += `${String(offset).padStart(PDF_XREF_OFFSET_WIDTH, "0")} 00000 n \n`
  }
  source += `trailer\n<< /Size ${objectCount} /Root 1 0 R /Info 14 0 R >>\n`
  source += `startxref\n${xrefOffset}\n%%EOF\n`

  return new TextEncoder().encode(source)
}
