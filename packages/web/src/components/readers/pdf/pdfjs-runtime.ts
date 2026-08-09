import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist"
import { pdfJsRuntimeBaseUrl, pdfJsWorkerSrc } from "virtual:buddy-pdfjs-runtime"
import type { ReaderSource } from "../reader-types"

const PDFJS_CMAP_DIRECTORY = "cmaps/"
const PDFJS_STANDARD_FONT_DIRECTORY = "standard_fonts/"
const PDFJS_WASM_DIRECTORY = "wasm/"
const PDFJS_ICC_DIRECTORY = "iccs/"
const PDFJS_IMAGE_DIRECTORY = "images/"

export type PdfJsRuntimeUrls = {
  workerSrc: string
  cMapUrl: string
  standardFontDataUrl: string
  wasmUrl: string
  iccUrl: string
  imageResourcesPath: string
}

export type LoadedPdfDocument = {
  loadingTask: PDFDocumentLoadingTask
  document: PDFDocumentProxy
}

export function resolvePdfJsRuntimeUrls(): PdfJsRuntimeUrls {
  const baseUrl = new URL(pdfJsRuntimeBaseUrl)
  return {
    workerSrc: pdfJsWorkerSrc,
    cMapUrl: new URL(PDFJS_CMAP_DIRECTORY, baseUrl).toString(),
    standardFontDataUrl: new URL(PDFJS_STANDARD_FONT_DIRECTORY, baseUrl).toString(),
    wasmUrl: new URL(PDFJS_WASM_DIRECTORY, baseUrl).toString(),
    iccUrl: new URL(PDFJS_ICC_DIRECTORY, baseUrl).toString(),
    imageResourcesPath: new URL(PDFJS_IMAGE_DIRECTORY, baseUrl).toString(),
  }
}

async function pdfDocumentSource(source: ReaderSource): Promise<string | URL | Uint8Array> {
  if (source.kind === "url") return source.url
  const buffer = await (source.kind === "file" ? source.file : source.blob).arrayBuffer()
  return new Uint8Array(buffer)
}

export async function loadPdfDocument(input: {
  source: ReaderSource
  signal: AbortSignal
  onPassword: (updatePassword: (password: string) => void, reason: number) => void
}): Promise<LoadedPdfDocument> {
  if (input.signal.aborted) throw new DOMException("PDF loading was cancelled.", "AbortError")

  const urls = resolvePdfJsRuntimeUrls()
  GlobalWorkerOptions.workerSrc = urls.workerSrc
  const source = await pdfDocumentSource(input.source)
  if (input.signal.aborted) throw new DOMException("PDF loading was cancelled.", "AbortError")

  const loadingTask = getDocument({
    ...(typeof source === "string" || source instanceof URL ? { url: source } : { data: source }),
    cMapUrl: urls.cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: urls.standardFontDataUrl,
    wasmUrl: urls.wasmUrl,
    iccUrl: urls.iccUrl,
    useWorkerFetch: false,
  })
  loadingTask.onPassword = input.onPassword

  const abort = () => {
    void loadingTask.destroy().catch(() => undefined)
  }
  input.signal.addEventListener("abort", abort, { once: true })
  try {
    const document = await loadingTask.promise
    if (input.signal.aborted) {
      await loadingTask.destroy()
      throw new DOMException("PDF loading was cancelled.", "AbortError")
    }
    return {
      loadingTask,
      document,
    }
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined)
    throw error
  } finally {
    input.signal.removeEventListener("abort", abort)
  }
}
