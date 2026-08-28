import {
  buildMarkdownPrintContentCss,
  buildMarkdownPrintCssVariables,
  MARKDOWN_PRINT_PALETTE,
  MARKDOWN_PRINT_TYPE,
} from "@/lib/markdown-print-theme"

const MARKDOWN_PDF_PRINT_STYLES = `
  @page {
    size: letter;
    margin: 18mm;
  }

  html[data-markdown-pdf-document],
  html[data-markdown-pdf-document] body {
    width: auto !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    background: ${MARKDOWN_PRINT_PALETTE.page} !important;
    color: ${MARKDOWN_PRINT_PALETTE.text} !important;
    color-scheme: light !important;
  }

  html[data-markdown-pdf-document] {
    ${buildMarkdownPrintCssVariables()}
  }

  html[data-markdown-pdf-document] body {
    margin: 0 !important;
    font-family:
      InterVariable,
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    font-size: ${MARKDOWN_PRINT_TYPE.bodyFontSize};
    line-height: ${MARKDOWN_PRINT_TYPE.bodyLineHeight};
    letter-spacing: 0 !important;
  }

  ${buildMarkdownPrintContentCss({
    hideNativeControls: true,
    includeRootReset: true,
    rootSelector: "[data-markdown-export-root]",
  })}
`

const MARKDOWN_PDF_RENDER_STATUS_ATTRIBUTE = "data-markdown-export-status"
const MARKDOWN_PDF_RENDER_STATUS_LOADING = "loading"
const MARKDOWN_PDF_RENDER_READY_TIMEOUT_MS = 10_000

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function resolveDocumentUrl(value: string): string {
  try {
    return new URL(value, document.baseURI).href
  } catch {
    return value
  }
}

function serializedDocumentStyleElement(element: Element): string {
  if (element instanceof HTMLStyleElement) {
    return element.outerHTML
  }

  if (element instanceof HTMLLinkElement) {
    const clone = document.createElement("link")
    for (const attribute of element.attributes) {
      clone.setAttribute(attribute.name, attribute.value)
    }
    const href = element.getAttribute("href")
    if (href) {
      clone.setAttribute("href", resolveDocumentUrl(href))
    }
    return clone.outerHTML
  }

  return ""
}

function serializedDocumentStyles(): string {
  return Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(serializedDocumentStyleElement)
    .filter(Boolean)
    .join("\n")
}

function serializedAllowedAttributes(element: HTMLElement, names: ReadonlySet<string>): string {
  return Array.from(element.attributes)
    .filter((attribute) => names.has(attribute.name))
    .map((attribute) => `${attribute.name}="${escapeHtml(attribute.value)}"`)
    .join(" ")
}

function makeResourceUrlsAbsolute(source: HTMLElement, clone: HTMLElement) {
  const sourceImages = Array.from(source.querySelectorAll("img"))
  const clonedImages = Array.from(clone.querySelectorAll("img"))
  for (const [index, image] of sourceImages.entries()) {
    const clonedImage = clonedImages[index]
    if (!clonedImage) continue
    const resolvedSource = image.currentSrc || image.src
    if (resolvedSource) {
      clonedImage.src = resolvedSource
    }
  }

  const sourceLinks = Array.from(source.querySelectorAll("a"))
  const clonedLinks = Array.from(clone.querySelectorAll("a"))
  for (const [index, link] of sourceLinks.entries()) {
    const clonedLink = clonedLinks[index]
    if (!clonedLink) continue
    if (link.href) {
      clonedLink.href = link.href
    }
  }
}

function removeMarkdownEditorTableControls(clone: HTMLElement): void {
  const editorTables = Array.from(clone.querySelectorAll('table[class*="_tableEditor_"]'))
  for (const table of editorTables) {
    if (!(table instanceof HTMLTableElement)) {
      continue
    }
    if (!table.querySelector('[data-tool-cell="true"]')) {
      continue
    }

    table.tHead?.remove()
    table.tFoot?.remove()
    const colgroup = table.querySelector(":scope > colgroup")
    if (colgroup) {
      const columns = Array.from(colgroup.children).filter(
        (element): element is HTMLTableColElement => element instanceof HTMLTableColElement,
      )
      if (columns.length > 2) {
        columns[columns.length - 1]?.remove()
        columns[0]?.remove()
      }
    }

    table.querySelectorAll('[data-tool-cell="true"]').forEach((element) => {
      element.remove()
    })
  }
}

function hasPendingMarkdownPdfRender(element: HTMLElement): boolean {
  return (
    element.querySelector(
      `[${MARKDOWN_PDF_RENDER_STATUS_ATTRIBUTE}="${MARKDOWN_PDF_RENDER_STATUS_LOADING}"]`,
    ) !== null
  )
}

export async function waitForMarkdownPdfRenderReady(element: HTMLElement): Promise<void> {
  if (!hasPendingMarkdownPdfRender(element) || !("MutationObserver" in globalThis)) {
    return
  }

  await new Promise<void>((resolve) => {
    let observer: MutationObserver | undefined
    const timeout = window.setTimeout(() => {
      observer?.disconnect()
      resolve()
    }, MARKDOWN_PDF_RENDER_READY_TIMEOUT_MS)

    const finishIfReady = () => {
      if (hasPendingMarkdownPdfRender(element)) return
      window.clearTimeout(timeout)
      observer?.disconnect()
      resolve()
    }

    observer = new MutationObserver(finishIfReady)
    observer.observe(element, {
      attributes: true,
      attributeFilter: [MARKDOWN_PDF_RENDER_STATUS_ATTRIBUTE],
      childList: true,
      subtree: true,
    })
    finishIfReady()
  })
}

export function serializeMarkdownPdfDocument(input: {
  title: string
  element: HTMLElement
}): string {
  const clone = input.element.cloneNode(true)
  if (!(clone instanceof HTMLElement)) {
    throw new Error("Unable to clone Markdown preview")
  }

  clone.setAttribute("data-markdown-export-root", "")
  clone.querySelectorAll("[data-markdown-export-ignore], button, dialog").forEach((element) => {
    element.remove()
  })
  removeMarkdownEditorTableControls(clone)
  makeResourceUrlsAbsolute(input.element, clone)

  const documentAttributes = serializedAllowedAttributes(
    document.documentElement,
    new Set(["dir", "lang"]),
  )
  const htmlAttributes = [documentAttributes, 'data-markdown-pdf-document=""']
    .filter(Boolean)
    .join(" ")

  return `<!doctype html>
<html ${htmlAttributes}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    ${serializedDocumentStyles()}
    <style>${MARKDOWN_PDF_PRINT_STYLES}</style>
  </head>
  <body>
    ${clone.outerHTML}
  </body>
</html>`
}
