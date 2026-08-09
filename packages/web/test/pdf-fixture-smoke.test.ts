import { describe, expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { findPdfTextMatches } from "../src/components/readers/pdf/pdf-search"
import { createSyntheticMultiPagePdf } from "./fixtures/synthetic-pdf"

const SYNTHETIC_PAGE_TEXT = [
  "Buddy PDF page one alpha",
  "Buddy PDF page two beta",
  "Buddy PDF page three gamma",
] as const
const STANDARD_FONT_DATA_URL = fileURLToPath(
  new URL("../standard_fonts/", import.meta.resolve("pdfjs-dist")),
)

function textItemValue(item: unknown): string {
  if (typeof item !== "object" || item === null || !("str" in item)) return ""
  return typeof item.str === "string" ? item.str : ""
}

describe("synthetic multi-page PDF smoke fixture", () => {
  test("is a deterministic PDF payload with a complete cross-reference table", () => {
    const first = createSyntheticMultiPagePdf()
    const second = createSyntheticMultiPagePdf()
    const source = new TextDecoder().decode(first)

    expect(first).toEqual(second)
    expect(source).toStartWith("%PDF-1.7")
    expect(source).toContain("xref\n0 16")
    expect(source).toEndWith("%%EOF\n")
  })

  test("opens through the real PDF.js parser with pages, metadata, outline, and text", async () => {
    const loadingTask = getDocument({
      data: createSyntheticMultiPagePdf(),
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      useWorkerFetch: false,
    })

    try {
      const document = await loadingTask.promise
      expect(document.numPages).toBe(SYNTHETIC_PAGE_TEXT.length)

      const metadata = await document.getMetadata()
      expect(Reflect.get(metadata.info, "Title")).toBe("Buddy Synthetic PDF")
      expect(Reflect.get(metadata.info, "Author")).toBe("Buddy Tests")

      const outline = await document.getOutline()
      expect(outline?.map((item) => item.title)).toEqual(["Page one", "Page two", "Page three"])

      expect(await document.getPageLabels()).toEqual(["i", "Sheet 7", "Appendix"])

      const firstPage = await document.getPage(1)
      const secondPage = await document.getPage(2)
      const thirdPage = await document.getPage(3)
      expect(firstPage.view).toEqual([0, 0, 612, 792])
      expect(firstPage.rotate).toBe(0)
      expect(secondPage.view).toEqual([18, 24, 774, 588])
      expect(secondPage.rotate).toBe(90)
      expect(secondPage.getViewport({ scale: 1 })).toMatchObject({
        width: 564,
        height: 756,
        rotation: 90,
      })
      expect(thirdPage.view).toEqual([10, 20, 410, 575])
      expect(thirdPage.rotate).toBe(0)

      const extractedText: string[] = []
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const textContent = await page.getTextContent()
        extractedText.push(textContent.items.map(textItemValue).join(""))
      }
      expect(extractedText).toEqual([...SYNTHETIC_PAGE_TEXT])

      const matches = findPdfTextMatches(extractedText.join("\n"), "page two", {
        matchCase: false,
        matchWholeWords: true,
        matchDiacritics: false,
      })
      expect(matches).toHaveLength(1)
      expect(matches[0]?.match).toBe("page two")
    } finally {
      await loadingTask.destroy()
    }
  })
})
