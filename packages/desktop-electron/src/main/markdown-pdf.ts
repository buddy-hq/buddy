import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { app, BrowserWindow, dialog } from "electron"
import type { MarkdownPdfExportInput } from "../preload/types"

const MARKDOWN_PDF_RENDER_READY_SCRIPT = `
  (async () => {
    const imagePromises = Array.from(document.images, (image) => {
      if (image.complete) return Promise.resolve()
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true })
        image.addEventListener("error", resolve, { once: true })
      })
    })
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve()
    await Promise.all([fontsReady, ...imagePromises])
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })()
	`

const MARKDOWN_PDF_LETTER_WIDTH_PIXELS = 816
const MARKDOWN_PDF_LETTER_HEIGHT_PIXELS = 1056

export async function exportMarkdownPdf(input: MarkdownPdfExportInput): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    title: "Export Markdown as PDF",
    defaultPath: join(app.getPath("documents"), input.defaultPath),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  })
  if (result.canceled || !result.filePath) return null

  const temporaryDirectory = await mkdtemp(join(app.getPath("temp"), "buddy-markdown-pdf-"))
  const htmlPath = join(temporaryDirectory, "document.html")
  let renderWindow: BrowserWindow | undefined

  try {
    await writeFile(htmlPath, input.html, "utf8")
    renderWindow = new BrowserWindow({
      show: false,
      width: MARKDOWN_PDF_LETTER_WIDTH_PIXELS,
      height: MARKDOWN_PDF_LETTER_HEIGHT_PIXELS,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    await renderWindow.loadFile(htmlPath)
    await renderWindow.webContents.executeJavaScript(MARKDOWN_PDF_RENDER_READY_SCRIPT)
    const pdf = await renderWindow.webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
    })
    await writeFile(result.filePath, pdf)
    return result.filePath
  } finally {
    renderWindow?.destroy()
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}
