export const MARKDOWN_PDF_PRINT_PALETTE = {
  page: "#ffffff",
  surfaceWeak: "#f8fafc",
  surfaceWeaker: "#f3f4f6",
  border: "#d1d5db",
  borderWeak: "#e5e7eb",
  borderWeaker: "#edf0f3",
  text: "#111827",
  textStrong: "#030712",
  textWeak: "#374151",
  textWeaker: "#4b5563",
  link: "#1d4ed8",
  code: "#166534",
  syntaxComment: "#64748b",
  syntaxConstant: "#92400e",
  syntaxCritical: "#b91c1c",
  syntaxInfo: "#1d4ed8",
  syntaxKeyword: "#6d28d9",
  syntaxObject: "#0f766e",
  syntaxOperator: "#475569",
  syntaxPrimitive: "#0369a1",
  syntaxProperty: "#0f766e",
  syntaxPunctuation: "#475569",
  syntaxRegexp: "#be123c",
  syntaxString: "#166534",
  syntaxSuccess: "#166534",
  syntaxType: "#0369a1",
  syntaxUnknown: "#4338ca",
  syntaxVariable: "#374151",
  syntaxWarning: "#a16207",
} as const

export const MARKDOWN_PDF_PRINT_TYPE = {
  bodyFontSize: "11pt",
  bodyLineHeight: "1.5",
  paragraphMarginBlock: "0 0 0.85em",
  headingFontWeight: "650",
  strongFontWeight: "600",
  heading1FontSize: "18pt",
  heading1LineHeight: "1.18",
  heading1MarginBlock: "1.55em 0 0.7em",
  heading2FontSize: "15pt",
  heading2LineHeight: "1.24",
  heading2MarginBlock: "1.45em 0 0.6em",
  heading3FontSize: "13pt",
  heading3LineHeight: "1.3",
  heading3MarginBlock: "1.25em 0 0.5em",
  heading4FontSize: "12pt",
  heading4LineHeight: "1.35",
  heading4MarginBlock: "1.1em 0 0.45em",
  heading5FontSize: "11pt",
  heading5LineHeight: "1.4",
  heading5MarginBlock: "1em 0 0.35em",
  heading6FontSize: "10.5pt",
  heading6LineHeight: "1.4",
  heading6MarginBlock: "0.9em 0 0.3em",
  listMarginBlock: "0.35em 0 0.95em",
  listItemMarginBlock: "0.2em 0",
  codeFontSize: "9.5pt",
  codeLineHeight: "1.45",
  inlineCodeFontSize: "0.92em",
} as const

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
    background: ${MARKDOWN_PDF_PRINT_PALETTE.page} !important;
    color: ${MARKDOWN_PDF_PRINT_PALETTE.text} !important;
    color-scheme: light !important;
  }

  html[data-markdown-pdf-document] {
    --markdown-pdf-page: ${MARKDOWN_PDF_PRINT_PALETTE.page};
    --markdown-pdf-surface-weak: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak};
    --markdown-pdf-surface-weaker: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeaker};
    --markdown-pdf-border: ${MARKDOWN_PDF_PRINT_PALETTE.border};
    --markdown-pdf-border-weak: ${MARKDOWN_PDF_PRINT_PALETTE.borderWeak};
    --markdown-pdf-border-weaker: ${MARKDOWN_PDF_PRINT_PALETTE.borderWeaker};
    --markdown-pdf-text: ${MARKDOWN_PDF_PRINT_PALETTE.text};
    --markdown-pdf-text-strong: ${MARKDOWN_PDF_PRINT_PALETTE.textStrong};
    --markdown-pdf-text-weak: ${MARKDOWN_PDF_PRINT_PALETTE.textWeak};
    --markdown-pdf-text-weaker: ${MARKDOWN_PDF_PRINT_PALETTE.textWeaker};
    --markdown-pdf-link: ${MARKDOWN_PDF_PRINT_PALETTE.link};
    --markdown-pdf-code: ${MARKDOWN_PDF_PRINT_PALETTE.code};
    --background-base: var(--markdown-pdf-page);
    --background-strong: var(--markdown-pdf-page);
    --background-stronger: var(--markdown-pdf-page);
    --background-weak: var(--markdown-pdf-surface-weak);
    --border-base: var(--markdown-pdf-border);
    --border-weak-base: var(--markdown-pdf-border-weak);
    --border-weaker-base: var(--markdown-pdf-border-weaker);
    --color-background-base: var(--markdown-pdf-page);
    --color-background-strong: var(--markdown-pdf-page);
    --color-background-stronger: var(--markdown-pdf-page);
    --color-background-weak: var(--markdown-pdf-surface-weak);
    --color-border-base: var(--markdown-pdf-border);
    --color-border-weak-base: var(--markdown-pdf-border-weak);
    --color-border-weaker-base: var(--markdown-pdf-border-weaker);
    --color-markdown-block-quote: var(--markdown-pdf-text-weak);
    --color-markdown-code: var(--markdown-pdf-code);
    --color-markdown-code-block: var(--markdown-pdf-surface-weak);
    --color-markdown-emph: var(--markdown-pdf-text);
    --color-markdown-heading: var(--markdown-pdf-text);
    --color-markdown-horizontal-rule: var(--markdown-pdf-border);
    --color-markdown-image: var(--markdown-pdf-border);
    --color-markdown-image-text: var(--markdown-pdf-text-weaker);
    --color-markdown-link: var(--markdown-pdf-link);
    --color-markdown-link-text: var(--markdown-pdf-link);
    --color-markdown-list-enumeration: var(--markdown-pdf-text-weak);
    --color-markdown-list-item: var(--markdown-pdf-text);
    --color-markdown-strong: var(--markdown-pdf-text);
    --color-markdown-text: var(--markdown-pdf-text);
    --color-surface-raised-base: var(--markdown-pdf-page);
    --color-surface-weak: var(--markdown-pdf-surface-weak);
    --color-surface-weaker: var(--markdown-pdf-surface-weaker);
    --color-text-base: var(--markdown-pdf-text);
    --color-text-interactive-base: var(--markdown-pdf-link);
    --color-text-strong: var(--markdown-pdf-text);
    --color-text-stronger: var(--markdown-pdf-text-strong);
    --color-text-weak: var(--markdown-pdf-text-weak);
    --color-text-weaker: var(--markdown-pdf-text-weaker);
    --color-syntax-comment: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxComment};
    --color-syntax-constant: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxConstant};
    --color-syntax-critical: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxCritical};
    --color-syntax-info: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxInfo};
    --color-syntax-keyword: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxKeyword};
    --color-syntax-object: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxObject};
    --color-syntax-operator: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxOperator};
    --color-syntax-primitive: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxPrimitive};
    --color-syntax-property: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxProperty};
    --color-syntax-punctuation: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxPunctuation};
    --color-syntax-regexp: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxRegexp};
    --color-syntax-string: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxString};
    --color-syntax-success: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxSuccess};
    --color-syntax-type: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxType};
    --color-syntax-unknown: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxUnknown};
    --color-syntax-variable: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxVariable};
    --color-syntax-warning: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxWarning};
    --markdown-block-quote: var(--markdown-pdf-text-weak);
    --markdown-code: var(--markdown-pdf-code);
    --markdown-code-block: var(--markdown-pdf-surface-weak);
    --markdown-emph: var(--markdown-pdf-text);
    --markdown-heading: var(--markdown-pdf-text);
    --markdown-horizontal-rule: var(--markdown-pdf-border);
    --markdown-image: var(--markdown-pdf-border);
    --markdown-image-text: var(--markdown-pdf-text-weaker);
    --markdown-link: var(--markdown-pdf-link);
    --markdown-link-text: var(--markdown-pdf-link);
    --markdown-list-enumeration: var(--markdown-pdf-text-weak);
    --markdown-list-item: var(--markdown-pdf-text);
    --markdown-strong: var(--markdown-pdf-text);
    --markdown-text: var(--markdown-pdf-text);
    --surface-raised-base: var(--markdown-pdf-page);
    --surface-weak: var(--markdown-pdf-surface-weak);
    --surface-weaker: var(--markdown-pdf-surface-weaker);
    --syntax-comment: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxComment};
    --syntax-constant: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxConstant};
    --syntax-critical: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxCritical};
    --syntax-info: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxInfo};
    --syntax-keyword: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxKeyword};
    --syntax-object: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxObject};
    --syntax-operator: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxOperator};
    --syntax-primitive: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxPrimitive};
    --syntax-property: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxProperty};
    --syntax-punctuation: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxPunctuation};
    --syntax-regexp: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxRegexp};
    --syntax-string: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxString};
    --syntax-success: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxSuccess};
    --syntax-type: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxType};
    --syntax-unknown: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxUnknown};
    --syntax-variable: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxVariable};
    --syntax-warning: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxWarning};
    --text-base: var(--markdown-pdf-text);
    --text-interactive-base: var(--markdown-pdf-link);
    --text-strong: var(--markdown-pdf-text);
    --text-stronger: var(--markdown-pdf-text-strong);
    --text-weak: var(--markdown-pdf-text-weak);
    --text-weaker: var(--markdown-pdf-text-weaker);
    --tw-prose-body: var(--markdown-pdf-text);
    --tw-prose-headings: var(--markdown-pdf-text);
    --tw-prose-bold: var(--markdown-pdf-text);
    --tw-prose-links: var(--markdown-pdf-link);
    --tw-prose-code: var(--markdown-pdf-code);
    --tw-prose-quotes: var(--markdown-pdf-text-weak);
    --tw-prose-quote-borders: var(--markdown-pdf-border);
    --tw-prose-captions: var(--markdown-pdf-text-weaker);
    --tw-prose-th-borders: var(--markdown-pdf-border);
    --tw-prose-td-borders: var(--markdown-pdf-border-weak);
    --tw-prose-counters: var(--markdown-pdf-text-weaker);
    --tw-prose-bullets: var(--markdown-pdf-text-weaker);
    --tw-prose-hr: var(--markdown-pdf-border);
    --tw-prose-lead: var(--markdown-pdf-text-weak);
    --tw-prose-pre-bg: var(--markdown-pdf-surface-weak);
    --tw-prose-pre-code: var(--markdown-pdf-text);
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
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.bodyFontSize};
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.bodyLineHeight};
    letter-spacing: 0 !important;
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
    background: var(--markdown-pdf-page) !important;
    color: var(--markdown-pdf-text) !important;
    box-shadow: none !important;
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.bodyFontSize} !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.bodyLineHeight} !important;
    letter-spacing: 0 !important;
  }

  [data-markdown-export-root] * {
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  [data-markdown-export-root],
  [data-markdown-export-root] .mdxeditor,
  [data-markdown-export-root] .prose,
  [data-markdown-export-root] [contenteditable] {
    color: var(--markdown-pdf-text) !important;
  }

  [data-markdown-export-root] [contenteditable] {
    caret-color: transparent !important;
    outline: none !important;
  }

  [data-markdown-export-root] [class*="bg-background"],
  [data-markdown-export-root] [class*="bg-surface"],
  [data-markdown-export-root] [class*="bg-["] {
    background: transparent !important;
  }

  [data-markdown-export-root] p,
  [data-markdown-export-root] li,
  [data-markdown-export-root] dd,
  [data-markdown-export-root] dt,
  [data-markdown-export-root] figcaption {
    color: var(--markdown-pdf-text) !important;
    font-size: inherit !important;
  }

  [data-markdown-export-root] p {
    margin: ${MARKDOWN_PDF_PRINT_TYPE.paragraphMarginBlock} !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.bodyLineHeight} !important;
  }

  [data-markdown-export-root] ul,
  [data-markdown-export-root] ol {
    margin: ${MARKDOWN_PDF_PRINT_TYPE.listMarginBlock} !important;
    padding-left: 1.45em !important;
  }

  [data-markdown-export-root] li {
    margin: ${MARKDOWN_PDF_PRINT_TYPE.listItemMarginBlock} !important;
    padding-left: 0.15em !important;
  }

  [data-markdown-export-root] li > p {
    margin: 0 !important;
  }

  [data-markdown-export-root] h1,
  [data-markdown-export-root] h2,
  [data-markdown-export-root] h3,
  [data-markdown-export-root] h4,
  [data-markdown-export-root] h5,
  [data-markdown-export-root] h6 {
    color: var(--markdown-pdf-text) !important;
    font-weight: ${MARKDOWN_PDF_PRINT_TYPE.headingFontWeight} !important;
    letter-spacing: 0 !important;
    break-after: avoid;
  }

  [data-markdown-export-root] h1 {
    margin: ${MARKDOWN_PDF_PRINT_TYPE.heading1MarginBlock} !important;
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading1FontSize} !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading1LineHeight} !important;
  }

  [data-markdown-export-root] h2 {
    margin: ${MARKDOWN_PDF_PRINT_TYPE.heading2MarginBlock} !important;
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading2FontSize} !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading2LineHeight} !important;
  }

  [data-markdown-export-root] h3 {
    margin: ${MARKDOWN_PDF_PRINT_TYPE.heading3MarginBlock} !important;
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading3FontSize} !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading3LineHeight} !important;
  }

  [data-markdown-export-root] h4 {
    margin: ${MARKDOWN_PDF_PRINT_TYPE.heading4MarginBlock} !important;
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading4FontSize} !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading4LineHeight} !important;
  }

  [data-markdown-export-root] h5 {
    margin: ${MARKDOWN_PDF_PRINT_TYPE.heading5MarginBlock} !important;
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading5FontSize} !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading5LineHeight} !important;
  }

  [data-markdown-export-root] h6 {
    margin: ${MARKDOWN_PDF_PRINT_TYPE.heading6MarginBlock} !important;
    color: var(--markdown-pdf-text-weak) !important;
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading6FontSize} !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading6LineHeight} !important;
  }

  [data-markdown-export-root] > :first-child,
  [data-markdown-export-root] [contenteditable] > :first-child {
    margin-top: 0 !important;
  }

  [data-markdown-export-root] > :last-child,
  [data-markdown-export-root] [contenteditable] > :last-child {
    margin-bottom: 0 !important;
  }

  [data-markdown-export-root] strong,
  [data-markdown-export-root] b {
    color: var(--markdown-pdf-text) !important;
    font-size: inherit !important;
    font-weight: ${MARKDOWN_PDF_PRINT_TYPE.strongFontWeight} !important;
  }

  [data-markdown-export-root] em,
  [data-markdown-export-root] i {
    color: var(--markdown-pdf-text) !important;
    font-size: inherit !important;
  }

  [data-markdown-export-root] del,
  [data-markdown-export-root] s,
  [data-markdown-export-root] blockquote {
    color: var(--markdown-pdf-text-weak) !important;
  }

  [data-markdown-export-root] ::marker {
    color: var(--markdown-pdf-text-weaker) !important;
  }

  [data-markdown-export-root] a {
    color: var(--markdown-pdf-link) !important;
    text-decoration: underline;
  }

  [data-markdown-export-root] hr {
    border-color: var(--markdown-pdf-border) !important;
  }

  [data-markdown-export-root] pre,
  [data-markdown-export-root] .shiki {
    background: var(--markdown-pdf-surface-weak) !important;
    color: var(--markdown-pdf-text) !important;
  }

  [data-markdown-export-root] pre {
    border: 1px solid var(--markdown-pdf-border-weak) !important;
    white-space: pre-wrap !important;
    overflow: visible !important;
  }

  [data-markdown-export-root] code {
    background: transparent !important;
    color: var(--markdown-pdf-code) !important;
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.inlineCodeFontSize} !important;
    line-height: inherit !important;
  }

  [data-markdown-export-root] :not(pre) > code {
    border: 1px solid var(--markdown-pdf-border-weak) !important;
    border-radius: 4px !important;
    background: var(--markdown-pdf-surface-weaker) !important;
    padding: 0.05em 0.25em !important;
  }

  [data-markdown-export-root] pre code,
  [data-markdown-export-root] pre code span {
    border: 0 !important;
    background: transparent !important;
    color: inherit !important;
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.codeFontSize} !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.codeLineHeight} !important;
    padding: 0 !important;
  }

  [data-markdown-export-root] [class*="_codeMirrorWrapper_"] {
    margin: 0.85em 0 1.1em !important;
    border: 1px solid var(--markdown-pdf-border-weak) !important;
    border-radius: 6px !important;
    background: var(--markdown-pdf-surface-weak) !important;
    padding: 0 !important;
    overflow: visible !important;
  }

  [data-markdown-export-root] [class*="_codeMirrorToolbar_"],
  [data-markdown-export-root] [class*="_tableColumnEditorPopoverContent_"],
  [data-markdown-export-root] select {
    display: none !important;
  }

  [data-markdown-export-root] [class*="_tableColumnEditorTrigger_"],
  [data-markdown-export-root] [class*="_tableRowEditorTrigger_"],
  [data-markdown-export-root] [class*="_addRowButton_"],
  [data-markdown-export-root] [class*="_addColumnButton_"],
  [data-markdown-export-root] [class*="_iconButton_"] {
    visibility: hidden !important;
    pointer-events: none !important;
  }

  [data-markdown-export-root] .cm-editor {
    border: 0 !important;
    background: transparent !important;
    color: var(--markdown-pdf-text) !important;
    padding: 0 !important;
    box-shadow: none !important;
  }

  [data-markdown-export-root] .cm-content {
    padding: 0.75em 0.9em !important;
  }

  [data-markdown-export-root] .cm-scroller,
  [data-markdown-export-root] .cm-content {
    background: transparent !important;
    color: var(--markdown-pdf-text) !important;
    font-size: ${MARKDOWN_PDF_PRINT_TYPE.codeFontSize} !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.codeLineHeight} !important;
    overflow: visible !important;
  }

  [data-markdown-export-root] .cm-line {
    color: var(--markdown-pdf-text) !important;
    line-height: ${MARKDOWN_PDF_PRINT_TYPE.codeLineHeight} !important;
  }

  [data-markdown-export-root] .cm-gutters {
    display: none !important;
  }

  [data-markdown-export-root] .cm-gutterElement {
    color: var(--markdown-pdf-text-weaker) !important;
  }

  [data-markdown-export-root] .cm-activeLine,
  [data-markdown-export-root] .cm-activeLineGutter,
  [data-markdown-export-root] .cm-selectionBackground {
    background: transparent !important;
  }

  [data-markdown-export-root] .cm-cursor,
  [data-markdown-export-root] .cm-dropCursor {
    display: none !important;
  }

  [data-markdown-export-root] table {
    display: table !important;
    width: 100% !important;
    border-collapse: collapse !important;
    border-spacing: 0 !important;
    margin: 0.85em 0 1.1em !important;
    overflow: visible !important;
  }

  [data-markdown-export-root] [class*="_tableEditor_"] {
    width: 100% !important;
    border-collapse: collapse !important;
    border-spacing: 0 !important;
    margin: 0.85em 0 1.1em !important;
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
    border-color: var(--markdown-pdf-border) !important;
    border-style: solid !important;
    border-width: 1px !important;
    background: transparent !important;
    color: var(--markdown-pdf-text) !important;
    padding: 0.4em 0.55em !important;
    vertical-align: top !important;
    white-space: normal !important;
    word-break: normal !important;
    overflow-wrap: break-word !important;
  }

  [data-markdown-export-root] th,
  [data-markdown-export-root] [class*="_tableEditor_"] > tbody > tr:first-child > th:not([data-tool-cell="true"]) {
    background: var(--markdown-pdf-surface-weak) !important;
    font-weight: ${MARKDOWN_PDF_PRINT_TYPE.strongFontWeight} !important;
    text-align: left !important;
  }

  [data-markdown-export-root] td p,
  [data-markdown-export-root] th p {
    margin: 0 !important;
  }

  [data-markdown-export-root] [data-active="true"] {
    outline: none !important;
  }

  [data-markdown-export-root] [data-component="markdown-bench-mermaid"] {
    break-inside: avoid;
    margin: 0.85em 0 1.1em !important;
  }

  [data-markdown-export-root] [data-component="markdown-bench-mermaid"] > div {
    border: 1px solid var(--markdown-pdf-border-weak) !important;
    background: var(--markdown-pdf-page) !important;
  }

  [data-markdown-export-root] [data-component="mermaid-diagram-inline-viewport"] {
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    cursor: default !important;
  }

  [data-markdown-export-root] [data-component="mermaid-diagram-static-viewport"] {
    width: 100% !important;
    overflow: visible !important;
  }

  [data-markdown-export-root] [data-component="mermaid-diagram-inline-viewport"] > div {
    width: 100% !important;
    height: auto !important;
  }

  [data-markdown-export-root] [data-component="mermaid-diagram"] {
    position: static !important;
    display: block !important;
    width: 100% !important;
    height: auto !important;
    padding: 0 !important;
    opacity: 1 !important;
  }

  [data-markdown-export-root] [data-component="mermaid-diagram"] svg {
    display: block !important;
    max-width: 100% !important;
    height: auto !important;
  }

  [data-markdown-export-ignore],
  [data-markdown-export-root] .mdxeditor-toolbar,
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
