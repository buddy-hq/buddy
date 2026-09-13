import type { DesktopTheme, ResolvedTheme } from "@/theme/types"
import { resolveThemeVariant, themeToCss } from "@/theme/resolve"
import {
  createMermaidThemeConfig,
  type MermaidThemeConfig,
} from "@/components/media/renderers/mermaid/lib/theme"
import {
  buildMarkdownPrintContentCss,
  buildMarkdownPrintCssVariables,
  MARKDOWN_PRINT_PALETTE,
} from "@/lib/markdown-print-theme"

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
    backgroundBase: MARKDOWN_PRINT_PALETTE.page,
    borderBase: MARKDOWN_PRINT_PALETTE.border,
    surfaceBase: MARKDOWN_PRINT_PALETTE.page,
    surfaceRaisedBase: MARKDOWN_PRINT_PALETTE.surfaceWeak,
    surfaceWeak: MARKDOWN_PRINT_PALETTE.surfaceWeaker,
    textBase: MARKDOWN_PRINT_PALETTE.text,
    textInteractiveBase: MARKDOWN_PRINT_PALETTE.link,
    textInvertBase: MARKDOWN_PRINT_PALETTE.page,
    textStrong: MARKDOWN_PRINT_PALETTE.textStrong,
    textWeak: MARKDOWN_PRINT_PALETTE.textWeak,
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
      variables: buildMarkdownPrintCssVariables(),
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
  const themeVariables =
    input.theme.mode === "print" ? buildMarkdownPrintCssVariables() : input.theme.variables
  const printCss =
    input.theme.mode === "print" ? `\n\n${buildMarkdownBenchPrintThemeCss(safeScopeID)}` : ""
  return `[data-markdown-bench-theme-scope="${safeScopeID}"] {
  color-scheme: ${colorScheme};
  --markdown-bench-document-font-scale: ${contentFontScale};
  --text-mix-blend-mode: ${colorScheme === "dark" ? "plus-lighter" : "multiply"};
  ${themeVariables}
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
  return buildMarkdownPrintContentCss({
    hideNativeControls: false,
    includeRootReset: false,
    rootSelector: `[data-markdown-bench-theme-scope="${safeScopeID}"][data-content-theme="print"]`,
  })
}
