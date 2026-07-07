import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { app, BrowserWindow } from "electron"
import type { MarkdownPdfExportInput } from "../preload/types"
import { resolveAvailableMarkdownPdfExportPath } from "./markdown-pdf-path"
import { resolveAllowedDirectoryRoots } from "./storage-paths"

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

function resolveMarkdownPdfAllowedRoots(): string[] {
  return [
    resolveAllowedDirectoryRoots({
      home: app.getPath("home"),
    }),
  ]
}

export async function exportMarkdownPdf(input: MarkdownPdfExportInput): Promise<string | null> {
  const resultPath = await resolveAvailableMarkdownPdfExportPath({
    allowedRoots: resolveMarkdownPdfAllowedRoots(),
    defaultPath: input.defaultPath,
    directory: input.directory,
  })

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
    await writeFile(resultPath, pdf)
    return resultPath
  } finally {
    renderWindow?.destroy()
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}
