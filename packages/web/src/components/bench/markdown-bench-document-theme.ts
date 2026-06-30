import type { DesktopTheme, ResolvedTheme } from "@/theme/types"
import { resolveThemeVariant, themeToCss } from "@/theme/resolve"
import {
  createMermaidThemeConfig,
  type MermaidThemeConfig,
} from "@/components/media/renderers/mermaid/lib/theme"
import { MARKDOWN_PDF_PRINT_PALETTE, MARKDOWN_PDF_PRINT_TYPE } from "@/lib/markdown-pdf-export"

export type MarkdownBenchContentThemeMode = "light" | "dark" | "print"

export type MarkdownBenchContentTheme = {
  mermaidThemeConfig: MermaidThemeConfig
  mode: MarkdownBenchContentThemeMode
  variables: string
}

const DEFAULT_MARKDOWN_BENCH_DOCUMENT_FONT_SCALE = 1
const MARKDOWN_BENCH_THEME_SCOPE_ID_PATTERN = /[^a-zA-Z0-9_-]/gu
const MARKDOWN_BENCH_THEME_SCOPE_ID_FALLBACK = "markdown-bench-document"

export function sanitizeMarkdownBenchThemeScopeID(value: string): string {
  const sanitized = value.replace(MARKDOWN_BENCH_THEME_SCOPE_ID_PATTERN, "")
  return sanitized || MARKDOWN_BENCH_THEME_SCOPE_ID_FALLBACK
}

export function isMarkdownBenchContentThemeMode(
  value: string,
): value is MarkdownBenchContentThemeMode {
  return value === "light" || value === "dark" || value === "print"
}

function markdownBenchContentColorScheme(mode: MarkdownBenchContentThemeMode): "dark" | "light" {
  return mode === "dark" ? "dark" : "light"
}

function printThemeVariables(): string {
  return `
  --background-base: ${MARKDOWN_PDF_PRINT_PALETTE.page};
  --background-strong: ${MARKDOWN_PDF_PRINT_PALETTE.page};
  --background-stronger: ${MARKDOWN_PDF_PRINT_PALETTE.page};
  --background-weak: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak};
  --border-base: ${MARKDOWN_PDF_PRINT_PALETTE.border};
  --border-hover: ${MARKDOWN_PDF_PRINT_PALETTE.textWeaker};
  --border-interactive-base: ${MARKDOWN_PDF_PRINT_PALETTE.link};
  --border-interactive-hover: ${MARKDOWN_PDF_PRINT_PALETTE.link};
  --border-weak-base: ${MARKDOWN_PDF_PRINT_PALETTE.borderWeak};
  --border-weaker-base: ${MARKDOWN_PDF_PRINT_PALETTE.borderWeaker};
  --button-primary-base: ${MARKDOWN_PDF_PRINT_PALETTE.link};
  --button-primary-hover: ${MARKDOWN_PDF_PRINT_PALETTE.link};
  --icon-base: ${MARKDOWN_PDF_PRINT_PALETTE.textWeak};
  --icon-weak: ${MARKDOWN_PDF_PRINT_PALETTE.textWeaker};
  --markdown-block-quote: ${MARKDOWN_PDF_PRINT_PALETTE.textWeak};
  --markdown-code: ${MARKDOWN_PDF_PRINT_PALETTE.code};
  --markdown-code-block: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak};
  --markdown-emph: ${MARKDOWN_PDF_PRINT_PALETTE.text};
  --markdown-heading: ${MARKDOWN_PDF_PRINT_PALETTE.text};
  --markdown-horizontal-rule: ${MARKDOWN_PDF_PRINT_PALETTE.border};
  --markdown-image: ${MARKDOWN_PDF_PRINT_PALETTE.border};
  --markdown-image-text: ${MARKDOWN_PDF_PRINT_PALETTE.textWeaker};
  --markdown-link: ${MARKDOWN_PDF_PRINT_PALETTE.link};
  --markdown-link-text: ${MARKDOWN_PDF_PRINT_PALETTE.link};
  --markdown-list-enumeration: ${MARKDOWN_PDF_PRINT_PALETTE.textWeak};
  --markdown-list-item: ${MARKDOWN_PDF_PRINT_PALETTE.text};
  --markdown-strong: ${MARKDOWN_PDF_PRINT_PALETTE.text};
  --markdown-text: ${MARKDOWN_PDF_PRINT_PALETTE.text};
  --surface-base: ${MARKDOWN_PDF_PRINT_PALETTE.page};
  --surface-base-hover: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak};
  --surface-inset-base: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak};
  --surface-interactive-base: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak};
  --surface-interactive-base-hover: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeaker};
  --surface-interactive-hover: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeaker};
  --surface-interactive-weak: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak};
  --surface-raised-base: ${MARKDOWN_PDF_PRINT_PALETTE.page};
  --surface-weak: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak};
  --surface-weaker: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeaker};
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
  --text-base: ${MARKDOWN_PDF_PRINT_PALETTE.text};
  --text-critical-base: ${MARKDOWN_PDF_PRINT_PALETTE.syntaxCritical};
  --text-interactive-base: ${MARKDOWN_PDF_PRINT_PALETTE.link};
  --text-strong: ${MARKDOWN_PDF_PRINT_PALETTE.text};
  --text-stronger: ${MARKDOWN_PDF_PRINT_PALETTE.textStrong};
  --text-weak: ${MARKDOWN_PDF_PRINT_PALETTE.textWeak};
  --text-weaker: ${MARKDOWN_PDF_PRINT_PALETTE.textWeaker};`
}

function themeToken(tokens: ResolvedTheme, key: string, fallback: string): string {
  return tokens[key] ?? fallback
}

function mermaidThemeConfigFromResolvedTheme(tokens: ResolvedTheme): MermaidThemeConfig {
  return createMermaidThemeConfig({
    backgroundBase: themeToken(tokens, "background-base", "#ffffff"),
    borderBase: themeToken(tokens, "border-base", "#d1d5db"),
    surfaceBase: themeToken(tokens, "surface-base", "#ffffff"),
    surfaceRaisedBase: themeToken(tokens, "surface-raised-base", "#f5f5f5"),
    surfaceWeak: themeToken(tokens, "surface-weak", "#efefef"),
    textBase: themeToken(tokens, "text-base", "#1f2937"),
    textInteractiveBase: themeToken(tokens, "text-interactive-base", "#2563eb"),
    textInvertBase: themeToken(tokens, "text-invert-base", "#ffffff"),
    textStrong: themeToken(tokens, "text-strong", "#111827"),
    textWeak: themeToken(tokens, "text-weak", "#6b7280"),
  })
}

function printMermaidThemeConfig(): MermaidThemeConfig {
  return createMermaidThemeConfig({
    backgroundBase: MARKDOWN_PDF_PRINT_PALETTE.page,
    borderBase: MARKDOWN_PDF_PRINT_PALETTE.border,
    surfaceBase: MARKDOWN_PDF_PRINT_PALETTE.page,
    surfaceRaisedBase: MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak,
    surfaceWeak: MARKDOWN_PDF_PRINT_PALETTE.surfaceWeaker,
    textBase: MARKDOWN_PDF_PRINT_PALETTE.text,
    textInteractiveBase: MARKDOWN_PDF_PRINT_PALETTE.link,
    textInvertBase: MARKDOWN_PDF_PRINT_PALETTE.page,
    textStrong: MARKDOWN_PDF_PRINT_PALETTE.textStrong,
    textWeak: MARKDOWN_PDF_PRINT_PALETTE.textWeak,
  })
}

export function resolveMarkdownBenchContentTheme(input: {
  theme: DesktopTheme
  mode: MarkdownBenchContentThemeMode
}): MarkdownBenchContentTheme {
  if (input.mode === "print") {
    return {
      mermaidThemeConfig: printMermaidThemeConfig(),
      mode: input.mode,
      variables: printThemeVariables(),
    }
  }

  const isDark = input.mode === "dark"
  const variant = isDark ? input.theme.dark : input.theme.light
  const tokens = resolveThemeVariant(variant, isDark)
  return {
    mermaidThemeConfig: mermaidThemeConfigFromResolvedTheme(tokens),
    mode: input.mode,
    variables: themeToCss(tokens),
  }
}

export function buildMarkdownBenchContentThemeCss(input: {
  contentFontScale?: number
  scopeID: string
  theme: MarkdownBenchContentTheme
}): string {
  const safeScopeID = sanitizeMarkdownBenchThemeScopeID(input.scopeID)
  const colorScheme = markdownBenchContentColorScheme(input.theme.mode)
  const contentFontScale =
    input.theme.mode === "print"
      ? DEFAULT_MARKDOWN_BENCH_DOCUMENT_FONT_SCALE
      : (input.contentFontScale ?? DEFAULT_MARKDOWN_BENCH_DOCUMENT_FONT_SCALE)
  const printCss =
    input.theme.mode === "print" ? `\n\n${buildMarkdownBenchPrintThemeCss(safeScopeID)}` : ""
  return `[data-markdown-bench-theme-scope="${safeScopeID}"] {
  color-scheme: ${colorScheme};
  --markdown-bench-document-font-scale: ${contentFontScale};
  --text-mix-blend-mode: ${colorScheme === "dark" ? "plus-lighter" : "multiply"};
  ${input.theme.variables}
  --color-background-base: var(--background-base);
  --color-background-strong: var(--background-strong);
  --color-background-stronger: var(--background-stronger);
  --color-background-weak: var(--background-weak);
  --color-border-base: var(--border-base);
  --color-border-hover: var(--border-hover);
  --color-border-weak-base: var(--border-weak-base);
  --color-border-weaker-base: var(--border-weaker-base);
  --color-markdown-block-quote: var(--markdown-block-quote);
  --color-markdown-code: var(--markdown-code);
  --color-markdown-code-block: var(--markdown-code-block);
  --color-markdown-emph: var(--markdown-emph);
  --color-markdown-heading: var(--markdown-heading);
  --color-markdown-horizontal-rule: var(--markdown-horizontal-rule);
  --color-markdown-link: var(--markdown-link);
  --color-markdown-link-text: var(--markdown-link-text);
  --color-markdown-list-enumeration: var(--markdown-list-enumeration);
  --color-markdown-list-item: var(--markdown-list-item);
  --color-markdown-strong: var(--markdown-strong);
  --color-markdown-text: var(--markdown-text);
  --color-surface-base: var(--surface-base);
  --color-surface-base-hover: var(--surface-base-hover);
  --color-surface-inset-base: var(--surface-inset-base);
  --color-surface-interactive-hover: var(--surface-interactive-hover);
  --color-surface-interactive-weak: var(--surface-interactive-weak);
  --color-surface-raised-base: var(--surface-raised-base);
  --color-surface-weak: var(--surface-weak);
  --color-surface-weaker: var(--surface-weaker);
  --color-syntax-comment: var(--syntax-comment);
  --color-syntax-constant: var(--syntax-constant);
  --color-syntax-critical: var(--syntax-critical);
  --color-syntax-info: var(--syntax-info);
  --color-syntax-keyword: var(--syntax-keyword);
  --color-syntax-object: var(--syntax-object);
  --color-syntax-operator: var(--syntax-operator);
  --color-syntax-primitive: var(--syntax-primitive);
  --color-syntax-property: var(--syntax-property);
  --color-syntax-punctuation: var(--syntax-punctuation);
  --color-syntax-regexp: var(--syntax-regexp);
  --color-syntax-string: var(--syntax-string);
  --color-syntax-success: var(--syntax-success);
  --color-syntax-type: var(--syntax-type);
  --color-syntax-unknown: var(--syntax-unknown);
  --color-syntax-variable: var(--syntax-variable);
  --color-syntax-warning: var(--syntax-warning);
  --color-text-base: var(--text-base);
  --color-text-interactive-base: var(--text-interactive-base);
  --color-text-strong: var(--text-strong);
  --color-text-stronger: var(--text-stronger);
  --color-text-weak: var(--text-weak);
  --color-text-weaker: var(--text-weaker);
}

[data-markdown-bench-theme-scope="${safeScopeID}"],
[data-markdown-bench-theme-scope="${safeScopeID}"] .mdxeditor,
[data-markdown-bench-theme-scope="${safeScopeID}"] [contenteditable] {
  background: var(--background-base) !important;
  color: var(--text-base) !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"] .cm-editor,
[data-markdown-bench-theme-scope="${safeScopeID}"] .cm-gutters {
  background: var(--background-stronger) !important;
}${printCss}`
}

function buildMarkdownBenchPrintThemeCss(safeScopeID: string): string {
  return `[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"],
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] .mdxeditor,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [contenteditable] {
  background: ${MARKDOWN_PDF_PRINT_PALETTE.page} !important;
  color: ${MARKDOWN_PDF_PRINT_PALETTE.text} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [contenteditable] {
  font-size: ${MARKDOWN_PDF_PRINT_TYPE.bodyFontSize} !important;
  line-height: ${MARKDOWN_PDF_PRINT_TYPE.bodyLineHeight} !important;
  letter-spacing: 0 !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [contenteditable] * {
  letter-spacing: 0 !important;
  text-shadow: none !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] p,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] li,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] dd,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] dt,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] figcaption {
  color: ${MARKDOWN_PDF_PRINT_PALETTE.text} !important;
  font-size: inherit !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] p {
  margin: ${MARKDOWN_PDF_PRINT_TYPE.paragraphMarginBlock} !important;
  line-height: ${MARKDOWN_PDF_PRINT_TYPE.bodyLineHeight} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] ul,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] ol {
  margin: ${MARKDOWN_PDF_PRINT_TYPE.listMarginBlock} !important;
  padding-left: 1.45em !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] li {
  margin: ${MARKDOWN_PDF_PRINT_TYPE.listItemMarginBlock} !important;
  padding-left: 0.15em !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h1,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h2,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h3,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h4,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h5,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h6 {
  color: ${MARKDOWN_PDF_PRINT_PALETTE.text} !important;
  font-weight: ${MARKDOWN_PDF_PRINT_TYPE.headingFontWeight} !important;
  letter-spacing: 0 !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h1 {
  margin: ${MARKDOWN_PDF_PRINT_TYPE.heading1MarginBlock} !important;
  font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading1FontSize} !important;
  line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading1LineHeight} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h2 {
  margin: ${MARKDOWN_PDF_PRINT_TYPE.heading2MarginBlock} !important;
  font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading2FontSize} !important;
  line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading2LineHeight} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h3 {
  margin: ${MARKDOWN_PDF_PRINT_TYPE.heading3MarginBlock} !important;
  font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading3FontSize} !important;
  line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading3LineHeight} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h4 {
  margin: ${MARKDOWN_PDF_PRINT_TYPE.heading4MarginBlock} !important;
  font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading4FontSize} !important;
  line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading4LineHeight} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h5 {
  margin: ${MARKDOWN_PDF_PRINT_TYPE.heading5MarginBlock} !important;
  font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading5FontSize} !important;
  line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading5LineHeight} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] h6 {
  margin: ${MARKDOWN_PDF_PRINT_TYPE.heading6MarginBlock} !important;
  color: ${MARKDOWN_PDF_PRINT_PALETTE.textWeak} !important;
  font-size: ${MARKDOWN_PDF_PRINT_TYPE.heading6FontSize} !important;
  line-height: ${MARKDOWN_PDF_PRINT_TYPE.heading6LineHeight} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] strong,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] b {
  color: ${MARKDOWN_PDF_PRINT_PALETTE.text} !important;
  font-size: inherit !important;
  font-weight: ${MARKDOWN_PDF_PRINT_TYPE.strongFontWeight} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] code {
  background: transparent !important;
  color: ${MARKDOWN_PDF_PRINT_PALETTE.code} !important;
  font-size: ${MARKDOWN_PDF_PRINT_TYPE.inlineCodeFontSize} !important;
  line-height: inherit !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] :not(pre) > code {
  border: 1px solid ${MARKDOWN_PDF_PRINT_PALETTE.borderWeak} !important;
  border-radius: 4px !important;
  background: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeaker} !important;
  padding: 0.05em 0.25em !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [class*="_codeMirrorWrapper_"] {
  margin: 0.85em 0 1.1em !important;
  border: 1px solid ${MARKDOWN_PDF_PRINT_PALETTE.borderWeak} !important;
  border-radius: 6px !important;
  background: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak} !important;
  padding: 0 !important;
  overflow: visible !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [class*="_codeMirrorToolbar_"],
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [class*="_tableColumnEditorPopoverContent_"],
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] select,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] dialog {
  display: none !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [class*="_tableColumnEditorTrigger_"],
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [class*="_tableRowEditorTrigger_"],
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [class*="_addRowButton_"],
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [class*="_addColumnButton_"],
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [class*="_iconButton_"] {
  visibility: hidden !important;
  pointer-events: none !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] .cm-editor {
  border: 0 !important;
  background: transparent !important;
  color: ${MARKDOWN_PDF_PRINT_PALETTE.text} !important;
  padding: 0 !important;
  box-shadow: none !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] .cm-content {
  padding: 0.75em 0.9em !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] .cm-content,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] .cm-scroller,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] .cm-line {
  background: transparent !important;
  color: ${MARKDOWN_PDF_PRINT_PALETTE.text} !important;
  font-size: ${MARKDOWN_PDF_PRINT_TYPE.codeFontSize} !important;
  line-height: ${MARKDOWN_PDF_PRINT_TYPE.codeLineHeight} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] .cm-gutters {
  display: none !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] table {
  display: table !important;
  width: 100% !important;
  border-collapse: collapse !important;
  border-spacing: 0 !important;
  margin: 0.85em 0 1.1em !important;
  overflow: visible !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] thead {
  display: table-header-group !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] tr {
  break-inside: avoid;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] th,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] td {
  border: 1px solid ${MARKDOWN_PDF_PRINT_PALETTE.border} !important;
  background: transparent !important;
  color: ${MARKDOWN_PDF_PRINT_PALETTE.text} !important;
  padding: 0.4em 0.55em !important;
  vertical-align: top !important;
  white-space: normal !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] th {
  background: ${MARKDOWN_PDF_PRINT_PALETTE.surfaceWeak} !important;
  font-weight: ${MARKDOWN_PDF_PRINT_TYPE.strongFontWeight} !important;
  text-align: left !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] td p,
[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] th p {
  margin: 0 !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [data-active="true"] {
  outline: none !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [data-component="markdown-bench-mermaid"] {
  break-inside: avoid;
  margin: 0.85em 0 1.1em !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [data-component="markdown-bench-mermaid"] > div {
  border: 1px solid ${MARKDOWN_PDF_PRINT_PALETTE.borderWeak} !important;
  background: ${MARKDOWN_PDF_PRINT_PALETTE.page} !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [data-component="mermaid-diagram-inline-viewport"] {
  height: auto !important;
  min-height: 0 !important;
  overflow: visible !important;
  cursor: default !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [data-component="mermaid-diagram-inline-viewport"] > div {
  width: 100% !important;
  height: auto !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [data-component="mermaid-diagram-static-viewport"] {
  width: 100% !important;
  overflow: visible !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [data-component="mermaid-diagram"] {
  position: static !important;
  display: block !important;
  width: 100% !important;
  height: auto !important;
  padding: 0 !important;
  opacity: 1 !important;
}

[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"] [data-component="mermaid-diagram"] svg {
  display: block !important;
  max-width: 100% !important;
  height: auto !important;
}`
}
