import { Z_INDEX } from "@buddy/ui"
import { markdownClassName } from "@/components/markdown/markdown-html-segment"

export const MDX_EDITOR_THEME_CLASS_NAME = [
  "![--accentBase:var(--surface-interactive-weak)]",
  "![--accentBgSubtle:var(--surface-interactive-weak)]",
  "![--accentBg:var(--surface-interactive-base)]",
  "![--accentBgHover:var(--surface-interactive-base-hover)]",
  "![--accentBgActive:var(--surface-interactive-hover)]",
  "![--accentLine:var(--border-interactive-base)]",
  "![--accentBorder:var(--border-interactive-base)]",
  "![--accentBorderHover:var(--border-interactive-hover)]",
  "![--accentSolid:var(--button-primary-base)]",
  "![--accentSolidHover:var(--button-primary-hover)]",
  "![--accentText:var(--text-interactive-base)]",
  "![--accentTextContrast:var(--text-strong)]",
  "![--basePageBg:var(--background-base)]",
  "![--baseBase:var(--background-base)]",
  "![--baseBgSubtle:var(--surface-inset-base)]",
  "![--baseBg:var(--surface-base)]",
  "![--baseBgHover:var(--surface-base-hover)]",
  "![--baseBgActive:var(--surface-raised-base)]",
  "![--baseLine:var(--border-weaker-base)]",
  "![--baseBorder:var(--border-base)]",
  "![--baseBorderHover:var(--border-hover)]",
  "![--baseSolid:var(--icon-weak)]",
  "![--baseSolidHover:var(--icon-base)]",
  "![--baseText:var(--text-weak)]",
  "![--baseTextContrast:var(--text-strong)]",
  "![--color-text-base:var(--markdown-text)]",
  "![--color-text-strong:var(--markdown-heading)]",
  "![--color-text-weak:var(--markdown-block-quote)]",
  "![--color-text-weaker:var(--text-weaker)]",
  "![--color-text-interactive-base:var(--markdown-link-text)]",
  "![--color-syntax-string:var(--markdown-code)]",
  "![--error-color:var(--text-critical-base)]",
  "![--font-body:var(--font-sans)]",
  "![--font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace]",
  "[&_.cm-editor]:!bg-background-stronger [&_.cm-editor]:!text-text-base",
  "[&_.cm-gutters]:!border-border-weaker-base [&_.cm-gutters]:!bg-background-stronger",
].join(" ")

export const MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME = "markdown-bench-mdx-editor"
const MARKDOWN_BENCH_MDX_POPUP_Z_INDEX = Z_INDEX.floating
/** Overlay and content share the modal layer; see `Z_INDEX.modal`. */
const MARKDOWN_BENCH_MDX_DIALOG_Z_INDEX = Z_INDEX.modal
export const MARKDOWN_BENCH_MDX_POPUP_LAYER_CSS = `
.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME}.mdxeditor-popup-container {
  z-index: ${MARKDOWN_BENCH_MDX_POPUP_Z_INDEX};
}

.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME}.mdxeditor-popup-container [class*="_dialogOverlay_"],
.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME}.mdxeditor-popup-container [role="dialog"] {
  z-index: ${MARKDOWN_BENCH_MDX_DIALOG_Z_INDEX};
}

.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME} [class*="_codeMirrorWrapper_"] {
  margin-block: 0.75em 1em;
  padding: 0;
  background: var(--background-stronger);
}

.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME} [class*="_codeMirrorToolbar_"] {
  position: static;
  box-sizing: border-box;
  width: 100%;
  min-height: 1.75rem;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.25rem 0 0.5rem;
  border-bottom: 1px solid var(--border-weaker-base);
  border-radius: 0;
  background: transparent;
}

.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME} [class*="_codeMirrorToolbar_"] [class*="_selectTrigger_"] {
  width: auto;
  min-height: 1.5rem;
  margin: 0;
  padding: 0 0.125rem;
  background: transparent;
  color: var(--text-weaker);
  font-size: 0.6875rem;
  line-height: 1;
}

.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME} [class*="_codeMirrorToolbar_"] > button {
  display: inline-flex;
  width: 1.5rem;
  height: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-base);
  color: var(--icon-weak);
  cursor: pointer;
}

.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME} [class*="_codeMirrorToolbar_"] > button:disabled {
  cursor: default;
}

.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME} [class*="_codeMirrorToolbar_"] > button svg {
  width: 0.875rem;
  height: 0.875rem;
}

.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME} [class*="_codeMirrorWrapper_"] .cm-editor {
  padding: 0;
}

@media (hover: hover) and (pointer: fine) {
  .${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME} [class*="_codeMirrorToolbar_"] > button {
    opacity: 0;
  }

  .${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME} [class*="_codeMirrorWrapper_"]:hover [class*="_codeMirrorToolbar_"] > button,
  .${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME} [class*="_codeMirrorWrapper_"]:focus-within [class*="_codeMirrorToolbar_"] > button {
    opacity: 1;
  }
}
`

export const MARKDOWN_CONTENT_BASE_CLASS_NAME = [
  markdownClassName,
  "focus:outline-none",
  // MDXEditor uses --text-base for font sizing, which shadows Buddy's color token alias.
  "![color:var(--markdown-text)]",
  "![font-size:calc(var(--buddy-font-size-base)*var(--markdown-bench-document-font-scale))]",
  "![line-height:1.5]",
  // Match Obsidian's base editor metrics while leaving Buddy's theme colors untouched.
  "[&_h1]:!text-[1.618em] [&_h1]:![font-weight:700] [&_h1]:!leading-[1.2] [&_h1]:!tracking-[-0.015em]",
  "[&_h2]:!text-[1.462em] [&_h2]:![font-weight:680] [&_h2]:!leading-[1.2] [&_h2]:!tracking-[-0.011em]",
  "[&_h3]:!text-[1.318em] [&_h3]:![font-weight:660] [&_h3]:!leading-[1.3] [&_h3]:!tracking-[-0.008em]",
  "[&_h4]:!text-[1.188em] [&_h4]:![font-weight:640] [&_h4]:!leading-[1.4] [&_h4]:!tracking-[-0.005em]",
  "[&_h5]:!text-[1.076em] [&_h5]:![font-weight:620] [&_h5]:!leading-[1.5] [&_h5]:!tracking-[-0.002em]",
  "[&_h6]:!text-[1em] [&_h6]:![font-weight:600] [&_h6]:!leading-[1.5] [&_h6]:!tracking-[0em]",
  // Lexical can apply its code-format class to nested strong/em nodes inside semantic <code>.
  "[&_code]:!bg-transparent [&_code]:!p-0 [&_code]:!text-[var(--color-syntax-string)]",
  "[&_code_*]:!bg-transparent [&_code_*]:!p-0 [&_code_*]:!text-inherit",
].join(" ")

export const MARKDOWN_CONTENT_PAPER_LAYOUT_CLASS_NAME =
  "min-h-[calc(100vh-12rem)] !px-0 !pt-0 !pb-[clamp(0px,calc((100%_-_28rem)/4),3rem)]"

export const MARKDOWN_CONTENT_PLAIN_LAYOUT_CLASS_NAME = "min-h-full !px-0 !pt-0 !pb-3"

export const MARKDOWN_DOCUMENT_PAPER_INSET_CLASS_NAME =
  "px-[clamp(0px,calc((100%_-_28rem)/6),2rem)]"

export const MARKDOWN_DOCUMENT_PLAIN_INSET_CLASS_NAME = "px-4"

export const MARKDOWN_NOTE_TITLE_BASE_CLASS_NAME =
  "mb-[0.5em] whitespace-pre-wrap [font-size:calc(var(--buddy-font-size-base)*1.618*var(--markdown-bench-document-font-scale))] [font-weight:700] leading-[1.2] tracking-[-0.015em]"

export const MARKDOWN_NOTE_TITLE_PAPER_LAYOUT_CLASS_NAME =
  "pt-[clamp(0px,calc((100%_-_28rem)/4),3rem)]"

export const MARKDOWN_NOTE_TITLE_PLAIN_LAYOUT_CLASS_NAME = "pt-3"

export const MARKDOWN_NOTE_TITLE_INPUT_CLASS_NAME =
  "block w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-inherit outline-none [font:inherit] [letter-spacing:inherit]"

export const MARKDOWN_BENCH_PAPER_CARD_CLASS_NAME =
  "mx-auto w-full max-w-3xl min-h-full overflow-hidden rounded-lg border border-border-weak-base bg-background-base shadow-sm"

export const MARKDOWN_BENCH_PAPER_PLAIN_CLASS_NAME = "w-full min-h-full bg-background-base"

export const MARKDOWN_BENCH_SELECTION_EDGE_WIDTH_PX = 3
export const MARKDOWN_BENCH_DOCUMENT_GUTTER_CLASS =
  "px-[clamp(0px,calc((100%_-_28rem)/8),1.5rem)] pt-[clamp(0px,calc((100%_-_28rem)/8),1.5rem)]"
