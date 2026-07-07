export const MARKDOWN_PRINT_PALETTE = {
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

export const MARKDOWN_PRINT_TYPE = {
  bodyFontSize: "11pt",
  bodyLineHeight: "1.5",
  paragraphMarginBlock: "0 0 1em",
  paragraphOrphans: "3",
  paragraphWidows: "2",
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
  taskListItemPaddingLeft: "1.6em",
  taskListCheckboxSize: "0.9em",
  taskListCheckboxTop: "0.25em",
  taskListCheckboxRadius: "2px",
  taskListCheckmarkTop: "0.34em",
  taskListCheckmarkLeft: "0.3em",
  taskListCheckmarkWidth: "0.28em",
  taskListCheckmarkHeight: "0.52em",
  figcaptionFontSize: "0.85em",
  figcaptionLineHeight: "1.35",
  codeFontSize: "9.5pt",
  codeLineHeight: "1.45",
  inlineCodeFontSize: "0.92em",
} as const

export const MARKDOWN_PRINT_MAX_ATOMIC_BLOCK_HEIGHT = "170mm"
export const MARKDOWN_PRINT_MAX_MERMAID_BLOCK_HEIGHT = "115mm"
export const MARKDOWN_PRINT_MAX_MERMAID_BLOCK_WIDTH = "145mm"

export type MarkdownPrintContentCssOptions = {
  hideNativeControls: boolean
  includeRootReset: boolean
  rootSelector: string
}

export function buildMarkdownPrintCssVariables(): string {
  return `
    --markdown-pdf-page: ${MARKDOWN_PRINT_PALETTE.page};
    --markdown-pdf-surface-weak: ${MARKDOWN_PRINT_PALETTE.surfaceWeak};
    --markdown-pdf-surface-weaker: ${MARKDOWN_PRINT_PALETTE.surfaceWeaker};
    --markdown-pdf-border: ${MARKDOWN_PRINT_PALETTE.border};
    --markdown-pdf-border-weak: ${MARKDOWN_PRINT_PALETTE.borderWeak};
    --markdown-pdf-border-weaker: ${MARKDOWN_PRINT_PALETTE.borderWeaker};
    --markdown-pdf-text: ${MARKDOWN_PRINT_PALETTE.text};
    --markdown-pdf-text-strong: ${MARKDOWN_PRINT_PALETTE.textStrong};
    --markdown-pdf-text-weak: ${MARKDOWN_PRINT_PALETTE.textWeak};
    --markdown-pdf-text-weaker: ${MARKDOWN_PRINT_PALETTE.textWeaker};
    --markdown-pdf-link: ${MARKDOWN_PRINT_PALETTE.link};
    --markdown-pdf-code: ${MARKDOWN_PRINT_PALETTE.code};
    --background-base: var(--markdown-pdf-page);
    --background-strong: var(--markdown-pdf-page);
    --background-stronger: var(--markdown-pdf-page);
    --background-weak: var(--markdown-pdf-surface-weak);
    --border-base: var(--markdown-pdf-border);
    --border-critical-base: ${MARKDOWN_PRINT_PALETTE.syntaxCritical};
    --border-hover: var(--markdown-pdf-text-weaker);
    --border-info-base: ${MARKDOWN_PRINT_PALETTE.syntaxInfo};
    --border-interactive-base: var(--markdown-pdf-link);
    --border-interactive-hover: var(--markdown-pdf-link);
    --border-strong-base: var(--markdown-pdf-text-weaker);
    --border-success-base: ${MARKDOWN_PRINT_PALETTE.syntaxSuccess};
    --border-warning-base: ${MARKDOWN_PRINT_PALETTE.syntaxWarning};
    --border-weak-base: var(--markdown-pdf-border-weak);
    --border-weaker-base: var(--markdown-pdf-border-weaker);
    --button-primary-base: var(--markdown-pdf-link);
    --button-primary-hover: var(--markdown-pdf-link);
    --icon-base: var(--markdown-pdf-text-weak);
    --icon-weak: var(--markdown-pdf-text-weaker);
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
    --surface-base: var(--markdown-pdf-page);
    --surface-base-hover: var(--markdown-pdf-surface-weak);
    --surface-critical-weak: var(--markdown-pdf-surface-weak);
    --surface-info-weak: var(--markdown-pdf-surface-weak);
    --surface-inset-base: var(--markdown-pdf-surface-weak);
    --surface-interactive-base: var(--markdown-pdf-surface-weak);
    --surface-interactive-base-hover: var(--markdown-pdf-surface-weaker);
    --surface-interactive-hover: var(--markdown-pdf-surface-weaker);
    --surface-interactive-weak: var(--markdown-pdf-surface-weak);
    --surface-raised-base: var(--markdown-pdf-page);
    --surface-success-weak: var(--markdown-pdf-surface-weak);
    --surface-warning-weak: var(--markdown-pdf-surface-weak);
    --surface-weak: var(--markdown-pdf-surface-weak);
    --surface-weaker: var(--markdown-pdf-surface-weaker);
    --syntax-comment: ${MARKDOWN_PRINT_PALETTE.syntaxComment};
    --syntax-constant: ${MARKDOWN_PRINT_PALETTE.syntaxConstant};
    --syntax-critical: ${MARKDOWN_PRINT_PALETTE.syntaxCritical};
    --syntax-info: ${MARKDOWN_PRINT_PALETTE.syntaxInfo};
    --syntax-keyword: ${MARKDOWN_PRINT_PALETTE.syntaxKeyword};
    --syntax-object: ${MARKDOWN_PRINT_PALETTE.syntaxObject};
    --syntax-operator: ${MARKDOWN_PRINT_PALETTE.syntaxOperator};
    --syntax-primitive: ${MARKDOWN_PRINT_PALETTE.syntaxPrimitive};
    --syntax-property: ${MARKDOWN_PRINT_PALETTE.syntaxProperty};
    --syntax-punctuation: ${MARKDOWN_PRINT_PALETTE.syntaxPunctuation};
    --syntax-regexp: ${MARKDOWN_PRINT_PALETTE.syntaxRegexp};
    --syntax-string: ${MARKDOWN_PRINT_PALETTE.syntaxString};
    --syntax-success: ${MARKDOWN_PRINT_PALETTE.syntaxSuccess};
    --syntax-type: ${MARKDOWN_PRINT_PALETTE.syntaxType};
    --syntax-unknown: ${MARKDOWN_PRINT_PALETTE.syntaxUnknown};
    --syntax-variable: ${MARKDOWN_PRINT_PALETTE.syntaxVariable};
    --syntax-warning: ${MARKDOWN_PRINT_PALETTE.syntaxWarning};
    --text-base: var(--markdown-pdf-text);
    --text-critical-base: ${MARKDOWN_PRINT_PALETTE.syntaxCritical};
    --text-critical-strong: ${MARKDOWN_PRINT_PALETTE.syntaxCritical};
    --text-info-strong: ${MARKDOWN_PRINT_PALETTE.syntaxInfo};
    --text-interactive-base: var(--markdown-pdf-link);
    --text-on-critical-weak: var(--markdown-pdf-text);
    --text-on-info-weak: var(--markdown-pdf-text);
    --text-on-success-weak: var(--markdown-pdf-text);
    --text-on-warning-weak: var(--markdown-pdf-text);
    --text-strong: var(--markdown-pdf-text);
    --text-stronger: var(--markdown-pdf-text-strong);
    --text-success-base: ${MARKDOWN_PRINT_PALETTE.syntaxSuccess};
    --text-warning-base: ${MARKDOWN_PRINT_PALETTE.syntaxWarning};
    --text-weak: var(--markdown-pdf-text-weak);
    --text-weaker: var(--markdown-pdf-text-weaker);
    --color-background-base: var(--markdown-pdf-page);
    --color-background-strong: var(--markdown-pdf-page);
    --color-background-stronger: var(--markdown-pdf-page);
    --color-background-weak: var(--markdown-pdf-surface-weak);
    --color-border-base: var(--markdown-pdf-border);
    --color-border-critical-base: ${MARKDOWN_PRINT_PALETTE.syntaxCritical};
    --color-border-info-base: ${MARKDOWN_PRINT_PALETTE.syntaxInfo};
    --color-border-strong-base: var(--markdown-pdf-text-weaker);
    --color-border-success-base: ${MARKDOWN_PRINT_PALETTE.syntaxSuccess};
    --color-border-warning-base: ${MARKDOWN_PRINT_PALETTE.syntaxWarning};
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
    --color-surface-critical-weak: var(--markdown-pdf-surface-weak);
    --color-surface-info-weak: var(--markdown-pdf-surface-weak);
    --color-surface-success-weak: var(--markdown-pdf-surface-weak);
    --color-surface-warning-weak: var(--markdown-pdf-surface-weak);
    --color-surface-weak: var(--markdown-pdf-surface-weak);
    --color-surface-weaker: var(--markdown-pdf-surface-weaker);
    --color-text-base: var(--markdown-pdf-text);
    --color-text-critical-strong: ${MARKDOWN_PRINT_PALETTE.syntaxCritical};
    --color-text-info-strong: ${MARKDOWN_PRINT_PALETTE.syntaxInfo};
    --color-text-interactive-base: var(--markdown-pdf-link);
    --color-text-on-critical-weak: var(--markdown-pdf-text);
    --color-text-on-info-weak: var(--markdown-pdf-text);
    --color-text-on-success-weak: var(--markdown-pdf-text);
    --color-text-on-warning-weak: var(--markdown-pdf-text);
    --color-text-strong: var(--markdown-pdf-text);
    --color-text-stronger: var(--markdown-pdf-text-strong);
    --color-text-success-base: ${MARKDOWN_PRINT_PALETTE.syntaxSuccess};
    --color-text-warning-base: ${MARKDOWN_PRINT_PALETTE.syntaxWarning};
    --color-text-weak: var(--markdown-pdf-text-weak);
    --color-text-weaker: var(--markdown-pdf-text-weaker);
    --color-syntax-comment: ${MARKDOWN_PRINT_PALETTE.syntaxComment};
    --color-syntax-constant: ${MARKDOWN_PRINT_PALETTE.syntaxConstant};
    --color-syntax-critical: ${MARKDOWN_PRINT_PALETTE.syntaxCritical};
    --color-syntax-info: ${MARKDOWN_PRINT_PALETTE.syntaxInfo};
    --color-syntax-keyword: ${MARKDOWN_PRINT_PALETTE.syntaxKeyword};
    --color-syntax-object: ${MARKDOWN_PRINT_PALETTE.syntaxObject};
    --color-syntax-operator: ${MARKDOWN_PRINT_PALETTE.syntaxOperator};
    --color-syntax-primitive: ${MARKDOWN_PRINT_PALETTE.syntaxPrimitive};
    --color-syntax-property: ${MARKDOWN_PRINT_PALETTE.syntaxProperty};
    --color-syntax-punctuation: ${MARKDOWN_PRINT_PALETTE.syntaxPunctuation};
    --color-syntax-regexp: ${MARKDOWN_PRINT_PALETTE.syntaxRegexp};
    --color-syntax-string: ${MARKDOWN_PRINT_PALETTE.syntaxString};
    --color-syntax-success: ${MARKDOWN_PRINT_PALETTE.syntaxSuccess};
    --color-syntax-type: ${MARKDOWN_PRINT_PALETTE.syntaxType};
    --color-syntax-unknown: ${MARKDOWN_PRINT_PALETTE.syntaxUnknown};
    --color-syntax-variable: ${MARKDOWN_PRINT_PALETTE.syntaxVariable};
    --color-syntax-warning: ${MARKDOWN_PRINT_PALETTE.syntaxWarning};
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
    --tw-prose-pre-code: var(--markdown-pdf-text);`
}

function markdownPrintRootResetCss(rootSelector: string): string {
  return `${rootSelector} {
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    min-height: 0 !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    box-shadow: none !important;
  }`
}

function markdownPrintNativeControlCss(rootSelector: string): string {
  return `${rootSelector} button,
${rootSelector} dialog {
    display: none !important;
  }`
}

export function buildMarkdownPrintContentCss(options: MarkdownPrintContentCssOptions): string {
  const root = options.rootSelector
  const rootResetCss = options.includeRootReset ? `\n\n${markdownPrintRootResetCss(root)}` : ""
  const nativeControlCss = options.hideNativeControls
    ? `\n\n${markdownPrintNativeControlCss(root)}`
    : ""

  return `${rootResetCss}

${root},
${root} .mdxeditor,
${root} .prose,
${root} [contenteditable] {
  background: var(--markdown-pdf-page) !important;
  color: var(--markdown-pdf-text) !important;
  font-size: ${MARKDOWN_PRINT_TYPE.bodyFontSize} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.bodyLineHeight} !important;
  letter-spacing: 0 !important;
}

${root} * {
  letter-spacing: 0 !important;
  text-shadow: none !important;
}

${root} [contenteditable] {
  caret-color: transparent !important;
  outline: none !important;
}

${root} [class*="bg-background"],
${root} [class*="bg-surface"],
${root} [class*="bg-["] {
  background: transparent !important;
}

${root} [data-component="markdown-bench-editor"] {
  padding: 0 !important;
  background: transparent !important;
}

${root} [data-component="markdown-bench-paper"] {
  max-width: none !important;
  margin: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

${root} p,
${root} li,
${root} dd,
${root} dt,
${root} figcaption {
  color: var(--markdown-pdf-text) !important;
  font-size: inherit !important;
  orphans: ${MARKDOWN_PRINT_TYPE.paragraphOrphans};
  widows: ${MARKDOWN_PRINT_TYPE.paragraphWidows};
  break-before: auto;
  break-after: auto;
}

${root} p {
  margin: ${MARKDOWN_PRINT_TYPE.paragraphMarginBlock} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.bodyLineHeight} !important;
}

${root} figcaption {
  color: var(--markdown-pdf-text-weaker) !important;
  font-size: ${MARKDOWN_PRINT_TYPE.figcaptionFontSize} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.figcaptionLineHeight} !important;
}

${root} ul,
${root} ol {
  margin: ${MARKDOWN_PRINT_TYPE.listMarginBlock} !important;
  padding-left: 1.45em !important;
}

${root} li {
  margin: ${MARKDOWN_PRINT_TYPE.listItemMarginBlock} !important;
  padding-left: 0.15em !important;
}

${root} li[role="checkbox"],
${root} li[class*="_listItemChecked_"],
${root} li[class*="_listItemUnchecked_"],
${root} li.task-list-item {
  position: relative !important;
  margin-inline-start: 0 !important;
  padding-left: ${MARKDOWN_PRINT_TYPE.taskListItemPaddingLeft} !important;
  padding-right: 0 !important;
  list-style-type: none !important;
}

${root} li[role="checkbox"]::marker,
${root} li[class*="_listItemChecked_"]::marker,
${root} li[class*="_listItemUnchecked_"]::marker,
${root} li.task-list-item::marker {
  content: "" !important;
}

${root} li[role="checkbox"]::before,
${root} li[class*="_listItemChecked_"]::before,
${root} li[class*="_listItemUnchecked_"]::before {
  box-sizing: border-box !important;
  top: ${MARKDOWN_PRINT_TYPE.taskListCheckboxTop} !important;
  left: 0 !important;
  width: ${MARKDOWN_PRINT_TYPE.taskListCheckboxSize} !important;
  height: ${MARKDOWN_PRINT_TYPE.taskListCheckboxSize} !important;
  border: 1px solid var(--markdown-pdf-border) !important;
  border-radius: ${MARKDOWN_PRINT_TYPE.taskListCheckboxRadius} !important;
  background: transparent !important;
}

${root} li[role="checkbox"][aria-checked="true"]::before,
${root} li[class*="_listItemChecked_"]::before {
  border-color: var(--markdown-pdf-text-weak) !important;
}

${root} li[role="checkbox"]::after,
${root} li[class*="_listItemChecked_"]::after {
  border-color: var(--markdown-pdf-text-weak) !important;
  top: ${MARKDOWN_PRINT_TYPE.taskListCheckmarkTop} !important;
  left: ${MARKDOWN_PRINT_TYPE.taskListCheckmarkLeft} !important;
  width: ${MARKDOWN_PRINT_TYPE.taskListCheckmarkWidth} !important;
  height: ${MARKDOWN_PRINT_TYPE.taskListCheckmarkHeight} !important;
}

${root} li.task-list-item > input[type="checkbox"] {
  box-sizing: border-box !important;
  position: absolute !important;
  top: ${MARKDOWN_PRINT_TYPE.taskListCheckboxTop} !important;
  left: 0 !important;
  width: ${MARKDOWN_PRINT_TYPE.taskListCheckboxSize} !important;
  height: ${MARKDOWN_PRINT_TYPE.taskListCheckboxSize} !important;
  margin: 0 !important;
}

${root} li > p {
  margin: 0 !important;
}

${root} h1,
${root} h2,
${root} h3,
${root} h4,
${root} h5,
${root} h6 {
  color: var(--markdown-pdf-text) !important;
  font-weight: ${MARKDOWN_PRINT_TYPE.headingFontWeight} !important;
  letter-spacing: 0 !important;
  break-after: avoid;
}

${root} h1 {
  margin: ${MARKDOWN_PRINT_TYPE.heading1MarginBlock} !important;
  font-size: ${MARKDOWN_PRINT_TYPE.heading1FontSize} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.heading1LineHeight} !important;
}

${root} h2 {
  margin: ${MARKDOWN_PRINT_TYPE.heading2MarginBlock} !important;
  font-size: ${MARKDOWN_PRINT_TYPE.heading2FontSize} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.heading2LineHeight} !important;
}

${root} h3 {
  margin: ${MARKDOWN_PRINT_TYPE.heading3MarginBlock} !important;
  font-size: ${MARKDOWN_PRINT_TYPE.heading3FontSize} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.heading3LineHeight} !important;
}

${root} h4 {
  margin: ${MARKDOWN_PRINT_TYPE.heading4MarginBlock} !important;
  font-size: ${MARKDOWN_PRINT_TYPE.heading4FontSize} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.heading4LineHeight} !important;
}

${root} h5 {
  margin: ${MARKDOWN_PRINT_TYPE.heading5MarginBlock} !important;
  font-size: ${MARKDOWN_PRINT_TYPE.heading5FontSize} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.heading5LineHeight} !important;
}

${root} h6 {
  margin: ${MARKDOWN_PRINT_TYPE.heading6MarginBlock} !important;
  color: var(--markdown-pdf-text-weak) !important;
  font-size: ${MARKDOWN_PRINT_TYPE.heading6FontSize} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.heading6LineHeight} !important;
}

${root} > :first-child,
${root} [contenteditable] > :first-child {
  margin-top: 0 !important;
}

${root} > :last-child,
${root} [contenteditable] > :last-child {
  margin-bottom: 0 !important;
}

${root} strong,
${root} b {
  color: var(--markdown-pdf-text) !important;
  font-size: inherit !important;
  font-weight: ${MARKDOWN_PRINT_TYPE.strongFontWeight} !important;
}

${root} em,
${root} i {
  color: var(--markdown-pdf-text) !important;
  font-size: inherit !important;
}

${root} del,
${root} s,
${root} blockquote {
  color: var(--markdown-pdf-text-weak) !important;
}

${root} ::marker {
  color: var(--markdown-pdf-text-weaker) !important;
}

${root} a {
  color: var(--markdown-pdf-link) !important;
  text-decoration: underline;
}

${root} hr {
  border-color: var(--markdown-pdf-border) !important;
}

${root} pre,
${root} .shiki {
  background: var(--markdown-pdf-surface-weak) !important;
  color: var(--markdown-pdf-text) !important;
}

${root} pre {
  border: 1px solid var(--markdown-pdf-border-weak) !important;
  white-space: pre-wrap !important;
  overflow: visible !important;
}

${root} code {
  background: transparent !important;
  color: var(--markdown-pdf-code) !important;
  font-size: ${MARKDOWN_PRINT_TYPE.inlineCodeFontSize} !important;
  line-height: inherit !important;
}

${root} :not(pre) > code {
  border: 1px solid var(--markdown-pdf-border-weak) !important;
  border-radius: 4px !important;
  background: var(--markdown-pdf-surface-weaker) !important;
  padding: 0.05em 0.25em !important;
}

${root} pre code,
${root} pre code span {
  border: 0 !important;
  background: transparent !important;
  color: inherit !important;
  font-size: ${MARKDOWN_PRINT_TYPE.codeFontSize} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.codeLineHeight} !important;
  padding: 0 !important;
}

${root} [class*="_codeMirrorWrapper_"] {
  margin: 0.85em 0 1.1em !important;
  border: 1px solid var(--markdown-pdf-border-weak) !important;
  border-radius: 6px !important;
  background: var(--markdown-pdf-surface-weak) !important;
  padding: 0 !important;
  overflow: visible !important;
}

${root} [class*="_codeMirrorToolbar_"],
${root} [class*="_tableColumnEditorPopoverContent_"],
${root} select {
  display: none !important;
}

${root} [class*="_tableColumnEditorTrigger_"],
${root} [class*="_tableRowEditorTrigger_"],
${root} [class*="_addRowButton_"],
${root} [class*="_addColumnButton_"],
${root} [class*="_iconButton_"] {
  visibility: hidden !important;
  pointer-events: none !important;
}

${root} .cm-editor {
  border: 0 !important;
  background: transparent !important;
  color: var(--markdown-pdf-text) !important;
  padding: 0 !important;
  box-shadow: none !important;
}

${root} .cm-content {
  padding: 0.75em 0.9em !important;
}

${root} .cm-scroller,
${root} .cm-content {
  background: transparent !important;
  color: var(--markdown-pdf-text) !important;
  font-size: ${MARKDOWN_PRINT_TYPE.codeFontSize} !important;
  line-height: ${MARKDOWN_PRINT_TYPE.codeLineHeight} !important;
  overflow: visible !important;
}

${root} .cm-line {
  color: var(--markdown-pdf-text) !important;
  line-height: ${MARKDOWN_PRINT_TYPE.codeLineHeight} !important;
}

${root} .cm-gutters {
  display: none !important;
}

${root} .cm-gutterElement {
  color: var(--markdown-pdf-text-weaker) !important;
}

${root} .cm-activeLine,
${root} .cm-activeLineGutter,
${root} .cm-selectionBackground {
  background: transparent !important;
}

${root} .cm-cursor,
${root} .cm-dropCursor {
  display: none !important;
}

${root} table {
  display: table !important;
  width: 100% !important;
  border-collapse: collapse !important;
  border-spacing: 0 !important;
  margin: 0.85em 0 1.1em !important;
  overflow: visible !important;
}

${root} [class*="_tableEditor_"] {
  width: 100% !important;
  border-collapse: collapse !important;
  border-spacing: 0 !important;
  margin: 0.85em 0 1.1em !important;
  overflow: visible !important;
}

${root} thead {
  display: table-header-group !important;
}

${root} tr {
  break-inside: avoid;
}

${root} th,
${root} td {
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

${root} th,
${root} [class*="_tableEditor_"] > tbody > tr:first-child > th:not([data-tool-cell="true"]) {
  background: var(--markdown-pdf-surface-weak) !important;
  font-weight: ${MARKDOWN_PRINT_TYPE.strongFontWeight} !important;
  text-align: left !important;
}

${root} td p,
${root} th p {
  margin: 0 !important;
}

${root} [data-active="true"] {
  outline: none !important;
}

${root} [data-component="markdown-bench-mermaid"] {
  break-inside: avoid;
  margin: 0.85em auto 1.1em !important;
  max-width: ${MARKDOWN_PRINT_MAX_MERMAID_BLOCK_WIDTH} !important;
  width: 100% !important;
}

${root} [data-component="markdown-bench-mermaid"] > div {
  border: 1px solid var(--markdown-pdf-border-weak) !important;
  background: var(--markdown-pdf-page) !important;
  max-width: 100% !important;
}

${root} [data-component="markdown-bench-admonition"],
${root} [data-component="markdown-bench-container-directive"] {
  margin: 0.85em 0 1.1em !important;
  break-inside: avoid-page !important;
  page-break-inside: avoid !important;
}

${root} [data-slot="markdown-bench-directive-label"] {
  break-after: avoid !important;
}

${root} [data-slot="markdown-bench-directive-content"] > :last-child,
${root} [data-slot="markdown-bench-directive-content"] [contenteditable] > :last-child {
  margin-bottom: 0 !important;
}

${root} [data-component="mermaid-diagram-inline-viewport"] {
  height: auto !important;
  min-height: 0 !important;
  overflow: visible !important;
  cursor: default !important;
}

${root} [data-component="mermaid-diagram-inline-viewport"] > div {
  width: 100% !important;
  height: auto !important;
}

${root} [data-component="mermaid-diagram-static-viewport"] {
  display: flex !important;
  justify-content: center !important;
  width: 100% !important;
  max-height: ${MARKDOWN_PRINT_MAX_MERMAID_BLOCK_HEIGHT} !important;
  overflow: visible !important;
}

${root} [data-component="mermaid-diagram"] {
  position: static !important;
  display: flex !important;
  justify-content: center !important;
  width: 100% !important;
  max-width: 100% !important;
  max-height: ${MARKDOWN_PRINT_MAX_MERMAID_BLOCK_HEIGHT} !important;
  height: auto !important;
  padding: 0 !important;
  opacity: 1 !important;
}

${root} [data-component="mermaid-diagram"] svg {
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  max-height: ${MARKDOWN_PRINT_MAX_MERMAID_BLOCK_HEIGHT} !important;
  height: auto !important;
  margin: 0 auto !important;
}

${root} pre,
${root} table,
${root} figure,
${root} img,
${root} svg,
${root} [data-component="markdown-bench-math"][data-display="block"],
${root} [data-component="markdown-bench-mermaid"],
${root} [data-component="markdown-bench-admonition"],
${root} [data-component="markdown-bench-container-directive"],
${root} [data-component="markdown-bench-mdx-intrinsic"],
${root} [data-component="markdown-bench-mdx-svg"] {
  break-inside: avoid-page !important;
  page-break-inside: avoid !important;
}

${root} img,
${root} svg {
  max-width: 100% !important;
  max-height: ${MARKDOWN_PRINT_MAX_ATOMIC_BLOCK_HEIGHT} !important;
  margin: 0.85em auto 1.1em !important;
  object-fit: contain !important;
}

${root} [data-component="markdown-bench-image"] {
  max-width: 100% !important;
  max-height: ${MARKDOWN_PRINT_MAX_ATOMIC_BLOCK_HEIGHT} !important;
  margin: 0.85em auto 1.1em !important;
  border: 0 !important;
  border-radius: 0 !important;
  object-fit: contain !important;
  break-inside: avoid-page !important;
  page-break-inside: avoid !important;
}

${root} [data-markdown-export-ignore],
${root} .mdxeditor-toolbar {
  display: none !important;
}${nativeControlCss}`
}
