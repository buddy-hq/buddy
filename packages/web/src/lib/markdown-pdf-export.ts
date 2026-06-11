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
    background: #ffffff !important;
    color: #111827 !important;
    color-scheme: light !important;
  }

  html[data-markdown-pdf-document] {
    --background-base: #ffffff;
    --background-strong: #ffffff;
    --background-stronger: #ffffff;
    --background-weak: #f8fafc;
    --border-base: #d1d5db;
    --border-weak-base: #e5e7eb;
    --border-weaker-base: #edf0f3;
    --color-background-base: #ffffff;
    --color-border-base: #d1d5db;
    --color-border-weak-base: #e5e7eb;
    --color-border-weaker-base: #edf0f3;
    --color-surface-raised-base: #ffffff;
    --color-surface-weak: #f8fafc;
    --color-surface-weaker: #f3f4f6;
    --color-text-base: #111827;
    --color-text-interactive-base: #1d4ed8;
    --color-text-strong: #111827;
    --color-text-stronger: #030712;
    --color-text-weak: #374151;
    --color-text-weaker: #4b5563;
    --color-syntax-string: #166534;
    --surface-raised-base: #ffffff;
    --surface-weak: #f8fafc;
    --surface-weaker: #f3f4f6;
    --text-base: #111827;
    --text-interactive-base: #1d4ed8;
    --text-strong: #111827;
    --text-stronger: #030712;
    --text-weak: #374151;
    --text-weaker: #4b5563;
    --tw-prose-body: #111827;
    --tw-prose-headings: #111827;
    --tw-prose-bold: #111827;
    --tw-prose-links: #1d4ed8;
    --tw-prose-code: #111827;
    --tw-prose-quotes: #374151;
    --tw-prose-quote-borders: #d1d5db;
    --tw-prose-captions: #4b5563;
    --tw-prose-th-borders: #d1d5db;
    --tw-prose-td-borders: #e5e7eb;
    --tw-prose-counters: #4b5563;
    --tw-prose-bullets: #4b5563;
    --tw-prose-hr: #d1d5db;
    --tw-prose-lead: #374151;
    --tw-prose-pre-bg: #f8fafc;
    --tw-prose-pre-code: #111827;
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
    font-size: 11pt;
    line-height: 1.55;
  }

  [data-markdown-export-root] {
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    min-height: 0 !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #ffffff !important;
    color: #111827 !important;
    box-shadow: none !important;
  }

  [data-markdown-export-root] * {
    text-shadow: none !important;
  }

  [data-markdown-export-root] [class*="bg-background"],
  [data-markdown-export-root] [class*="bg-surface"],
  [data-markdown-export-root] [class*="bg-["] {
    background: transparent !important;
  }

  [data-markdown-export-root] h1,
  [data-markdown-export-root] h2,
  [data-markdown-export-root] h3,
  [data-markdown-export-root] h4,
  [data-markdown-export-root] h5,
  [data-markdown-export-root] h6 {
    color: #111827 !important;
    break-after: avoid;
  }

  [data-markdown-export-root] a {
    color: #1d4ed8 !important;
    text-decoration: underline;
  }

  [data-markdown-export-root] hr {
    border-color: #d1d5db !important;
  }

  [data-markdown-export-root] pre,
  [data-markdown-export-root] code,
  [data-markdown-export-root] .shiki {
    background: #f8fafc !important;
    color: #111827 !important;
  }

  [data-markdown-export-root] pre {
    border: 1px solid #e5e7eb !important;
    white-space: pre-wrap !important;
    overflow: visible !important;
  }

  [data-markdown-export-root] pre code,
  [data-markdown-export-root] pre code span {
    color: inherit !important;
  }

  [data-markdown-export-root] table {
    display: table !important;
    width: 100% !important;
    border-collapse: collapse !important;
    overflow: visible !important;
  }

  [data-markdown-export-root] thead {
    display: table-header-group !important;
  }

  [data-markdown-export-root] tr {
    break-inside: avoid;
  }

  [data-markdown-export-root] th,
  [data-markdown-export-root] td {
    border-color: #d1d5db !important;
    color: #111827 !important;
  }

  [data-markdown-export-ignore],
  button,
  dialog {
    display: none !important;
  }

  pre,
  table,
  img,
  svg {
    break-inside: avoid;
  }

  img,
  svg {
    max-width: 100% !important;
  }
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

function hasPendingMarkdownPdfRender(element: HTMLElement): boolean {
  return (
    element.querySelector(
      `[${MARKDOWN_PDF_RENDER_STATUS_ATTRIBUTE}="${MARKDOWN_PDF_RENDER_STATUS_LOADING}"]`,
    ) !== null
  )
}

export async function waitForMarkdownPdfRenderReady(element: HTMLElement): Promise<void> {
  if (!hasPendingMarkdownPdfRender(element) || typeof MutationObserver === "undefined") {
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
