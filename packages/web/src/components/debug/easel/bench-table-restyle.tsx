import { useState } from "react"
import { Switch } from "@buddy/ui"
import { MarkdownBenchEditor } from "@/components/bench/markdown/editor"

/**
 * Easel · Bench table restyle
 *
 * SHIPPED — B · Ruled landed as MARKDOWN_BENCH_TABLE_CSS in
 * components/bench/markdown/editor-styles.ts. Every panel below now renders on
 * top of it, so "Current" no longer shows MDXEditor's default and the other
 * proposals no longer render faithfully. Kept as the record of the diagnosis.
 *
 * DIAGNOSIS — the Bench table is MDXEditor's stock table editor. Buddy's only
 * on-screen table rules are the prose wrapper's `[&_table]:block …` overflow
 * classes (markdown-html-segment.tsx) and Tailwind Typography's `prose` rules
 * underneath; MDX_EDITOR_THEME_CLASS_NAME only remaps the colour variables
 * MDXEditor reads. Everything else is @mdxeditor/editor's dist/style.css
 * (`._tableEditor_*`) and plugins/table/TableEditor.js.
 *
 * What that editor draws in edit mode, for a table of C columns and R rows:
 *   - a tool row above the header: a "Column menu" (⋯) per column + "Delete table"
 *   - a 2rem gutter left of every row holding a "Row menu" (⋯)
 *   - a full-height "add column" strip on the right, a full-width "add row" strip below
 *   - a 1px box around every cell
 * All of it stays on screen at 15% opacity (30% while the table is hovered), so
 * the 3 × 4 sample below carries C + R + 3 = 10 permanent glyphs, and the gutter
 * pushes the table's text off the paragraph edge.
 *
 * Every panel is the real MarkdownBenchEditor. The three proposals are CSS-only
 * overrides of MDXEditor's own table classes, so nothing forks the table plugin
 * and the chosen one can move into MARKDOWN_BENCH_MDX_POPUP_LAYER_CSS as-is.
 */

// ── Sample ────────────────────────────────────────────────────────────────

const SAMPLE_MARKDOWN = [
  "Cells hold ordinary inline markdown. A table should sit in the same text column as this paragraph.",
  "",
  "| Process | What moves | Needs energy? |",
  "| --- | --- | --- |",
  "| Diffusion | Particles, from high to low concentration | No |",
  "| Osmosis | Water, across a semi-permeable membrane | No |",
  "| Active transport | Ions, against the concentration gradient | Yes, ATP |",
  "",
  "A paragraph after the table, to judge the spacing below it.",
  "",
].join("\n")

// ── MDXEditor's table DOM ─────────────────────────────────────────────────

/**
 * MDXEditor's CSS-module class names carry a build hash, so they are matched
 * by substring — the same approach markdown-print-theme.ts takes for print.
 * Every body row starts with a tool cell (row menu); the first row also ends
 * with one (add column). The header row is `tbody > tr:first-child`.
 */
const TABLE = '[class*="_tableEditor_"]'
const TOOL_CELL = '[data-tool-cell="true"]'
const CELL = `:not(${TOOL_CELL})`
const TRIGGER = '[class*="_tableColumnEditorTrigger_"]'
const ADD_ROW = '[class*="_addRowButton_"]'
const ADD_COLUMN = '[class*="_addColumnButton_"]'
const DELETE_TABLE = '[class*="_iconButton_"]'
const ADDERS = `:is(${ADD_ROW}, ${ADD_COLUMN})`
const CONTROL = `:is(${TRIGGER}, ${ADD_ROW}, ${ADD_COLUMN}, ${DELETE_TABLE})`
/** First and last content cell of a body row, skipping the tool cells either side. */
const FIRST_CELL = `> ${TOOL_CELL} + ${CELL}`
const LAST_CELL = `> ${CELL}:is(:last-child, :has(+ ${TOOL_CELL}))`
/** Height of the control rows above and below the table: a 16px glyph in 2px padding. */
const CONTROL_ROW = "20px"

type TableVariantID = "current" | "calm-grid" | "ruled" | "framed"

type TableVariant = {
  id: TableVariantID
  label: string
  summary: string
  css: string
}

function scopeOf(id: TableVariantID) {
  return `[data-easel-table="${id}"]`
}

/** Pointer over the table, caret inside it, or the page's "show hover state" switch. */
function revealedTable(id: TableVariantID) {
  const scope = scopeOf(id)
  return `:is(${scope}[data-reveal="true"] ${TABLE}, ${scope} ${TABLE}:hover, ${scope} ${TABLE}:focus-within)`
}

/**
 * Shared by every proposal. MDXEditor's controls fight back with
 * `[data-active='true'] { opacity: 1 !important }` and a five-class hover
 * selector, hence the !important on opacity.
 */
function quietBaseCss(id: TableVariantID) {
  const table = `${scopeOf(id)} ${TABLE}`
  return `
/*
 * The column-menu row above the header and the add-row strip below the last row
 * are invisible at rest but still take height. Both are pinned to CONTROL_ROW and
 * the table is pulled into them, so the visible rows sit where a paragraph would
 * and the neighbouring blocks' margins set the gap. Replaces prose's 2em margin.
 */
${table} {
  margin-block: -${CONTROL_ROW} !important;
}
${table} > thead,
${table} > thead > tr > th,
${table} > tfoot > tr > th {
  border: 0 !important;
  padding: 0 !important;
}
/* Prose rules the top of tfoot; under the handle gutter and the add-column strip no cell border covers it. */
${table} > tbody > tr,
${table} > tfoot {
  border: 0 !important;
}
${table} > tbody > tr:first-child > ${CELL} {
  font-weight: 600;
}
${table} ${CONTROL} {
  padding: 2px !important;
  opacity: 0 !important;
  transition: opacity 120ms ease;
}
${table} :is(${TRIGGER}, ${DELETE_TABLE}) {
  display: block;
}
${table} > thead :is(${TRIGGER}, ${DELETE_TABLE}) {
  margin-left: auto;
}
${table} ${CONTROL} svg {
  display: block;
  width: 16px;
  height: 16px;
}
${table} ${ADDERS} {
  justify-content: center;
  border-radius: var(--radius-base);
  background: transparent !important;
  color: var(--icon-weak) !important;
}
${table} ${ADDERS}:hover {
  background: var(--surface-base-hover) !important;
  color: var(--icon-base) !important;
}
`
}

// ── A · Calm grid ─────────────────────────────────────────────────────────

function calmGridCss(id: TableVariantID) {
  const table = `${scopeOf(id)} ${TABLE}`
  const revealed = revealedTable(id)
  return `${quietBaseCss(id)}
${table} > tbody > tr > ${CELL} {
  border: 1px solid var(--border-weak-base) !important;
  padding: 0.4em 0.65em !important;
}
${table} > tbody > tr:first-child > ${CELL} {
  background: var(--surface-weak);
}
${table} > tbody > tr > [data-active="true"] {
  outline: 1px solid var(--border-interactive-base) !important;
  outline-offset: -1px;
}
${revealed} ${CONTROL} {
  opacity: 0.5 !important;
}
${revealed} ${CONTROL}:hover,
${revealed} ${TRIGGER}[data-active="true"] {
  opacity: 1 !important;
}
`
}

// ── B · Ruled ─────────────────────────────────────────────────────────────

function ruledCss(id: TableVariantID) {
  const table = `${scopeOf(id)} ${TABLE}`
  const revealed = revealedTable(id)
  /** How far the rules run past the text on either side. */
  const bleed = "0.75rem"
  return `${quietBaseCss(id)}
${table} {
  width: calc(100% + 1.5rem + ${bleed} * 2) !important;
  max-width: none !important;
  margin-left: calc(-1.5rem - ${bleed}) !important;
}
${table} :is([class*="_tableToolsColumn_"], [class*="_toolCell_"]) {
  width: 1.5rem !important;
  padding: 0 !important;
  border: 0 !important;
}
${table} > tbody > tr > ${CELL} {
  border: 0 !important;
  border-bottom: 1px solid var(--border-weaker-base) !important;
  padding: 0.5em 1.25em 0.5em 0 !important;
}
${table} > tbody > tr ${FIRST_CELL} {
  padding-left: ${bleed} !important;
}
${table} > tbody > tr ${LAST_CELL} {
  padding-right: ${bleed} !important;
}
${table} > tbody > tr:first-child > ${CELL} {
  border-bottom-color: var(--border-base) !important;
}
${table} > tbody > tr:last-child > ${CELL} {
  border-bottom-color: transparent !important;
}
${table} > tbody > tr > [data-active="true"] {
  outline: none !important;
  box-shadow: inset 0 -2px 0 var(--border-interactive-base);
}
${revealed} :is(${ADD_ROW}, ${ADD_COLUMN}, ${DELETE_TABLE}) {
  opacity: 0.5 !important;
}
${revealed} :is(${ADD_ROW}, ${ADD_COLUMN}, ${DELETE_TABLE}):hover,
${table} ${TRIGGER}[data-active="true"] {
  opacity: 1 !important;
}
`
}

// ── C · Framed ────────────────────────────────────────────────────────────

function framedCss(id: TableVariantID) {
  const table = `${scopeOf(id)} ${TABLE}`
  const revealed = revealedTable(id)
  const row = `${table} > tbody > tr`
  const frame = "1px solid var(--border-weak-base)"
  return `${quietBaseCss(id)}
${table} {
  border-collapse: separate !important;
  border-spacing: 0 !important;
  margin-bottom: calc(-1.5rem - 0.375rem) !important;
}
${row} > ${CELL} {
  border: 0 !important;
  border-top: 1px solid var(--border-weaker-base) !important;
  padding: 0.5em 0.75em !important;
}
${row}:first-child > ${CELL} {
  border-top: ${frame} !important;
  background: var(--surface-weak);
}
${row}:last-child > ${CELL} {
  border-bottom: ${frame} !important;
}
${row} ${FIRST_CELL} {
  border-left: ${frame} !important;
}
${row} ${LAST_CELL} {
  border-right: ${frame} !important;
}
${row}:first-child ${FIRST_CELL} {
  border-top-left-radius: 8px;
}
${row}:first-child ${LAST_CELL} {
  border-top-right-radius: 8px;
}
${row}:last-child ${FIRST_CELL} {
  border-bottom-left-radius: 8px;
}
${row}:last-child ${LAST_CELL} {
  border-bottom-right-radius: 8px;
}
${row} > [data-active="true"] {
  outline: none !important;
  box-shadow: inset 0 0 0 1.5px var(--border-interactive-base);
}
${table} ${ADDERS} {
  width: 1.5rem !important;
  height: 1.5rem !important;
  padding: 0 !important;
  border-radius: 9999px !important;
}
${table} ${ADD_ROW} {
  margin: 0.375rem 0 0 !important;
}
${table} ${ADD_COLUMN} {
  margin: 0 0 0 0.375rem !important;
}
${revealed} ${ADDERS},
${table} ${TRIGGER}[data-active="true"] {
  opacity: 1 !important;
}
${revealed} ${DELETE_TABLE} {
  opacity: 0.5 !important;
}
${revealed} ${DELETE_TABLE}:hover {
  opacity: 1 !important;
}
`
}

// ── Variants ──────────────────────────────────────────────────────────────

const TABLE_VARIANTS: TableVariant[] = [
  {
    id: "current",
    label: "Current · MDXEditor default",
    summary:
      "Ten control glyphs for this 3 × 4 table stay on screen at 15% opacity, every cell is boxed, and a 2rem handle gutter pushes the table off the text edge.",
    css: "",
  },
  {
    id: "calm-grid",
    label: "A · Calm grid",
    summary:
      "Smallest step. Keeps the boxed grid and every control, but the controls are invisible until the pointer or caret is in the table. Softer borders, filled header row.",
    css: calmGridCss("calm-grid"),
  },
  {
    id: "ruled",
    label: "B · Ruled",
    summary:
      "Reads like the page around it. Horizontal rules only, running slightly past the text; the handle gutter hangs in the margin so cell text lines up with paragraphs, and only the row and column under the pointer get a handle.",
    css: ruledCss("ruled"),
  },
  {
    id: "framed",
    label: "C · Framed",
    summary:
      "One quiet object. A rounded frame with a header band and row dividers, no inner verticals. Adding a row or column becomes two small + buttons that appear on hover.",
    css: framedCss("framed"),
  },
]

/** The note title is not part of the comparison; the inset leaves room for Ruled's hanging gutter. */
const PANEL_CSS = `
[data-easel-table] [data-component="markdown-bench-note-title"] {
  display: none;
}
[data-easel-table] [data-component="markdown-bench-document-content"] {
  padding: 0.75rem 2.5rem 0;
}
`

const EASEL_TABLE_CSS = [PANEL_CSS, ...TABLE_VARIANTS.map((variant) => variant.css)].join("\n")

// ── Page ──────────────────────────────────────────────────────────────────

function TableVariantPanel(props: {
  variant: TableVariant
  directory: string
  revealControls: boolean
}) {
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN)

  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="text-sm font-medium text-text-strong">{props.variant.label}</h3>
      <p className="text-xs leading-relaxed text-text-weak">{props.variant.summary}</p>
      <div
        data-easel-table={props.variant.id}
        data-reveal={props.revealControls ? "true" : undefined}
        className="mt-2 border-t border-border-weaker-base"
      >
        <MarkdownBenchEditor
          appearance="plain"
          markdown={markdown}
          version="easel"
          dirty={false}
          saving={false}
          conflict={false}
          directory={props.directory}
          documentFormat="markdown"
          path={`bench-table-${props.variant.id}.md`}
          onChange={setMarkdown}
        />
      </div>
    </section>
  )
}

export function BenchTableRestyleEasel(props: { directory?: string }) {
  const [revealControls, setRevealControls] = useState(false)

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-background-base">
      <style>{EASEL_TABLE_CSS}</style>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-weak-base px-6 py-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-strong">
            Bench tables · MDXEditor default vs three restyles
          </p>
          <p className="text-xs text-text-weak">
            Shipped: B · Ruled is now the Bench table style, so every panel renders on top of it and
            this page no longer shows the original comparison.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="easel-bench-table-reveal"
            size="sm"
            checked={revealControls}
            aria-label="Show every table as if the pointer were over it"
            onCheckedChange={setRevealControls}
          />
          <label htmlFor="easel-bench-table-reveal" className="text-xs text-text-weak">
            Show hover state
          </label>
        </div>
      </header>
      <div className="grid gap-x-10 gap-y-10 px-6 py-6 xl:grid-cols-2">
        {TABLE_VARIANTS.map((variant) => (
          <TableVariantPanel
            key={variant.id}
            variant={variant}
            directory={props.directory ?? ""}
            revealControls={revealControls}
          />
        ))}
      </div>
    </div>
  )
}
