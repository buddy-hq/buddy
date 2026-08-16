import { useState, type ReactNode } from "react"
import {
  Badge,
  Button,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from "@buddy/ui"
import {
  ALargeSmall as ALargeSmallIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  EllipsisIcon,
  FileTextIcon,
  FitToScreenIcon,
  IdeaIcon,
  KeyRound,
  Loader2Icon,
  MapIcon,
  MinusIcon,
  PencilLineIcon,
  PlusIcon,
  Redo2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  SearchIcon,
  TableOfContents as TableOfContentsIcon,
  Trash2Icon,
  TriangleAlertIcon,
  Undo2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/icons/app-icons"

/**
 * Easel · Reader chrome — EPUB and PDF, made one thing
 *
 * The two readers were built to the same brief and drifted. They now disagree
 * about borders, about where a control lives, about how deep it is buried, and
 * about what the same word means. This easel puts each engine under the
 * proposal so the disagreement is visible in one glance instead of by opening
 * two files.
 *
 * One design, two fills. The rules it holds to:
 *
 *   1 · The top band carries ACTIONS ONLY. Nothing that is merely a readout
 *       goes up there.
 *   2 · The bottom band carries INFORMATION ONLY — chapter and position, set
 *       small and quiet. No action ever lands in it.
 *   3 · One frequency ranking drives depth. A control adjusted every few
 *       minutes is one click away; a control set once in a document's life is
 *       inside View; nothing is in two places.
 *   4 · Scale is NOT one control. Text size reflows and belongs to type, so it
 *       lives inside View with A− / A+ (macOS Books). Zoom rasterises and
 *       belongs to the page, so it stays in the bar as − / + (macOS Preview).
 *       An EPUB never zooms; a PDF never resizes text.
 *   5 · Focus is a button in the bar, not a separate design. Press it and every
 *       band leaves; one control stays behind to bring them back.
 *   6 · One scroll container per reading surface, and the reader's stylesheet
 *       is scoped to the reader.
 *
 * Directions: Original (as shipped, pinned) · Proposed (the one design).
 */

// ── Domain ────────────────────────────────────────────────────────────────

type ReaderEngine = "epub" | "pdf"
type Direction = "original" | "proposed"
type FrameWidth = "fill" | "docked" | "wide"

const DIRECTIONS: Array<{ id: Direction; label: string; tagline: string }> = [
  {
    id: "original",
    label: "Original",
    tagline: "As shipped · both engines, with the defects pinned",
  },
  {
    id: "proposed",
    label: "Proposed",
    tagline:
      "One design. Actions on top, information at the bottom, Focus in the bar — and scale means what the engine means by it.",
  },
]

/**
 * Fill is for judging the design; Docked and Wide are for judging whether it
 * survives. 480 is roughly the width a Bench pane actually gets beside a chat
 * column, and any control that cannot hold its shape there is wrong — so the
 * fixed widths are a test to run, not the way to read the mock.
 */
const FRAME_WIDTH_PX = { docked: 480, wide: 900 } satisfies Record<Exclude<FrameWidth, "fill">, number>
const FRAME_WIDTH_LABEL = {
  fill: "fill",
  docked: "480px · Bench docked",
  wide: "900px",
} satisfies Record<FrameWidth, string>
const FRAME_HEIGHT = "min(74vh, 860px)"

/**
 * Whether the reading surface has a scrollbar of its own. This is the input to
 * one rule: a scrolled surface already draws position down its right edge, so
 * a progress rail there is a second object moving in lockstep with the first,
 * saying the same thing. The rail exists only where the scrollbar does not.
 *
 * The same word means a different mode in each engine, which is why the badge
 * on each frame names the engine's own mode rather than this one.
 */
type SurfaceFlow = "paged" | "scrolled"

const FLOW_LABEL = {
  epub: { paged: "paginated flow", scrolled: "scrolled flow" },
  pdf: { paged: "single page", scrolled: "continuous" },
} satisfies Record<ReaderEngine, Record<SurfaceFlow, string>>

/** One engine at a time by default; Both is there to check them against each other. */
type EngineView = ReaderEngine | "both"

const ENGINE_VIEWS: Array<{ id: EngineView; label: string }> = [
  { id: "epub", label: "EPUB" },
  { id: "pdf", label: "PDF" },
  { id: "both", label: "Both" },
]

const ENGINE_LABEL = {
  epub: "EPUB · foliate-js",
  pdf: "PDF · pdf.js",
} satisfies Record<ReaderEngine, string>

/** Real-ish content so truncation and collision are testable, not theoretical. */
const DOCUMENT = {
  epub: {
    title: "The History of Western Education",
    section: "4 · The Renaissance Schoolmasters",
    position: "32%",
  },
  pdf: {
    title: "Cognitive Load Theory and Instructional Design",
    section: "3 · Worked Example Effect",
    position: "Page 84 of 324",
  },
} as const satisfies Record<ReaderEngine, Record<string, string>>

/**
 * The paper each engine actually renders on, and the ink on it. The progress
 * rail is drawn from these — see ProgressRail — because it sits against the
 * page, not against the app palette. EPUB's paper comes from READER_THEMES and
 * is a fixed cream regardless of app mode; the PDF viewer's surround is an app
 * token and flips with it, which is exactly why one hardcoded accent could not
 * stay legible on both.
 */
const READER_PAPER = {
  epub: { background: "#faf7f0", ink: "#2b2723" },
  pdf: { background: "var(--surface-inset-base)", ink: "var(--text-base)" },
} satisfies Record<ReaderEngine, { background: string; ink: string }>

const PROSE = [
  "The schoolmasters of the fifteenth century inherited a curriculum they did not choose and could not easily refuse. Grammar came first, because grammar was the gate; and behind the gate stood rhetoric, and behind rhetoric, dialectic.",
  "What changed was not the list but the reason given for it. A century earlier the trivium was defended as preparation for divinity. Now it was defended as preparation for public life — for the letter, the embassy, the council chamber.",
  "This is the quiet revolution of humanist teaching, and it is easy to miss because the reading lists look so similar on either side of it.",
]

// ── Pins ──────────────────────────────────────────────────────────────────

type Defect = {
  pin: number | null
  title: string
  where: string
  detail: string
}

/**
 * Every item was read out of the two files, not inferred. The pinned ones are
 * visible in the Original direction above; the rest are structural and only
 * show up in a diff.
 */
const DEFECTS: Defect[] = [
  {
    pin: 1,
    title: "Bookmark toggle exists twice",
    where: "foliate-reader.tsx:1368 · pdf-reader.tsx:1482 · reader-bookmarks-panel.tsx:67",
    detail:
      "A dedicated bar button toggles the bookmark, and the bookmarks popover header carries a second Add here / Remove button for the same action. Two affordances, one state.",
  },
  {
    pin: 2,
    title: "Layout / flow lives in the ⋯ menu AND in preferences",
    where:
      "foliate-reader.tsx:1401 + foliate-preferences-panel.tsx:71 · pdf-reader.tsx:1510 + pdf-reader.tsx:292",
    detail:
      "EPUB reading flow (Paginated / Section scroll) and PDF page layout (Continuous / Single / Two-up) are each authored twice, in two components, with two different control shapes — menu items with a check glyph in one, a segmented ToggleGroup in the other.",
  },
  {
    pin: 3,
    title: "PDF scale is in three places, EPUB text size in one — the buried one",
    where: "pdf-reader.tsx:1412 · pdf-reader.tsx:312 · foliate-preferences-panel.tsx:131",
    detail:
      "PDF: a − % + stepper in the bar, a Page scale segmented control in preferences, and a custom Zoom slider under it. EPUB: the same concept is a slider two clicks deep and nothing in the bar. Identical intent, opposite depth.",
  },
  {
    pin: 4,
    title: "The PDF title disappears at Bench width",
    where: "pdf-reader.tsx:1401 · foliate-reader.tsx:1323",
    detail:
      "PDF centres the title with `hidden … md:flex`, so in a docked Bench pane there is no title at all. EPUB keeps it and reserves px-48 against the buttons; PDF reserves px-72. Both are absolute overlays that can collide rather than a flex cell that truncates.",
  },
  {
    pin: 5,
    title: "Jump-to-location is two clicks behind ⋯, and the location is dead text",
    where: "foliate-reader.tsx:1396 · pdf-reader.tsx:1498",
    detail:
      'The footer prints exactly where you are and does nothing when clicked; to move you open ⋯ → "Location and jumps" / "Go to page" → dialog → type → Go. The thing you want to change is on screen and inert.',
  },
  {
    pin: 6,
    title: "Progress is stated twice, at two strengths",
    where: "foliate-reader.tsx:1276 + 1598 · pdf-reader.tsx:1367 + 1665",
    detail:
      "A hairline across the top of the header AND a scrubber in the footer. EPUB draws the hairline at /60 opacity, PDF at full. Two elements, one fact.",
  },
  {
    pin: 7,
    title: "Two different scrubbers",
    where: "foliate-reader.tsx:1598 · pdf-reader.tsx:1665",
    detail:
      "EPUB: a custom webkit thumb, 1px track, in an h-2 slot with mt-1. PDF: a plain h-1 range input with accent-text-interactive-base. Same component, two skins.",
  },
  {
    pin: 8,
    title: "Two different footer typographies for the same three fields",
    where: "foliate-reader.tsx:1565 · pdf-reader.tsx:1645",
    detail:
      "EPUB: text-[9px] uppercase tracking-widest with a four-step opacity ladder (40/80/30/50) and font-mono. PDF: text-xs text-text-weaker. Section · position renders as two different objects.",
  },
  {
    pin: 9,
    title: "Borders disagree in both directions",
    where: "foliate-reader.tsx:1274 / 1549 · pdf-reader.tsx:1366 / 1633",
    detail:
      "PDF header has border-b border-border-base/40 and its footer border-t. EPUB has neither, so the same chrome floats in one reader and is boxed in the other.",
  },
  {
    pin: 10,
    title: "The EPUB stylesheet restyles every scrollbar in the app",
    where: "foliate-reader.tsx:1645-1667",
    detail:
      "The <style> block sets `* { scrollbar-width: thin }` and bare ::-webkit-scrollbar rules with no scoping selector, so it leaks to the whole document. PDF scopes the equivalent rules to .buddy-pdfjs-scope (pdf-reader.tsx:1710). This is the most likely source of scrollbars looking different depending on what you opened last.",
  },
  {
    pin: null,
    title: "The progress fill is drawn in a colour that does not survive either theme",
    where: "pdf-reader.tsx:1671 · foliate-reader.tsx:1598 · reader-progress-scrubber.tsx",
    detail:
      "PDF passes `h-1 accent-text-interactive-base` to the shared scrubber; the EPUB header hairline draws the same accent at /60. One app-palette colour, one pixel high, laid against reader paper that is cream in light mode and near-black in dark — and against five reader themes it knows nothing about. It reads as nothing in most of them.",
  },
  {
    pin: null,
    title: "The PDF states its position twice, in two moving objects",
    where: "pdf-reader.tsx:1665 · .buddy-pdfjs-scope",
    detail:
      "The viewer scrolls continuously, so its scrollbar already draws position down the right edge — and the footer draws the same value again as a horizontal scrubber. Two elements track one number, and they move together, which is how you know one of them is redundant rather than complementary.",
  },
  {
    pin: null,
    title: "Sibling popovers scroll differently",
    where: "reader-toc-popover.tsx:41 vs reader-bookmarks-panel.tsx:78 / reader-search-panel.tsx",
    detail:
      "The TOC popover scrolls in a raw div with overflow-y-auto; bookmarks, annotations and search use ScrollArea. Two adjacent buttons in the same bar open two different scrollbars.",
  },
  {
    pin: null,
    title: "A third horizontal band, PDF only",
    where: "pdf-reader.tsx:1546",
    detail:
      "The layout-fallback warning inserts a full-width bar between header and content, pushing the page down. EPUB has no equivalent language for a degraded mode.",
  },
  {
    pin: null,
    title: "The z-index ladder is not shared",
    where: "foliate-reader.tsx:1274 / 1549 · pdf-reader.tsx:1366 / 1633",
    detail:
      "EPUB header z-[2], footer z-30. PDF header z-20, footer z-20. Overlays, page-turn buttons and selection toolbars are ordered against different ladders in each reader.",
  },
  {
    pin: null,
    title: "Only one reader has an empty state",
    where: "foliate-reader.tsx:1441",
    detail: "EPUB renders ReaderEmptyState for idle; the PDF reader has no idle branch at all.",
  },
  {
    pin: null,
    title: "The capability flags both engines publish are read by nothing",
    where: "reader-types.ts:29 · foliate-reader-adapters.ts:64 · pdf-viewer-session.ts:364",
    detail:
      "ReaderEngineCapabilities is computed on every open by both engines and consumed nowhere in packages/web. Each toolbar hard-codes its own control set instead, which is the mechanism by which they drifted — and the fix for that drift already exists and already runs.",
  },
  {
    pin: null,
    title: "Reduce motion is a dead switch in the PDF reader",
    where: "pdf-reader.tsx:1467 · foliate-themes.ts:235",
    detail:
      "EPUB applies it — it removes the renderer's animated attribute. PDF stores it, persists it, renders the switch, and never reads it. The shared block at the foot of the preferences panel is not actually shared behaviour.",
  },
  {
    pin: null,
    title: "Fixed-layout EPUB has no way to make the page bigger",
    where: "foliate-reader-adapters.ts:66 · foliate-reader.tsx:328",
    detail:
      "It reports pageLayouts: true and textFlow: false, so every typography control is correctly withheld — but foliate ships no zoom, fit, layout or rotation control to replace them. Three real states exist; only two have a scale affordance.",
  },
  {
    pin: null,
    title: "Section search scope is gated in one reader and not the other",
    where: "pdf-reader.tsx:1457 · reader-search-panel.tsx:75",
    detail:
      "PDF passes canSearchSection={Boolean(snapshot?.toc.length)}. Foliate never passes it, and the panel defaults it to true — so EPUB offers a section scope for documents with no outline.",
  },
  {
    pin: null,
    title: "The loading chip is a different object in each",
    where: "foliate-reader.tsx:1433 · pdf-reader.tsx:1556",
    detail:
      'EPUB: a square chip, px-2.5 py-1, text-[11px], "Opening…". PDF: a pill, rounded-full px-3 py-1.5, text-xs, "Opening PDF…". Same moment, two designs and two sentences.',
  },
]

// ── The API audit ────────────────────────────────────────────────────────

type Support = "yes" | "no" | "conditional"

type CapabilityRow = {
  name: string
  epub: Support
  epubFixed: Support
  pdf: Support
  rule: string
}

/**
 * `ReaderEngineCapabilities` (reader-types.ts:29) is already produced by both
 * engines — foliate-reader-adapters.ts:64 and pdf-viewer-session.ts:364 — and
 * read by nothing. A grep across packages/web finds no consumer at all. The
 * mechanism for a capability-driven shared toolbar exists and is dead; both
 * readers instead hard-code their own control set, which is how they drifted.
 */
const DECLARED_CAPABILITIES: CapabilityRow[] = [
  {
    name: "textFlow",
    epub: "yes",
    epubFixed: "no",
    pdf: "no",
    rule: "foliate: !isFixedLayout · pdf: hard-coded false",
  },
  {
    name: "pageLayouts",
    epub: "no",
    epubFixed: "yes",
    pdf: "yes",
    rule: "foliate: isFixedLayout · pdf: hard-coded true",
  },
  { name: "search", epub: "yes", epubFixed: "yes", pdf: "yes", rule: "hard-coded true in both" },
  {
    name: "outline",
    epub: "conditional",
    epubFixed: "conditional",
    pdf: "conditional",
    rule: "toc.length > 0 in both",
  },
  {
    name: "pageLabels",
    epub: "conditional",
    epubFixed: "conditional",
    pdf: "conditional",
    rule: "foliate: pageList.length > 0 · pdf: pageLabels !== null",
  },
  {
    name: "textSelection",
    epub: "yes",
    epubFixed: "yes",
    pdf: "yes",
    rule: "hard-coded true in both",
  },
  {
    name: "annotations",
    epub: "yes",
    epubFixed: "yes",
    pdf: "yes",
    rule: "hard-coded true in both",
  },
]

/**
 * What each engine actually implements, which is not the same question.
 *
 * Scale is two rows here, not one, and that is the correction that mattered
 * most. They look like the same control and they are not: one reflows the text
 * and leaves the page alone, the other rasterises the page and leaves the text
 * alone. No engine has both, and no engine ever will — so a single shared
 * "scale" control would have been a name pretending two mechanics are one.
 * They get different glyphs, different homes, and different depth.
 *
 * The fixed-layout row is the gap that follows: it has neither.
 */
const IMPLEMENTED_CONTROLS: CapabilityRow[] = [
  { name: "Theme (5)", epub: "yes", epubFixed: "yes", pdf: "yes", rule: "shared READER_THEMES" },
  {
    name: "Text size — reflows",
    epub: "yes",
    epubFixed: "no",
    pdf: "no",
    rule: "foliate: fontScaleRem 0.85–1.4 · proposal: A− / A+ inside View",
  },
  {
    name: "Zoom — rasterises",
    epub: "no",
    epubFixed: "no",
    pdf: "yes",
    rule: "pdf: viewer scale · proposal: − / + in the bar, no readout",
  },
  {
    name: "Typeface preset",
    epub: "yes",
    epubFixed: "no",
    pdf: "no",
    rule: "serif / sans / publisher",
  },
  { name: "Reading flow", epub: "yes", epubFixed: "no", pdf: "no", rule: "canChangeFlow gate" },
  {
    name: "Line height · margins · gap · max width",
    epub: "yes",
    epubFixed: "no",
    pdf: "no",
    rule: "four sliders, foliate only",
  },
  { name: "Justify · hyphenate", epub: "yes", epubFixed: "no", pdf: "no", rule: "foliate only" },
  {
    name: "Page layout",
    epub: "no",
    epubFixed: "no",
    pdf: "yes",
    rule: "continuous / single / two-up — pdf only, despite the fixed-layout flag",
  },
  {
    name: "Fit mode",
    epub: "no",
    epubFixed: "no",
    pdf: "yes",
    rule: "fit-width / fit-page / custom · proposal: the middle magnifier, not a panel row",
  },
  { name: "Rotation", epub: "no", epubFixed: "no", pdf: "yes", rule: "0 / 90 / 180 / 270" },
  {
    name: "Reduce motion",
    epub: "yes",
    epubFixed: "yes",
    pdf: "no",
    rule: "foliate: removes the animated attribute · pdf: stored, never read",
  },
  {
    name: "Autohide cursor",
    epub: "yes",
    epubFixed: "yes",
    pdf: "yes",
    rule: "foliate: autohide-cursor attribute · pdf: cursor-none",
  },
  {
    name: "Search — section scope",
    epub: "yes",
    epubFixed: "yes",
    pdf: "conditional",
    rule: "pdf gates on toc.length; foliate never passes canSearchSection, so it defaults true",
  },
  {
    name: "TOC · bookmarks · annotations · history",
    epub: "yes",
    epubFixed: "yes",
    pdf: "yes",
    rule: "parity",
  },
]

// ── The frequency ranking that decides depth ──────────────────────────────

type ClickRow = {
  action: string
  frequency: string
  epubToday: string
  pdfToday: string
  proposed: string
}

const CLICK_LEDGER: ClickRow[] = [
  {
    action: "Turn page / scroll",
    frequency: "constant",
    epubToday: "0 · keys, click, swipe",
    pdfToday: "0 · keys, scroll",
    proposed: "0 — unchanged",
  },
  {
    action: "Zoom the page (PDF only)",
    frequency: "several per session",
    epubToday: "—  · no such thing",
    pdfToday: "0 · bar stepper",
    proposed: "0 · bar, − + , no readout",
  },
  {
    action: "Resize the text (EPUB only)",
    frequency: "several per session",
    epubToday: "2 + drag · Aa → slider",
    pdfToday: "—  · no such thing",
    proposed: "1 + presses · Aa → A− A+",
  },
  {
    action: "Jump to a chapter",
    frequency: "several per session",
    epubToday: "1 · TOC",
    pdfToday: "1 · TOC",
    proposed: "1 — unchanged",
  },
  {
    action: "Jump to a page / location",
    frequency: "several per session (PDF)",
    epubToday: "2 · ⋯ → dialog",
    pdfToday: "2 · ⋯ → dialog",
    proposed: "1 · click the location you can already see",
  },
  {
    action: "Search inside",
    frequency: "a few per session",
    epubToday: "1",
    pdfToday: "1",
    proposed: "1 — unchanged",
  },
  {
    action: "Bookmark here",
    frequency: "occasional",
    epubToday: "1 · ×2 places",
    pdfToday: "1 · ×2 places",
    proposed: "1 · one place",
  },
  {
    action: "Browse marks (bookmarks + highlights)",
    frequency: "occasional",
    epubToday: "1 + 1 · two popovers",
    pdfToday: "1 + 1 · two popovers",
    proposed: "1 · one popover, one list",
  },
  {
    action: "Clear the chrome to read (Focus)",
    frequency: "per sitting",
    epubToday: "—  · not possible",
    pdfToday: "—  · not possible",
    proposed: "1 · last button in the bar",
  },
  {
    action: "Change layout / reading flow",
    frequency: "once or twice, ever",
    epubToday: "1 · top-level in ⋯",
    pdfToday: "1 · top-level in ⋯",
    proposed: "2 · View → it is a setting, not an action",
  },
  {
    action: "Change theme",
    frequency: "once, ever",
    epubToday: "2 · Aa",
    pdfToday: "2 · Aa",
    proposed: "2 — unchanged",
  },
  {
    action: "Rotate (PDF)",
    frequency: "rare",
    epubToday: "—",
    pdfToday: "1 · top-level in ⋯",
    proposed: "2 · View",
  },
  {
    action: "Keyboard shortcuts",
    frequency: "once, ever",
    epubToday: "1 · top-level in ⋯",
    pdfToday: "1 · top-level in ⋯",
    proposed: "2 · foot of View",
  },
]

const CUTS = [
  "The ⋯ menu — everything in it was either a setting (moved into View) or already elsewhere.",
  "The two history buttons in the footer — back and forward are locations, so they moved into the Go to popover.",
  "The second bookmark toggle in the bookmarks panel header.",
  "The separate annotations popover — folded into one Highlights & notes list alongside bookmarks, with no tabs.",
  "The header progress hairline — one rail, at the foot of the page, and only where there is no scrollbar.",
  "The progress rail itself on any scrolled surface — the scrollbar already carries that value.",
  "The PDF Go to page dialog — the bottom location popover does it from where the location is shown.",
  "The PDF zoom percentage readout and its Page scale segmented control — three magnifiers replace them: out, fit, in.",
  "The Fit segmented control in the preferences panel — Fit is a zoom operation, so it is the middle magnifier and not a second home for the same idea.",
  "The EPUB font-size slider — A− / A+ is the same value in one press instead of a drag.",
]

const SCROLL_RULES = [
  "One scroll container per reading surface. EPUB: the foliate view. PDF: .buddy-pdfjs-scope. Nothing above them scrolls.",
  "One position readout per surface. If that container scrolls, its scrollbar is the readout and the progress rail is not drawn.",
  "The rail draws in the reader theme's own content ink over the reader's own paper, so it stays legible on all five themes without a per-theme value.",
  "Horizontal scroll only when scale is custom — never as a side effect of chrome width.",
  "Every popover scrolls the same way: one ScrollArea, under a fixed header. No raw overflow-y-auto divs.",
  'The reader stylesheet is scoped to [data-component="reader"]. No bare * or ::-webkit-scrollbar rules.',
]

// ── Primitives ────────────────────────────────────────────────────────────

function Pin(props: { n: number; show: boolean }) {
  if (!props.show) return null
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -right-1 -top-1 z-30 flex size-3.5 items-center justify-center rounded-full bg-surface-critical-base text-[9px] font-semibold leading-none text-text-on-critical-base ring-1 ring-background-base"
    >
      {props.n}
    </span>
  )
}

/**
 * The pin must not change what it is pinning. `block` is for the two cases that
 * are full-width or contain an absolutely-positioned child — an inline-flex
 * wrapper would collapse the scrubber and reparent the progress hairline.
 */
function Pinned(props: { n: number; show: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("relative", props.className ?? "inline-flex shrink-0")}>
      {props.children}
      <Pin n={props.n} show={props.show} />
    </span>
  )
}

function BarIcon(props: {
  icon: typeof SearchIcon
  label: string
  active?: boolean
  onClick?: () => void
}) {
  const Icon = props.icon
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={cn(
        "shrink-0",
        props.active
          ? "bg-surface-raised-strong text-text-strong"
          : "text-text-weaker hover:bg-surface-weak hover:text-text-base",
      )}
    >
      <Icon className="size-4" />
    </Button>
  )
}

/**
 * Grouping is done with SPACE, not with containers.
 *
 * The first attempt put related buttons in recessed tracks, which fixed the
 * "row of anonymous squares" problem by adding a rectangle behind every pair —
 * and a bar made of pills is just a different kind of noise. Proximity already
 * carries grouping: two buttons touching read as a pair, three buttons at a
 * normal gap read as peers, and a wider gap reads as a boundary. Nothing needs
 * a fill to say what an eighth of an inch of air already says.
 *
 * BAR_GROUP_GAP is the boundary between groups; the buttons inside a group sit
 * at the default gap, and only the zoom pair sits flush.
 */
const BAR_GROUP_GAP = "ml-3"

/**
 * Three magnifiers, flush against each other: out, fit, in. Preview's shape.
 *
 * Bare − and + were wrong twice over — they are the arithmetic glyphs, not the
 * zoom glyphs, so nothing on screen said what they acted on, and they sat in
 * the bar as two more anonymous targets in a row of anonymous targets. The
 * magnifier family says "zoom" without a label, and flush spacing says the
 * three belong together without a box.
 *
 * The middle button is the reset the deleted percentage used to be. It is Fit,
 * not 1:1, because a fitted page is the size people actually want to get back
 * to, and it is one press from either direction of drift.
 *
 * Fit is TWO things, and the first draft collapsed them into one, which lost a
 * capability: pdf.js ships fit-width, fit-page and custom (PDF_SCALE_OPTIONS),
 * and fit-width and fit-page are genuinely different documents' needs — text
 * wants the width, a scan or a slide wants the whole page. So they split by
 * kind rather than by menu depth: WHICH fit is a preference, set once per
 * document, and lives in the View panel; RETURNING to it is an action you take
 * constantly, and lives here. That is not the same control in two places — one
 * chooses the target, the other jumps to it. `custom` stops being a mode you
 * select and becomes what pressing ⊖ or ⊕ puts you in, which is what it already
 * meant.
 *
 * No percentage. The readout was never what anyone wanted: you press until it
 * looks right, and a number that has to be read to be understood costs more
 * attention than it returns.
 *
 * An EPUB never gets this control. Reflowed text has no zoom — see TextSize.
 */
function PdfZoomCluster() {
  return (
    <div role="group" aria-label="Zoom" className="flex shrink-0 items-center">
      <BarIcon icon={ZoomOutIcon} label="Zoom out  ⌘−" />
      <BarIcon icon={FitToScreenIcon} label="Fit the page  ⌘0" />
      <BarIcon icon={ZoomInIcon} label="Zoom in  ⌘+" />
    </div>
  )
}

/**
 * Text size, and only text size. It reflows — line breaks move, the page count
 * changes — so it is a property of TYPE, and it sits at the head of the View
 * panel with the rest of the typography, exactly as macOS Books does it.
 *
 * A− / A+, not − / +, because the glyph is the whole explanation. And not a
 * slider: the shipped EPUB slider needed a drag to do what one press should do,
 * which is what made this a two-click control worth fixing.
 *
 * A PDF never gets this control. Baked glyphs have no text size — see Zoom.
 */
/**
 * Not a ToggleGroup: these are two repeatable actions, not two states — you
 * press A+ four times and nothing stays "on". A segmented control here would
 * promise a selection it never makes.
 */
function TextSizeControl() {
  return (
    <div className="flex items-stretch gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Smaller text"
        title="Smaller text"
        className="flex-1 font-serif text-[13px] leading-none"
      >
        A
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Larger text"
        title="Larger text"
        className="flex-1 font-serif text-lg leading-none"
      >
        A
      </Button>
    </div>
  )
}

/**
 * The bottom band, and the only thing in it. Chapter and position are readouts,
 * not actions — putting them in the top bar next to Search and Bookmark made
 * the bar say two different kinds of thing at once, and for an EPUB, where
 * "page" is a fiction the layout invents, that reads as noise up top.
 *
 * So: down here, small, quiet, centred, no button chrome at rest. It is still
 * clickable — the thing you want to change is the thing you press — but it
 * costs the band nothing visually, and nothing that MUST be reachable is here.
 */
function LocationStrip(props: {
  engine: ReaderEngine
  open: boolean
  onToggle: () => void
  /** Docked width drops the chapter and keeps the position. Position never goes. */
  dense: boolean
}) {
  const doc = DOCUMENT[props.engine]
  return (
    <div className="flex h-7 shrink-0 items-center justify-center px-2">
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.open}
        title={`${doc.section} · ${doc.position} — jump to a location`}
        className={cn(
          "flex min-w-0 max-w-full items-baseline gap-1.5 overflow-hidden rounded px-2 py-0.5 text-[11px] text-text-weaker hover:bg-surface-raised-base hover:text-text-weak",
          props.open && "bg-surface-raised-base text-text-weak",
        )}
      >
        {props.dense ? null : (
          <>
            <span className="min-w-0 shrink truncate">{doc.section}</span>
            <span aria-hidden className="shrink-0 opacity-50">
              ·
            </span>
          </>
        )}
        <span className="shrink-0 font-mono tabular-nums">{doc.position}</span>
      </button>
    </div>
  )
}

/**
 * Progress and seeking are the same object, and the rail is the page's own
 * bottom edge — which is why nothing that carries a rail also draws a border.
 *
 * Two things were wrong with it and both are fixed here.
 *
 * Colour: it was the app accent at 70% on a 2px hairline, which is a blue line
 * laid over cream paper in light mode and over near-black in dark — invisible
 * in both. It now draws in the READER theme's own content ink, mixed against
 * the reader's own paper, so contrast is guaranteed by construction across all
 * five themes and both app modes. Nothing has to be tuned per theme, and the
 * rail cannot drift out of sync with the page it belongs to.
 *
 * Existence: see `surfaceScrolls` at the call sites. A rail on a continuously
 * scrolled surface is a second readout of a value the scrollbar is already
 * showing — two objects moving in lockstep, saying one thing. The rail is drawn
 * only where there is no scrollbar to say it.
 *
 * It is NOT a readout. It replaces ReaderProgressScrubber, which is an
 * <input type="range">, so it inherits that job: the whole strip is a hit target,
 * it takes a drag, and a thumb appears under the pointer to say so. Integrating
 * this as a plain div would silently delete seek-by-drag from paged EPUB, where
 * the rail is the only position control there is. The 10px strip is the target;
 * the 3px line is only what it draws.
 */
function ProgressRail(props: { value: number; engine: ReaderEngine; className?: string }) {
  const paper = READER_PAPER[props.engine]
  return (
    <div
      className={cn("group/rail relative h-2.5 w-full shrink-0 cursor-pointer", props.className)}
      style={{ backgroundColor: paper.background }}
      title="Drag to seek"
    >
      <div
        className="absolute inset-x-0 bottom-0 h-[3px]"
        style={{ backgroundColor: `color-mix(in oklab, ${paper.ink} 16%, transparent)` }}
      >
        <div
          className="h-full transition-[width]"
          style={{
            width: `${props.value}%`,
            backgroundColor: `color-mix(in oklab, ${paper.ink} 72%, transparent)`,
          }}
        />
      </div>
      <div
        className="absolute bottom-[-1px] size-[7px] -translate-x-1/2 rounded-full opacity-0 transition-opacity group-hover/rail:opacity-100"
        style={{ left: `${props.value}%`, backgroundColor: paper.ink }}
      />
    </div>
  )
}

// ── Reading surfaces ──────────────────────────────────────────────────────

function ScrollTag(props: { show: boolean; label: string }) {
  if (!props.show) return null
  return (
    <span className="pointer-events-none absolute bottom-1 right-1 z-20 rounded bg-surface-info-base/90 px-1.5 py-0.5 font-mono text-[9px] text-text-on-info-base">
      {props.label}
    </span>
  )
}

function EpubSurface(props: { scrollMap: boolean; roomy?: boolean }) {
  return (
    <div
      className={cn(
        "relative min-h-0 flex-1 overflow-hidden bg-[#faf7f0]",
        props.scrollMap && "ring-1 ring-inset ring-border-info-base",
      )}
    >
      <div
        className={cn(
          "h-full overflow-y-auto px-8 py-6 font-serif text-[13px] leading-relaxed text-[#2b2723]",
          props.roomy && "px-10 py-8",
        )}
      >
        <p className="mb-3 font-sans text-[10px] uppercase tracking-widest text-[#8a8175]">
          {DOCUMENT.epub.section}
        </p>
        {PROSE.map((paragraph) => (
          <p key={paragraph.slice(0, 24)} className="mb-3 indent-5 first:indent-0">
            {paragraph}
          </p>
        ))}
        {PROSE.map((paragraph) => (
          <p key={`${paragraph.slice(0, 12)}-b`} className="mb-3 indent-5">
            {paragraph}
          </p>
        ))}
      </div>
      <ScrollTag show={props.scrollMap} label="scroller · foliate view" />
    </div>
  )
}

/** Ragged enough that truncation and page edges are judgeable, fixed so keys are stable. */
const PDF_LINE_WIDTHS: Array<{ id: string; width: string }> = [
  { id: "a", width: "w-full" },
  { id: "b", width: "w-[96%]" },
  { id: "c", width: "w-[99%]" },
  { id: "d", width: "w-[88%]" },
  { id: "e", width: "w-full" },
  { id: "f", width: "w-[92%]" },
  { id: "g", width: "w-[70%]" },
  { id: "h", width: "w-full" },
  { id: "i", width: "w-[94%]" },
  { id: "j", width: "w-[60%]" },
]

function PdfSurface(props: { scrollMap: boolean }) {
  return (
    <div
      className={cn(
        "relative min-h-0 flex-1 overflow-hidden bg-surface-inset-base",
        props.scrollMap && "ring-1 ring-inset ring-border-info-base",
      )}
    >
      <div className="h-full overflow-y-auto px-6 py-5">
        {[84, 85].map((page) => (
          <div
            key={page}
            className="mx-auto mb-4 w-full max-w-[22rem] rounded-[2px] bg-white p-5 shadow-[0_1px_6px_color-mix(in_oklab,var(--surface-strong)_18%,transparent)]"
          >
            <p className="mb-3 font-sans text-[10px] uppercase tracking-widest text-neutral-400">
              {DOCUMENT.pdf.section}
            </p>
            <div className="flex flex-col gap-1.5">
              {PDF_LINE_WIDTHS.map((line) => (
                <div
                  key={`${page}-${line.id}`}
                  className={cn("h-1.5 rounded-sm bg-neutral-300/80", line.width)}
                />
              ))}
            </div>
            <p className="mt-4 text-center font-mono text-[9px] text-neutral-400">{page}</p>
          </div>
        ))}
      </div>
      <ScrollTag show={props.scrollMap} label="scroller · .buddy-pdfjs-scope" />
    </div>
  )
}

function ReadingSurface(props: { engine: ReaderEngine; scrollMap: boolean; roomy?: boolean }) {
  return props.engine === "epub" ? (
    <EpubSurface scrollMap={props.scrollMap} roomy={props.roomy} />
  ) : (
    <PdfSurface scrollMap={props.scrollMap} />
  )
}

// ── Mock popovers ─────────────────────────────────────────────────────────

/**
 * Rendered in-flow inside the frame rather than through Radix, so the easel can
 * show the panel and the bar in one screenshot. Shape and content are the
 * proposal; the real thing stays a Popover.
 */
/**
 * The chrome every bar-anchored panel shares, with no opinion about where it
 * sits. MockPanel positions it inside a reader frame; the flat gallery below
 * renders the same shell in a row. One definition, so a panel cannot look like
 * one thing in the frame and another thing under review.
 */
function PanelShell(props: {
  title: string
  onClose?: () => void
  children: ReactNode
  width?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha shadow-xl",
        props.className,
      )}
      style={{ width: props.width ?? 280 }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border-weak-base px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-text-weaker">
          {props.title}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close"
          onClick={props.onClose}
          className="text-text-weaker"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{props.children}</div>
    </div>
  )
}

function MockPanel(props: {
  title: string
  align: "start" | "center" | "end"
  onClose: () => void
  children: ReactNode
  width?: number
  /** A panel opens from the band that owns its trigger — bottom band, bottom edge. */
  anchor?: "top" | "bottom"
}) {
  return (
    <PanelShell
      title={props.title}
      onClose={props.onClose}
      width={props.width}
      className={cn(
        "absolute z-40 max-h-[calc(100%-4rem)]",
        props.anchor === "bottom" ? "bottom-10" : "top-12",
        props.align === "start" && "left-2",
        props.align === "center" && "left-1/2 -translate-x-1/2",
        props.align === "end" && "right-2",
      )}
    >
      {props.children}
    </PanelShell>
  )
}

function PanelLabel(props: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-weaker">
      {props.children}
    </p>
  )
}

/**
 * A selected row is neutral, not accented.
 *
 * The first draft used `surface-interactive-weak`, which is the app's brand
 * violet. It fails three ways in a reader. It is the loudest thing on a surface
 * whose whole job is to be quiet — in a dark panel the row reads as lit rather
 * than as marked. It is a colour the reader already spends elsewhere: annotation
 * colours mean something specific here, so a violet row invites the question of
 * which mark it belongs to. And a list of five entries with one violet band puts
 * more emphasis on "you are here" than the four places you might go, which is
 * backwards for a control you opened in order to leave.
 *
 * So the same treatment the ToggleGroup on-state uses: one step up the raised
 * ramp, plus a text-colour signal. That is deliberate — a selected row and a
 * selected segment are the same state, so they must not be two different colours.
 * See docs/known-issues/state-collapsed-into-hover.md for why fill alone is not
 * enough, and why the hover companion is required.
 */
const SELECTED_ROW = "bg-surface-raised-strong text-text-strong hover:bg-surface-raised-strong"

const CONTENTS_ENTRIES = [
  "Cover",
  "1 · Antiquity",
  "2 · The Cathedral Schools",
  "3 · Scholastic Method",
  "4 · The Renaissance Schoolmasters",
  "5 · The Printing Press",
]

/**
 * Structure only, and it opens on the left because its button is on the left.
 * A panel that appears on the opposite side from the thing you pressed makes
 * you re-find your own click.
 */
function ContentsPanel(props: { engine: ReaderEngine; onClose: () => void }) {
  const doc = DOCUMENT[props.engine]
  return (
    <MockPanel title="Contents" align="start" onClose={props.onClose} width={280}>
      <div className="flex flex-col gap-0.5">
        {CONTENTS_ENTRIES.map((entry) => (
          <button
            key={entry}
            type="button"
            className={cn(
              "truncate rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface-base-hover",
              entry === doc.section ? SELECTED_ROW : "text-text-weak",
            )}
          >
            {entry}
          </button>
        ))}
      </div>
    </MockPanel>
  )
}

/**
 * Position only — the jump field, the two history buttons that used to sit in
 * the footer, and where you have already been. It absorbs the shipped "Go to
 * page" and "Location and jumps" dialogs, and it opens from the readout at the
 * foot of the page, because that readout is the thing you are trying to change.
 *
 * It deliberately does NOT repeat the contents list. Two triggers opening one
 * merged panel is the redundancy this whole exercise is against; two triggers
 * opening two smaller panels, each about one thing, is the point of it.
 */
function GoToPanel(props: { engine: ReaderEngine; onClose: () => void }) {
  const doc = DOCUMENT[props.engine]
  return (
    <MockPanel title="Go to" align="center" onClose={props.onClose} width={300} anchor="bottom">
      <div className="mb-3 flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border-base bg-background-base px-2.5 py-1.5">
          <MapIcon className="size-3.5 shrink-0 text-icon-base" />
          <span className="truncate text-xs text-text-weaker">
            {props.engine === "pdf" ? "Page number or label" : "Chapter, or 0–100%"}
          </span>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Back" title="Back  ⌘[">
          <Undo2Icon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Forward"
          title="Forward  ⌘]"
          disabled
        >
          <Redo2Icon className="size-4" />
        </Button>
      </div>

      <PanelLabel>Recent</PanelLabel>
      <div className="flex flex-col">
        {["Cover", "2 · The Cathedral Schools", doc.section].map((entry, index) => (
          <button
            key={entry}
            type="button"
            className={cn(
              "flex items-baseline justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface-base-hover",
              index === 2 && SELECTED_ROW,
            )}
          >
            <span className="truncate text-text-base">{entry}</span>
            <span className="shrink-0 font-mono text-[10px] text-text-weaker">
              {index === 2 ? doc.position : `${12 + index * 9}%`}
            </span>
          </button>
        ))}
      </div>
    </MockPanel>
  )
}

/**
 * The five real themes, lifted from READER_THEMES in foliate-reader-constants.ts.
 * Both engines already share this list — the PDF reader maps the same objects
 * through READER_THEME_OPTIONS — so theme is the one block that needs no
 * per-engine thought at all.
 */
const READER_THEME_SWATCHES: Array<{ id: string; label: string; bg: string; fg: string }> = [
  { id: "paper", label: "Paper", bg: "#fffdf7", fg: "#1f1b16" },
  { id: "sepia", label: "Sepia", bg: "#f5ecd9", fg: "#3b2d1f" },
  { id: "night", label: "Night", bg: "#0f141d", fg: "#e6edf6" },
  { id: "mist", label: "Mist", bg: "#edf4f8", fg: "#203646" },
  { id: "graphite", label: "Graphite", bg: "#1c2025", fg: "#f4f2ee" },
]

/**
 * The selected swatch was a 2px ring drawn tight against a 1px ring — at 32px,
 * on five circles in a row, that is a weight difference and not a state. It now
 * gets a gap between the swatch and its ring, so the selected one reads as
 * circled rather than as slightly thicker, and a check in the corner so the
 * state survives on the two themes whose fill is near the ring's own colour.
 */
function ThemeSwatches() {
  return (
    <div className="flex items-center gap-3">
      {READER_THEME_SWATCHES.map((swatch, index) => (
        <button
          key={swatch.id}
          type="button"
          aria-label={swatch.label}
          title={swatch.label}
          aria-pressed={index === 0}
          className={cn(
            "relative flex size-9 shrink-0 items-center justify-center rounded-full font-serif text-base ring-1 ring-border-weak-base transition-shadow",
            index === 0 &&
              "ring-2 ring-border-interactive-base ring-offset-2 ring-offset-surface-raised-stronger-non-alpha",
          )}
          style={{ backgroundColor: swatch.bg, color: swatch.fg }}
        >
          A
          {index === 0 ? (
            <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-text-interactive-base ring-2 ring-surface-raised-stronger-non-alpha">
              <CheckIcon className="size-2 text-text-on-interactive-base" />
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

/**
 * Three passes to get here, and the third removed the labels.
 *
 * Hairlines alone read as no separation; cards fixed that and turned the panel
 * into nested rectangles; and the labels that survived both passes — THEME,
 * TEXT, FLOW, READING — were naming things that name themselves. Five coloured
 * circles with an A on them are the theme picker. A row of sliders called line
 * height and margins is the type block. The words were a caption on a picture
 * of itself, and five of them stacked up read as structure that is not there.
 *
 * What is left is space and one hairline. The group has no label, no border and
 * no fill; separation is proximity, which is what proximity is for.
 */
function PanelGroup(props: { children: ReactNode }) {
  return (
    <section className="border-t border-border-weaker-base pt-5 first:border-t-0 first:pt-0">
      {props.children}
    </section>
  )
}

function PanelSlider(props: { label: string; value: string; fill: number }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-20 shrink-0 text-xs text-text-weak">{props.label}</span>
      <div className="relative h-1 min-w-0 flex-1 rounded-full bg-surface-weak">
        <div
          className="h-full rounded-full bg-text-interactive-base/70"
          style={{ width: `${props.fill}%` }}
        />
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-interactive-base"
          style={{ left: `${props.fill}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-[10px] text-text-weaker">
        {props.value}
      </span>
    </div>
  )
}

/**
 * The shared ToggleGroup, with no on-state override. The first pass here built
 * its own segmented buttons, which is how the on-state question got answered
 * twice — once in this mock and once, differently, in the component every real
 * panel uses. The second pass used the component but overrode its on-state,
 * which is the same mistake wearing a hat.
 *
 * The fix now lives in toggleVariants, so what renders here is what the real
 * preferences panels render. If the selected segment stops being legible, this
 * mock stops being legible with it — which is the whole point of mocking the
 * component instead of a copy of it.
 */
function PanelSegments(props: {
  label?: string
  options: Array<{ id: string; label: string; icon?: typeof SearchIcon; iconOnly?: boolean }>
  activeId: string
  className?: string
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={props.activeId}
      aria-label={props.label ?? "Option"}
      className={cn("w-full", props.className)}
    >
      {props.options.map((option) => {
        const Icon = option.icon
        return (
          <ToggleGroupItem
            key={option.id}
            value={option.id}
            aria-label={option.iconOnly ? option.label : undefined}
            title={option.iconOnly ? option.label : undefined}
            className="min-w-0 flex-1"
          >
            {Icon ? <Icon className="size-4 shrink-0" /> : null}
            {option.iconOnly ? null : <span className="truncate">{option.label}</span>}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}

/**
 * One label, one control, stacked — not side by side. The horizontal form ran
 * the label into the control at panel width and left the control whatever was
 * left over, which is how "Continuous" became "Contin…". Stacked, every control
 * gets the full width and every label gets a full line, and the rows can be
 * spaced apart instead of squeezed.
 */
function PanelRow(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-text-weak">{props.label}</p>
      {props.children}
    </div>
  )
}

function PanelToggle(props: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <p className="min-w-0 text-xs text-text-weak">{props.label}</p>
      <Switch size="sm" checked={props.checked} aria-label={props.label} />
    </div>
  )
}

/**
 * Three fills, not two. `capabilities.textFlow` is `!isFixedLayout`
 * (foliate-reader-adapters.ts:66), so a fixed-layout EPUB — a comic, a
 * children's book, anything with baked pages — has no typography controls at
 * all, and the panel that ships today still offers them. Any proposal that only
 * considers "EPUB" and "PDF" is designing for two of the three states.
 */
type ViewVariant = "epub" | "epub-fixed" | "pdf"

const VIEW_VARIANT_LABEL = {
  epub: "EPUB · reflowable",
  "epub-fixed": "EPUB · fixed-layout",
  pdf: "PDF",
} satisfies Record<ViewVariant, string>

const VIEW_VARIANT_CAPABILITY = {
  epub: "textFlow ✓  pageLayouts ✗",
  "epub-fixed": "textFlow ✗  pageLayouts ✓",
  pdf: "textFlow ✗  pageLayouts ✓",
} satisfies Record<ViewVariant, string>

/**
 * Review commentary, kept strictly OUTSIDE the mock. Anything that explains a
 * source rule, names a flag, or reports a bug is a note about the design, not
 * part of it — putting it in the panel makes the panel unreviewable, because
 * you can no longer tell which words a reader would actually see.
 */
const VIEW_VARIANT_NOTE = {
  epub: "Every typography control lives here; the bar carries none of it.",
  "epub-fixed":
    "Note what is missing: no Text, no Flow, and no Page either. foliate reports pageLayouts: true and then ships no layout, fit, rotation or zoom — so this document cannot be made bigger by any means. That is the gap, shown rather than described.",
  pdf: "Zoom and Fit are absent on purpose — both act on the page, so they are the three magnifiers in the bar. Reduce motion renders here but the PDF reader never reads it.",
} satisfies Record<ViewVariant, string>

function viewVariantEngine(variant: ViewVariant): ReaderEngine {
  return variant === "pdf" ? "pdf" : "epub"
}

/**
 * The body, extracted from the popover so the easel can show it flat under the
 * reader without a click. Everything here is gated on what the engine actually
 * implements today — no control appears for a variant that has no code behind
 * it, and the two switches at the bottom carry the truth about whether they are
 * wired.
 */
function ViewPanelBody(props: { variant: ViewVariant }) {
  const variant = props.variant
  const isPdf = variant === "pdf"
  const reflowable = variant === "epub"

  return (
    <div className="flex flex-col gap-5">
      <PanelGroup>
        <ThemeSwatches />
      </PanelGroup>

      {reflowable ? (
        <PanelGroup>
          <div className="flex flex-col gap-4">
            <PanelRow label="Text size">
              <TextSizeControl />
            </PanelRow>
            {/*
              Text-only segments from here down. The icons were decoration that
              cost the labels their room: at panel width, "Continuous" plus a
              glyph plus padding does not fit in a third of the track, so the
              word truncated to "Contin…" and the control started guessing at
              its own meaning. Alignment keeps its glyphs because align-left and
              align-justify are genuinely iconic — they say the thing faster
              than the word does — so those go icon-only instead.
            */}
            <PanelRow label="Typeface">
              <PanelSegments
                activeId="serif"
                options={[
                  { id: "serif", label: "Serif" },
                  { id: "sans", label: "Sans" },
                  { id: "publisher", label: "Publisher" },
                ]}
              />
            </PanelRow>
            <PanelRow label="Alignment">
              <PanelSegments
                activeId="left"
                options={[
                  { id: "left", label: "Left", icon: AlignLeftIcon, iconOnly: true },
                  { id: "justify", label: "Justify", icon: AlignJustifyIcon, iconOnly: true },
                ]}
              />
            </PanelRow>
            <div className="flex flex-col gap-0.5">
              <PanelSlider label="Line height" value="1.62" fill={52} />
              <PanelSlider label="Margins" value="56px" fill={38} />
              <PanelSlider label="Column gap" value="8%" fill={44} />
              <PanelSlider label="Max width" value="780" fill={45} />
            </div>
            <PanelToggle label="Hyphenation" checked />
          </div>
        </PanelGroup>
      ) : null}

      {reflowable ? (
        <PanelGroup>
          <PanelRow label="Reading flow">
            <PanelSegments
              activeId="paginated"
              options={[
                { id: "paginated", label: "Pages" },
                { id: "scrolled", label: "Scroll" },
              ]}
            />
          </PanelRow>
        </PanelGroup>
      ) : null}

      {isPdf ? (
        <PanelGroup>
          <div className="flex flex-col gap-4">
            <PanelRow label="Page layout">
              <PanelSegments
                activeId="continuous"
                options={[
                  { id: "continuous", label: "Continuous" },
                  { id: "single-page", label: "Single" },
                  { id: "two-up", label: "Two-up" },
                ]}
              />
            </PanelRow>
            {/*
              Which fit the middle magnifier returns to. Two segments, not the
              shipped three — `custom` was never a destination anyone chose, it
              is the state you land in the moment you press ⊖ or ⊕, so it stops
              being an option and becomes a consequence. That also retires the
              custom-zoom slider, which was a second way to do what the two
              magnifiers in the bar already do.
            */}
            <PanelRow label="Fit">
              <PanelSegments
                activeId="fit-width"
                options={[
                  { id: "fit-width", label: "Width" },
                  { id: "fit-page", label: "Whole page" },
                ]}
              />
            </PanelRow>
            {/*
              Rotation was a lone outlined chip reading "0°" jammed against its
              own label — an outline nothing else in the panel had, on a value
              that is a readout rather than a target. Rotating is a repeatable
              action, like text size, so it gets the same shape: two buttons,
              its own row, its own air. The current angle is not shown because
              the page is showing it.
            */}
            <PanelRow label="Rotation">
              <div className="flex items-stretch gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Rotate left"
                  title="Rotate left"
                  className="flex-1"
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Rotate right"
                  title="Rotate right"
                  className="flex-1"
                >
                  <RotateCwIcon className="size-4" />
                </Button>
              </div>
            </PanelRow>
          </div>
        </PanelGroup>
      ) : null}

      <PanelGroup>
        <div className="flex flex-col gap-1">
          <PanelToggle label="Reduce motion" checked={false} />
          <PanelToggle label="Autohide cursor" checked={false} />
        </div>
      </PanelGroup>

      <PanelGroup>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded py-1 text-xs text-text-weak hover:text-text-base"
          >
            Keyboard shortcuts
            <span className="font-mono text-[10px] text-text-weaker">?</span>
          </button>
          {!isPdf ? (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded py-1 text-xs text-text-weak hover:text-text-base"
            >
              Location &amp; navigation
              <span className="font-mono text-[10px] text-text-weaker">⌘L</span>
            </button>
          ) : null}
        </div>
      </PanelGroup>
    </div>
  )
}

function ViewPanel(props: { engine: ReaderEngine; onClose: () => void }) {
  return (
    <MockPanel title="View" align="end" onClose={props.onClose} width={330}>
      <ViewPanelBody variant={props.engine === "pdf" ? "pdf" : "epub"} />
    </MockPanel>
  )
}

/**
 * The four real annotation colours and the four real styles, lifted from
 * READER_ANNOTATION_COLOR_OPTIONS and READER_ANNOTATION_STYLE_LABELS in
 * reader-ui-constants.ts. Both engines already share them.
 *
 * They matter to the layout because a mark is not one thing: it is a span of
 * text plus a style plus a colour plus an optional note, and every surface that
 * touches a mark has to show or set all four. The shipped list showed style and
 * colour but had no way to change them; the shipped editor could change them but
 * could only be reached through a dialog.
 */
const ANNOTATION_COLORS: Array<{ id: string; label: string; dot: string; wash: string }> = [
  {
    id: "amber",
    label: "Amber",
    dot: "bg-surface-warning-base",
    wash: "bg-surface-warning-base/35",
  },
  { id: "mint", label: "Mint", dot: "bg-surface-success-base", wash: "bg-surface-success-base/35" },
  { id: "sky", label: "Sky", dot: "bg-surface-info-base", wash: "bg-surface-info-base/35" },
  {
    id: "rose",
    label: "Rose",
    dot: "bg-surface-critical-base",
    wash: "bg-surface-critical-base/30",
  },
]

const ANNOTATION_STYLES = [
  { id: "highlight", label: "Highlight" },
  { id: "underline", label: "Underline" },
  { id: "squiggly", label: "Squiggly" },
  { id: "strikethrough", label: "Strike" },
]

function annotationColor(id: string) {
  return ANNOTATION_COLORS.find((option) => option.id === id) ?? ANNOTATION_COLORS[0]
}

type MarkEntry = {
  id: string
  kind: "highlight" | "bookmark"
  excerpt: string
  note?: string
  position: string
  when: string
  color?: string
  style?: string
}

/**
 * One list, in document order. No tabs.
 *
 * The tabbed version made you choose a category before you could look, and the
 * category is not how anyone remembers a mark — you remember roughly where in
 * the book it was and roughly what it said. A bookmark is just a mark with no
 * text, so it sits in the same list with a different glyph and costs nothing.
 * macOS Books does exactly this, and it is why its list reads at a glance.
 */
const MARKS: MarkEntry[] = [
  {
    id: "m1",
    kind: "highlight",
    excerpt:
      "Grammar came first, because grammar was the gate; and behind the gate stood rhetoric.",
    position: "18%",
    when: "Today",
    color: "amber",
    style: "highlight",
  },
  {
    id: "m2",
    kind: "bookmark",
    excerpt: "2 · The Cathedral Schools",
    position: "24%",
    when: "Today",
  },
  {
    id: "m3",
    kind: "highlight",
    excerpt: "What changed was not the list but the reason given for it.",
    note: "This is the thesis — quote it.",
    position: "29%",
    when: "Today",
    color: "mint",
    style: "underline",
  },
  {
    id: "m4",
    kind: "highlight",
    excerpt: "Now it was defended as preparation for public life — for the letter, the embassy.",
    position: "31%",
    when: "Yesterday",
    color: "sky",
    style: "highlight",
  },
  {
    id: "m5",
    kind: "bookmark",
    excerpt: "4 · The Renaissance Schoolmasters",
    position: "32%",
    when: "Yesterday",
  },
]

/**
 * A row is a target, and the two things you do to a mark hang off its right edge.
 *
 * The merged list first shipped read-only, which quietly dropped something both
 * panels it replaces already had: ReaderAnnotationsPanel puts Edit and Delete on
 * every row behind `group-hover`, and ReaderBookmarksPanel puts Delete on every
 * row the same way. Merging two lists is not licence to drop what was in them,
 * so the row carries both — revealed on hover and pointer, permanent on focus,
 * so the keyboard never has to hunt for a control the mouse gets for free.
 */
function MarkRow(props: { mark: MarkEntry }) {
  const mark = props.mark
  const color = mark.color ? annotationColor(mark.color) : undefined
  const style = ANNOTATION_STYLES.find((option) => option.id === mark.style)

  return (
    <div className="group flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 hover:bg-surface-base-hover">
      {mark.kind === "highlight" ? (
        <span
          aria-hidden
          className={cn("mt-1 size-2.5 shrink-0 rounded-full", color?.dot)}
          title={color?.label}
        />
      ) : (
        <BookmarkIcon className="mt-0.5 size-3.5 shrink-0 text-icon-weak-base" />
      )}

      <button type="button" className="min-w-0 flex-1 text-left">
        {style ? (
          <span className="block text-[10px] uppercase tracking-wide text-text-weaker">
            {style.label}
          </span>
        ) : null}
        <span
          className={cn(
            "mt-0.5 block text-xs leading-snug",
            mark.kind === "highlight"
              ? cn("line-clamp-2 rounded-sm text-text-base", color?.wash)
              : "truncate text-text-weak",
          )}
        >
          {mark.excerpt}
        </span>
        {mark.note ? (
          <span className="mt-1 block text-[11px] leading-snug text-text-weak">{mark.note}</span>
        ) : null}
        <span className="mt-1 block text-[10px] text-text-weaker">{mark.when}</span>
      </button>

      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-[10px] text-text-weaker">{mark.position}</span>
        <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {mark.kind === "highlight" ? (
            <Button type="button" size="icon-xs" variant="ghost" aria-label="Edit note">
              <PencilLineIcon className="size-3.5" />
            </Button>
          ) : null}
          <Button type="button" size="icon-xs" variant="ghost" aria-label="Delete">
            <Trash2Icon className="size-3.5" />
          </Button>
        </span>
      </span>
    </div>
  )
}

function MarksPanel(props: { onClose: () => void }) {
  return (
    <MockPanel title="Highlights & notes" align="start" onClose={props.onClose} width={320}>
      <div className="flex flex-col gap-1">
        {MARKS.map((mark) => (
          <MarkRow key={mark.id} mark={mark} />
        ))}
      </div>
    </MockPanel>
  )
}

// ── Search ────────────────────────────────────────────────────────────────

type SearchHit = {
  id: string
  section?: string
  label: string
  pre: string
  match: string
  post: string
}

const SEARCH_HITS: SearchHit[] = [
  {
    id: "s1",
    section: "2 · The Cathedral Schools",
    label: "24%",
    pre: "the cathedral schools taught the ",
    match: "trivium",
    post: " before anything else, and taught it slowly.",
  },
  {
    id: "s2",
    label: "26%",
    pre: "a boy who had finished the ",
    match: "trivium",
    post: " was not yet educated; he was merely equipped.",
  },
  {
    id: "s3",
    section: "3 · Scholastic Method",
    label: "31%",
    pre: "the ",
    match: "trivium",
    post: " survived the schoolmen because it was useful to them, not because it was loved.",
  },
  {
    id: "s4",
    label: "34%",
    pre: "against the ",
    match: "trivium",
    post: " they set the quadrivium, and lost the argument for three hundred years.",
  },
]

/**
 * SEARCH_MATCH_OPTIONS replaces three labelled Switches with three mono toggles.
 *
 * The shipped panel spends a full row on `Switch + "Aa"`, `Switch + "\b"`,
 * `Switch + "ä"` — six objects to carry three booleans, in a panel that also has
 * to hold a query, a scope, a count, a progress bar and a result list. A switch
 * is the right control for a preference you set once in a settings surface; for
 * a modifier you flick on and off inside a search it is three times the width of
 * the thing it modifies.
 *
 * These are states, not actions, so unlike A−/A+ they genuinely are a
 * ToggleGroup — `type="multiple"`, because the three are independent. Which
 * makes this panel the one place in the reader where the fixed on-state has to
 * carry three simultaneous selections; see docs/known-issues.
 */
const SEARCH_MATCH_OPTIONS = [
  { id: "case", glyph: "Aa", label: "Match case" },
  { id: "word", glyph: "ab|", label: "Whole words" },
  { id: "diacritics", glyph: "ä", label: "Match diacritics" },
]

type SearchState = "results" | "running" | "empty"

/**
 * Search, which the proposal had left as an icon with nothing behind it.
 *
 * It opens on the left because its trigger is on the left, and it is the one
 * panel with a live async state: foliate walks the spine section by section and
 * pdf.js walks the page text, both reporting progress, so a long document can
 * sit mid-search for several seconds. That state is drawn here rather than
 * described, because a panel that changes shape while you wait is the one thing
 * a static mock will not tell you about.
 *
 * Scope is two segments rather than a Select. There are exactly two scopes and
 * there will only ever be two — whole document, current section — and a Select
 * spends a popover to choose between two things that fit side by side. Section
 * disables itself when the document has no table of contents, which is the
 * `canSearchSection` gate the PDF reader already passes and the EPUB reader
 * silently does not.
 */
function SearchPanelBody(props: { state: SearchState; canSearchSection?: boolean }) {
  const running = props.state === "running"
  const empty = props.state === "empty"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border-base bg-background-base px-2.5 py-2">
          <SearchIcon className="size-3.5 shrink-0 text-icon-base" />
          <span className={cn("truncate text-xs", empty ? "text-text-weaker" : "text-text-base")}>
            {empty ? "Search this document" : "trivium"}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous result"
          disabled={empty}
        >
          <ChevronUpIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Next result"
          disabled={empty}
        >
          <ChevronDownIcon className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value="document"
          aria-label="Search scope"
          className="flex-1"
        >
          <ToggleGroupItem value="document" className="min-w-0 flex-1">
            <span className="truncate">Document</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="section"
            className="min-w-0 flex-1"
            disabled={props.canSearchSection === false}
          >
            <span className="truncate">Section</span>
          </ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={["case"]}
          aria-label="Match options"
        >
          {SEARCH_MATCH_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.id}
              value={option.id}
              aria-label={option.label}
              title={option.label}
              className="font-mono text-[11px]"
            >
              {option.glyph}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {running ? (
        <div className="flex items-center gap-2">
          <div
            role="progressbar"
            aria-label="Search progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={64}
            className="h-0.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-weak"
          >
            <div className="h-full w-[64%] bg-surface-interactive-base" />
          </div>
          <span className="shrink-0 font-mono text-[10px] text-text-weaker">searching…</span>
        </div>
      ) : null}

      {empty ? (
        <p className="py-8 text-center text-xs leading-relaxed text-text-weaker">
          Search inside the current document.
        </p>
      ) : (
        /* The list is a different kind of thing from the controls above it, so it
           gets a rule and real space rather than sitting straight underneath. */
        <div className="mt-1 flex flex-col border-t border-border-weaker-base pt-3">
          <div className="flex items-baseline justify-between pb-1.5">
            <PanelLabel>{running ? "Found so far" : "Results"}</PanelLabel>
            <span className="font-mono text-[10px] tabular-nums text-text-weaker">
              {running ? "12" : "34"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {(running ? SEARCH_HITS.slice(0, 2) : SEARCH_HITS).map((hit, index) => (
              <div key={hit.id} className="flex flex-col">
                {hit.section ? (
                  <p className="px-1 pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-wide text-text-weaker first:pt-0">
                    {hit.section}
                  </p>
                ) : null}
                <button
                  type="button"
                  aria-current={index === 0 ? "true" : undefined}
                  className={cn(
                    "w-full rounded-md px-2.5 py-2 text-left hover:bg-surface-base-hover",
                    index === 0 && SELECTED_ROW,
                  )}
                >
                  <span className="mb-1 block font-mono text-[10px] text-text-weaker">
                    {hit.label}
                  </span>
                  <span className="line-clamp-3 block text-xs leading-relaxed text-text-weak">
                    {hit.pre}
                    <strong className="font-semibold text-text-strong">{hit.match}</strong>
                    {hit.post}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SearchPanel(props: { engine: ReaderEngine; onClose: () => void }) {
  return (
    <MockPanel title="Search" align="start" onClose={props.onClose} width={340}>
      <SearchPanelBody state="results" canSearchSection={props.engine === "pdf"} />
    </MockPanel>
  )
}

// ── Surface overlays ──────────────────────────────────────────────────────

/**
 * The floating shell every over-the-text surface shares.
 *
 * These are the only surfaces in the reader that are not anchored to a band —
 * they land next to a span of text — so they get one shape, one radius and one
 * shadow, and nothing else in the design is allowed to look like this. That is
 * how a reader tells "this is about the thing I just touched" apart from "this
 * is about the document".
 */
function FloatingSurface(props: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex flex-col rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha shadow-xl",
        props.className,
      )}
    >
      {props.children}
    </div>
  )
}

/**
 * `lg` is for the selection toolbar, where the dots are the primary action and
 * not a setting. A dot that carries a ring needs room for the ring: at size-5
 * with a 1.5 gap the selected ring very nearly touches its neighbours, so the
 * row reads as one striped object rather than four targets.
 */
function ColorDots(props: {
  selected?: string
  onSelect?: (id: string) => void
  size?: "default" | "lg"
}) {
  const large = props.size === "lg"
  return (
    <span className={cn("flex items-center", large ? "gap-2.5" : "gap-2")}>
      {ANNOTATION_COLORS.map((color) => (
        <button
          key={color.id}
          type="button"
          aria-label={color.label}
          title={color.label}
          onClick={() => props.onSelect?.(color.id)}
          className={cn(
            "shrink-0 rounded-full transition-transform hover:scale-110",
            large ? "size-6" : "size-5",
            color.dot,
            props.selected === color.id &&
              "ring-2 ring-border-interactive-base ring-offset-2 ring-offset-surface-raised-stronger-non-alpha",
          )}
        />
      ))}
    </span>
  )
}

/**
 * Selection toolbar — the highest-frequency surface in the whole reader, and the
 * one the proposal had not drawn at all.
 *
 * Shipped, it is Copy · Highlight · Note · Search, where Highlight applies the
 * default amber and any other colour costs three more clicks: highlight, reopen
 * it, choose. Nobody highlights in one colour on purpose; they highlight in one
 * colour because the second one is expensive.
 *
 * So the colours ARE the highlight button. Press a dot and the mark exists in
 * that colour — one click for the thing people do most, four ways. The three
 * remaining actions sit behind a space boundary, because they act on the
 * selection rather than making a mark of it. This is Books' shape, and it is
 * the same rule the bar already follows: what you do every minute is one press,
 * grouping is carried by space and not by a container.
 *
 * It is deliberately the roomiest object in the reader, and the only one that
 * gets a full pill. Everything else here is chrome you look past; this appears
 * under your own finger, on top of the prose, for one decision, and then leaves.
 * Density is a virtue in a bar you see for hours and a defect in a target you
 * see for two seconds — so 9px targets, dots at 24 with room for their ring, and
 * a full 12px of air inside the shell.
 */
function SelectionToolbar() {
  return (
    <FloatingSurface className="flex-row items-center rounded-full px-3.5 py-2.5">
      <ColorDots selected="amber" size="lg" />
      <span aria-hidden className="mx-3 h-7 w-px shrink-0 bg-border-weak-base" />
      <span className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Add note"
          title="Add note"
          className="size-9 rounded-full"
        >
          <PencilLineIcon className="size-[18px]" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Copy"
          title="Copy  ⌘C"
          className="size-9 rounded-full"
        >
          <CopyIcon className="size-[18px]" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Search for this"
          title="Search for this"
          className="size-9 rounded-full"
        >
          <SearchIcon className="size-[18px]" />
        </Button>
      </span>
    </FloatingSurface>
  )
}

/**
 * Tapping a mark that already exists. Shipped, this popover can only edit or
 * delete — changing the colour means opening the editor dialog, which is a
 * modal, for a one-click change.
 *
 * The dots are here for the same reason they are in the selection toolbar, and
 * they are the same dots: recolouring a mark and making one are the same
 * gesture, so they must not be two different controls.
 */
function AnnotationPopover() {
  return (
    <FloatingSurface className="w-[300px] gap-3 p-4">
      <p className="line-clamp-3 rounded-sm bg-surface-warning-base/35 text-xs leading-relaxed text-text-base">
        What changed was not the list but the reason given for it.
      </p>
      <p className="text-[11px] leading-relaxed text-text-weak">This is the thesis — quote it.</p>
      <div className="flex items-center justify-between gap-3">
        <ColorDots selected="amber" size="lg" />
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Edit note"
            className="size-9 rounded-full"
          >
            <PencilLineIcon className="size-[18px]" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete"
            className="size-9 rounded-full"
          >
            <Trash2Icon className="size-[18px]" />
          </Button>
        </span>
      </div>
    </FloatingSurface>
  )
}

/**
 * The note editor. Shipped it is a Dialog — a modal, over the page, for typing a
 * sentence about the page you can no longer see.
 *
 * Here it is the same floating surface as the popover it grows out of, anchored
 * to the mark, so the text stays visible while you write about it. Style is a
 * segmented row because the four are exclusive; colour is the same dot row as
 * everywhere else. Delete sits apart from Save, at the other end, because the
 * two are not peers.
 */
function AnnotationEditor() {
  return (
    <FloatingSurface className="w-[330px] gap-3 p-4">
      <p className="line-clamp-2 rounded-sm bg-surface-warning-base/35 text-xs leading-snug text-text-base">
        What changed was not the list but the reason given for it.
      </p>

      <div className="min-h-[68px] rounded-md border border-border-base bg-background-base px-2.5 py-2">
        <span className="text-xs leading-snug text-text-base">This is the thesis — quote it.</span>
      </div>

      <PanelRow label="Style">
        <PanelSegments
          activeId="highlight"
          options={ANNOTATION_STYLES.map((style) => ({ id: style.id, label: style.label }))}
        />
      </PanelRow>

      <PanelRow label="Colour">
        <ColorDots selected="amber" />
      </PanelRow>

      <div className="mt-1 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" aria-label="Delete annotation">
          <Trash2Icon className="size-4" />
          Delete
        </Button>
        <span className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm">
            Cancel
          </Button>
          <Button type="button" size="sm">
            Save
          </Button>
        </span>
      </div>
    </FloatingSurface>
  )
}

/**
 * The title's hover card. Small, but it is the only place a document's author,
 * publisher and language are ever shown, and the proposal had reduced the title
 * to a plain span — which would have deleted the surface silently.
 */
function MetadataCard(props: { engine: ReaderEngine }) {
  const rows =
    props.engine === "pdf"
      ? [
          ["Author", "R. Whitfield"],
          ["Producer", "pdfTeX 3.14"],
          ["Pages", "312"],
          ["Created", "March 2019"],
        ]
      : [
          ["Author", "R. Whitfield"],
          ["Publisher", "Ashgrove Press"],
          ["Language", "English"],
          ["Published", "2019"],
        ]

  return (
    <FloatingSurface className="w-[280px] gap-2.5 p-4">
      <div className="flex items-start gap-2.5">
        <FileTextIcon className="mt-0.5 size-4 shrink-0 text-icon-weak-base" />
        <span className="min-w-0">
          <span className="block text-xs font-medium leading-snug text-text-strong">
            {DOCUMENT[props.engine].title}
          </span>
          <span className="mt-0.5 block font-mono text-[10px] text-text-weaker">
            {props.engine === "pdf" ? "PDF · 4.2 MB" : "EPUB 3 · 1.1 MB"}
          </span>
        </span>
      </div>
      <dl className="flex flex-col gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 text-[11px]">
            <dt className="shrink-0 text-text-weaker">{label}</dt>
            <dd className="min-w-0 truncate text-text-weak">{value}</dd>
          </div>
        ))}
      </dl>
    </FloatingSurface>
  )
}

// ── States the reader is in before it is a reader ─────────────────────────

/**
 * Five states that are not "reading", and that the proposal had not drawn.
 *
 * They are grouped here because they share one rule: none of them may move the
 * bands. A document that fails to open, is encrypted, or falls back to a layout
 * it did not ask for must not reflow the chrome around it — the reader has to
 * look like the same object in all five, or every failure reads as a different
 * application. Shipped, the two engines already disagree here: the EPUB "Opening…"
 * pill is a square-cornered inset badge, the PDF's is a rounded-full one, and the
 * PDF alone has a fallback banner that pushes the surface down by its own height.
 */
function StatusPill(props: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-weak-base bg-surface-raised-stronger-non-alpha/90 px-2.5 py-1 text-[11px] text-text-weaker shadow-sm backdrop-blur">
      {props.children}
    </span>
  )
}

function CenteredState(props: { icon: ReactNode; title: string; body: string; action?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <span className="text-icon-weak-base">{props.icon}</span>
      <span className="text-xs font-medium text-text-base">{props.title}</span>
      <span className="max-w-[30ch] text-[11px] leading-relaxed text-text-weaker">
        {props.body}
      </span>
      {props.action ? (
        <Button type="button" variant="outline" size="sm" className="mt-1">
          {props.action}
        </Button>
      ) : null}
    </div>
  )
}

function LoadingState() {
  return (
    <StatusPill>
      <Loader2Icon className="size-3 animate-spin motion-reduce:animate-none" />
      Opening…
    </StatusPill>
  )
}

function EmptyState() {
  return (
    <CenteredState
      icon={<FileTextIcon className="size-6" />}
      title="Nothing open"
      body="Open a book or a PDF from the Explorer, or drop one here."
    />
  )
}

function ErrorState() {
  return (
    <CenteredState
      icon={<TriangleAlertIcon className="size-6 text-icon-critical-base" />}
      title="This document would not open"
      body="The file may be damaged, or it may not be an EPUB after all."
      action="Try again"
    />
  )
}

/**
 * PDF only. An encrypted file cannot render at all until this is answered, so it
 * is the one surface allowed to sit in the middle of the reading area — and it
 * is deliberately not a modal, because a modal over a blank page is a dialog
 * about nothing.
 */
function PasswordState() {
  return (
    <FloatingSurface className="w-[300px] gap-3 p-4">
      <div className="flex items-start gap-2.5">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-icon-weak-base" />
        <span className="min-w-0">
          <span className="block text-xs font-medium text-text-strong">This PDF is protected</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-text-weaker">
            Enter the document's open password to read it.
          </span>
        </span>
      </div>
      <div className="rounded-md border border-border-base bg-background-base px-2.5 py-1.5">
        <span className="font-mono text-xs tracking-widest text-text-weaker">••••••••</span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm">
          Cancel
        </Button>
        <Button type="button" size="sm">
          Unlock
        </Button>
      </div>
    </FloatingSurface>
  )
}

/**
 * PDF only. Raised when a requested layout cannot be honoured — two-up on a
 * document whose page sizes disagree, most often. Shipped it is a full-width
 * strip between the header and the surface that pushes the page down by its own
 * height, which means an advisory notice moves the thing you are reading.
 *
 * Here it is a pill in the surface, in the same shape as "Opening…", because it
 * is the same class of thing: a transient remark about the document that must
 * not cost the document any room.
 */
function FallbackNotice() {
  return (
    <StatusPill>
      <TriangleAlertIcon className="size-3 text-icon-warning-base" />
      Two-up needs pages of one size — showing single
    </StatusPill>
  )
}

// ── Direction · Original (faithful reproduction) ──────────────────────────

const ORIGINAL_READER_SHORTCUTS = {
  epub: [
    { keys: "Ctrl/Cmd + F", label: "Open search" },
    { keys: "Ctrl/Cmd + L", label: "Open location and landmarks" },
    { keys: "Ctrl/Cmd + D", label: "Toggle bookmark at current location" },
    { keys: "Left / Right", label: "Turn pages in paginated and fixed-layout views" },
    { keys: "Up / Down", label: "Move through the current section in section scroll" },
    { keys: "Alt + Left", label: "History back" },
    { keys: "Alt + Right", label: "History forward" },
    { keys: "Ctrl/Cmd + ,", label: "Open reader preferences" },
    { keys: "?", label: "Open keyboard help" },
    { keys: "Esc", label: "Close active reader overlays" },
  ],
  pdf: [
    { keys: "Ctrl/Cmd + F", label: "Search this PDF" },
    { keys: "Ctrl/Cmd + D", label: "Toggle bookmark" },
    { keys: "Ctrl/Cmd + L", label: "Open page navigation" },
    { keys: "Ctrl/Cmd + +/-/0", label: "Zoom in, out, or reset" },
    { keys: "Shift + Left / Right", label: "Pan across a zoomed page" },
    { keys: "Page Up / Page Down", label: "Previous or next page" },
    { keys: "Alt + Left / Right", label: "Reading history" },
    { keys: "Ctrl/Cmd + ,", label: "Open reader preferences" },
    { keys: "?", label: "Open keyboard help" },
    { keys: "Esc", label: "Close reader overlays" },
  ],
} satisfies Record<ReaderEngine, Array<{ keys: string; label: string }>>

const ORIGINAL_LANDMARKS = [
  { id: "cover", label: "Cover", type: "cover" },
  { id: "contents", label: "Contents", type: "toc" },
  { id: "bibliography", label: "Bibliography", type: "bibliography" },
  { id: "index", label: "Index", type: "index" },
] as const

const ORIGINAL_PAGE_LABELS = ["1", "12", "48", "84", "126"] as const

function OriginalDialogShell(props: { title: string; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid w-full gap-4 rounded-xl bg-surface-raised-stronger-non-alpha p-4 text-sm ring-1 ring-border-weak-base",
        props.className,
      )}
    >
      <h3 className="text-base font-medium leading-none text-text-base">{props.title}</h3>
      {props.children}
    </div>
  )
}

function OriginalHelpSurface(props: { engine: ReaderEngine }) {
  return (
    <OriginalDialogShell title="Keyboard shortcuts" className="max-w-sm">
      <dl className="divide-y divide-border-base">
        {ORIGINAL_READER_SHORTCUTS[props.engine].map((shortcut) => (
          <div key={shortcut.keys} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-sm text-text-weak">{shortcut.label}</dt>
            <dd>
              <kbd className="rounded-md bg-surface-weak px-1.5 py-0.5 font-mono text-xs text-text-weaker">
                {shortcut.keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </OriginalDialogShell>
  )
}

function OriginalLocationSurface() {
  return (
    <OriginalDialogShell title="Location & navigation" className="max-w-lg">
      <div className="grid grid-cols-3 divide-x divide-border-base/40 rounded border border-border-base/40 bg-surface-weak/20">
        {[
          { label: "Chapter", value: "4 · The Renaissance Schoolmasters" },
          { label: "Page", value: "84" },
          { label: "Progress", value: "32%" },
        ].map((item) => (
          <div key={item.label} className="px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">
              {item.label}
            </div>
            <div className="mt-0.5 truncate text-[12px] font-medium text-text-base">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">Jump to CFI</div>
        <div className="flex items-center gap-1.5">
          <Input
            readOnly
            value="epubcfi(/6/18[chapter-4]!/4/2/14)"
            aria-label="CFI target"
            className="h-8 flex-1 font-mono text-[11px]"
          />
          <Button variant="ghost" size="icon-sm" aria-label="Copy CFI" className="size-8 shrink-0">
            <CopyIcon />
          </Button>
          <Button size="sm" className="h-8 shrink-0">
            Go
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">Chapter</div>
          <Select>
            <SelectTrigger size="sm" className="w-full text-[11px]">
              <SelectValue placeholder="Jump to…" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {["Cover", "The Cathedral Schools", "The Renaissance Schoolmasters"].map(
                  (chapter) => (
                    <SelectItem key={chapter} value={chapter}>
                      {chapter}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">Page</div>
          <Select>
            <SelectTrigger size="sm" className="w-full text-[11px]">
              <SelectValue placeholder="Jump to…" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ORIGINAL_PAGE_LABELS.map((page) => (
                  <SelectItem key={page} value={page}>
                    {page}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">Landmarks</div>
          <span className="font-mono text-[10px] text-text-weaker">
            {ORIGINAL_LANDMARKS.length}
          </span>
        </div>
        <ScrollArea className="h-48 rounded border border-border-base/40">
          <div className="py-1">
            {ORIGINAL_LANDMARKS.map((landmark) => (
              <button
                key={landmark.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-weak/60"
              >
                <div className="min-w-0">
                  <div className="truncate text-[12px] text-text-base">{landmark.label}</div>
                  <div className="truncate text-[10px] text-text-weaker">{landmark.type}</div>
                </div>
                <ArrowRightIcon className="size-3.5 shrink-0 text-text-weaker" />
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </OriginalDialogShell>
  )
}

function OriginalPageTurnSurface(props: { engine: ReaderEngine }) {
  const isPdf = props.engine === "pdf"
  return (
    <div className="relative flex h-64 min-h-0 w-full max-w-lg overflow-hidden rounded-lg border border-border-weak-base">
      <ReadingSurface engine={props.engine} scrollMap={false} />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Previous page"
        className={cn(
          "absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-surface-raised-base shadow-sm",
          !isPdf &&
            "bg-surface-raised-base/80 text-text-weak opacity-70 backdrop-blur-sm transition-[opacity,transform] duration-150 hover:opacity-100 active:scale-95 motion-reduce:transition-none",
        )}
      >
        <ArrowLeftIcon />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Next page"
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-surface-raised-base shadow-sm",
          !isPdf &&
            "bg-surface-raised-base/80 text-text-weak opacity-70 backdrop-blur-sm transition-[opacity,transform] duration-150 hover:opacity-100 active:scale-95 motion-reduce:transition-none",
        )}
      >
        <ArrowRightIcon />
      </Button>
    </div>
  )
}

function OriginalOnlyInventory(props: { engines: ReaderEngine[] }) {
  const includesEpub = props.engines.includes("epub")
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-text-strong">Before only · previously missing</h2>
        <p className="mt-1 max-w-4xl text-xs leading-relaxed text-text-weak">
          Faithful shipped surfaces, shown for inventory only. Nothing here is a proposal, and none
          of these controls has been silently folded into the redesigned surfaces below.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        {props.engines.map((engine) => (
          <article key={`${engine}-turn`} className="flex w-full max-w-lg flex-col gap-3">
            <div>
              <h3 className="text-xs font-medium text-text-base">
                Page-turn overlay · {ENGINE_LABEL[engine]}
              </h3>
              <p className="mt-1 text-xs text-text-weaker">
                Shown unchanged in the shipped reader.
              </p>
            </div>
            <OriginalPageTurnSurface engine={engine} />
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        {props.engines.map((engine) => (
          <article key={`${engine}-help`} className="flex w-full max-w-sm flex-col gap-3">
            <div>
              <h3 className="text-xs font-medium text-text-base">
                Help dialog · {ENGINE_LABEL[engine]}
              </h3>
              <p className="mt-1 text-xs text-text-weaker">
                The existing keyboard-shortcuts surface, not merely its View-row trigger.
              </p>
            </div>
            <OriginalHelpSurface engine={engine} />
          </article>
        ))}

        {includesEpub ? (
          <article className="flex w-full max-w-lg flex-col gap-3">
            <div>
              <h3 className="text-xs font-medium text-text-base">Location & navigation · EPUB</h3>
              <p className="mt-1 text-xs text-text-weaker">
                This shipped dialog contains the retained advanced tools: CFI jump/copy, the
                separate page-list selector, and landmarks.
              </p>
            </div>
            <OriginalLocationSurface />
          </article>
        ) : null}
      </div>
    </section>
  )
}

/**
 * Copied control-for-control out of foliate-reader.tsx:1271-1612 and
 * pdf-reader.tsx:1365-1674, including the class-level disagreements: the PDF
 * borders, the EPUB opacity ladder, the two scrubbers, the md: gate on the PDF
 * title. Nothing here is exaggerated for effect.
 */
function OriginalReader(props: { engine: ReaderEngine; pins: boolean; scrollMap: boolean }) {
  const isPdf = props.engine === "pdf"
  const doc = DOCUMENT[props.engine]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-base">
      {/* header — PDF has border-b, EPUB has none (pin 9) */}
      <header
        className={cn("relative shrink-0", isPdf ? "z-20 border-b border-border-base/40" : "z-[2]")}
      >
        <Pinned n={6} show={props.pins}>
          <div className="absolute inset-x-0 top-0 h-px bg-border-base/30">
            <div
              className={cn(
                "h-full",
                isPdf ? "bg-text-interactive-base" : "bg-text-interactive-base/60",
              )}
              style={{ width: "32%" }}
            />
          </div>
        </Pinned>

        <div className="relative flex h-11 min-w-0 items-center gap-1 px-2">
          <BarIcon icon={TableOfContentsIcon} label="Table of contents" />
          <BarIcon icon={BookmarkIcon} label="Bookmarks" />
          <BarIcon icon={PencilLineIcon} label="Annotations" />

          <div className="min-w-0 flex-1" />

          {/* absolute centred overlay — EPUB px-48 always on, PDF px-72 md-gated (pin 4) */}
          <div
            className={cn(
              "pointer-events-none absolute inset-0 items-center justify-center",
              isPdf ? "hidden px-16 md:flex" : "flex px-24",
            )}
          >
            <Pinned n={4} show={props.pins}>
              <span className="pointer-events-auto truncate text-xs font-medium text-text-base">
                {doc.title}
              </span>
            </Pinned>
          </div>

          {isPdf ? (
            <Pinned n={3} show={props.pins}>
              <span className="flex items-center">
                <BarIcon icon={MinusIcon} label="Zoom out" />
                <button
                  type="button"
                  className="min-w-12 px-1 text-center font-mono text-xs text-text-weaker"
                >
                  100%
                </button>
                <BarIcon icon={PlusIcon} label="Zoom in" />
              </span>
            </Pinned>
          ) : null}

          <BarIcon icon={SearchIcon} label="Search in document" />
          {isPdf ? (
            <BarIcon icon={ALargeSmallIcon} label="Reader preferences" />
          ) : (
            <Pinned n={3} show={props.pins}>
              <BarIcon icon={ALargeSmallIcon} label="Reader preferences" />
            </Pinned>
          )}
          <Pinned n={1} show={props.pins}>
            <BarIcon icon={BookmarkIcon} label="Add bookmark" />
          </Pinned>
          <Pinned n={2} show={props.pins}>
            <BarIcon icon={EllipsisIcon} label="Reader actions" />
          </Pinned>
        </div>
      </header>

      <ReadingSurface engine={props.engine} scrollMap={props.scrollMap} />

      {/* footer — PDF has border-t, EPUB has none (pin 9); typography diverges (pin 8) */}
      <footer
        className={cn(
          "flex h-10 shrink-0 flex-col justify-center px-5",
          isPdf ? "z-20 border-t border-border-base/40" : "z-30",
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Go back in reading history"
            className="text-text-weaker"
          >
            <Undo2Icon className="size-3" />
          </Button>

          <Pinned n={5} show={props.pins}>
            {isPdf ? (
              <div className="min-w-0 truncate text-xs text-text-weaker">
                <span>{doc.section}</span>
                <span aria-hidden className="px-2">
                  ·
                </span>
                <span className="font-mono">{doc.position}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-hidden text-[9px] font-medium uppercase tracking-tight text-text-weaker">
                <span className="shrink-0 font-mono opacity-40">4</span>
                <span className="max-w-[180px] truncate tracking-widest opacity-80">
                  {doc.section}
                </span>
                <span className="mx-0.5 leading-none tracking-widest opacity-30">•</span>
                <span className="shrink-0 font-mono opacity-50">{doc.position}</span>
              </div>
            )}
          </Pinned>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Go forward in reading history"
            className="text-text-weaker"
            disabled
          >
            <Redo2Icon className="size-3" />
          </Button>
        </div>

        <Pinned n={7} show={props.pins}>
          {isPdf ? (
            <div className="mt-0.5 h-1 w-full rounded-full bg-surface-weak">
              <div
                className="h-full rounded-full bg-text-interactive-base"
                style={{ width: "32%" }}
              />
            </div>
          ) : (
            <div className="relative mt-1 h-2 w-full">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-transparent" />
              <div
                className="absolute top-1/2 h-1.5 w-6 -translate-y-1/2 rounded-full bg-text-weaker/40"
                style={{ left: "32%" }}
              />
            </div>
          )}
        </Pinned>
      </footer>

      {props.pins ? (
        <div className="pointer-events-none absolute inset-x-0 top-11 z-30 flex justify-center">
          <span className="rounded-b bg-surface-critical-base px-2 py-0.5 text-[9px] font-medium text-text-on-critical-base">
            {props.engine === "epub"
              ? "pin 10 · global scrollbar restyle"
              : "pin 9 · borders differ"}
          </span>
        </div>
      ) : null}
    </div>
  )
}

// ── Direction · Proposed (the one design) ────────────────────────────────

type PanelId = "contents" | "goto" | "view" | "marks" | "search" | null

/**
 * Two bands with one job each, and a third state where neither exists.
 *
 * TOP — actions only. Nothing here is a readout, so nothing here twitches while
 * you read.
 *
 *   [ ≡ │ ✎ ]  🔍      title      [ ⊖ │ 1:1 │ ⊕ ]ᵖᵈᶠ  Aa  🔖  │  💡
 *
 * Three targets a side on an EPUB, and one track a side, so the title lands in
 * a bar that is actually centred rather than one that merely centres its text.
 * Contents and Notes share a track because they are the document's two lists and
 * both open on the left; Search stands alone because a query is not a browse.
 * Focus stands alone behind a divider because it is a mode, not an action.
 *
 * The title is up here and the chapter is not, because the title is identity —
 * it never changes — while the chapter is position, and position is a readout.
 *
 * BOTTOM — information only, and deliberately small: chapter · position. No
 * action lands here, ever. For an EPUB "page" is a fiction the layout invents,
 * and putting an invented number in the action bar next to Search and Bookmark
 * made the bar say two unrelated kinds of thing at once.
 *
 * FOCUS — the last button in the bar. Press it and both bands leave; one control
 * stays, top right, to bring them back. This is not a second design, it is this
 * design with the chrome withdrawn, which is why it is a button and not a mode
 * buried in preferences.
 */
function ProposedReader(props: {
  engine: ReaderEngine
  scrollMap: boolean
  dense: boolean
  /** Scrolled surfaces already show position in the scrollbar. See ProgressRail. */
  surfaceScrolls: boolean
}) {
  const [panel, setPanel] = useState<PanelId>(null)
  const [focus, setFocus] = useState(false)
  const toggle = (id: Exclude<PanelId, null>) => setPanel((current) => (current === id ? null : id))
  const isPdf = props.engine === "pdf"
  const doc = DOCUMENT[props.engine]

  if (focus) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface-base">
        <ReadingSurface engine={props.engine} scrollMap={props.scrollMap} roomy />

        <div className="absolute right-2 top-2 z-40">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Leave Focus"
            title="Leave Focus  ⌘.  ·  Esc"
            onClick={() => setFocus(false)}
            className="bg-surface-raised-stronger-non-alpha/85 text-text-strong shadow-sm backdrop-blur"
          >
            <IdeaIcon className="size-4" />
          </Button>
        </div>

        {/* In Focus the bottom band is gone, so a scroll-less surface has nothing
            left to say where it is — and only then does the pill earn its place. */}
        {props.surfaceScrolls ? null : (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
            <span className="rounded-full border border-border-weak-base bg-surface-raised-stronger-non-alpha/90 px-2.5 py-1 font-mono text-[10px] text-text-weaker shadow-sm backdrop-blur">
              {doc.position}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface-base">
      {/*
        Three peers a side on an EPUB, so the centred title is centred in fact
        and not just in text-align. Contents, Notes and Search are peers — three
        different ways to get somewhere — and none of them is more related to
        another than to the third, so none of them are paired.

        A PDF adds the zoom trio, flush, because a PDF genuinely has one control
        class an EPUB does not. That asymmetry is real; I would rather it read
        as one dense group on the right than be hidden by splitting a set across
        the two sides.
      */}
      <header className="relative z-20 flex h-11 shrink-0 items-center gap-1 border-b border-border-weak-base px-2">
        <BarIcon
          icon={TableOfContentsIcon}
          label="Contents"
          active={panel === "contents"}
          onClick={() => toggle("contents")}
        />
        <BarIcon
          icon={PencilLineIcon}
          label="Highlights & notes"
          active={panel === "marks"}
          onClick={() => toggle("marks")}
        />
        <BarIcon
          icon={SearchIcon}
          label="Search  ⌘F"
          active={panel === "search"}
          onClick={() => toggle("search")}
        />

        <span className="min-w-0 flex-1 truncate px-2 text-center text-xs font-medium text-text-base">
          {doc.title}
        </span>

        {/* Zoom is a page property, so it is in the bar — and only for the engine
            that has pages. Text size is a type property and is inside View. */}
        {isPdf ? <PdfZoomCluster /> : null}
        <span className={cn("flex shrink-0 items-center gap-1", isPdf && BAR_GROUP_GAP)}>
          <BarIcon
            icon={ALargeSmallIcon}
            label={isPdf ? "View" : "Text size & view"}
            active={panel === "view"}
            onClick={() => toggle("view")}
          />
          <BarIcon icon={BookmarkIcon} label="Bookmark here  ⌘D" />
        </span>
        <span className={BAR_GROUP_GAP}>
          <BarIcon icon={IdeaIcon} label="Focus  ⌘." onClick={() => setFocus(true)} />
        </span>
      </header>

      <ReadingSurface engine={props.engine} scrollMap={props.scrollMap} />

      {props.surfaceScrolls ? null : <ProgressRail value={32} engine={props.engine} />}

      <footer
        className={cn(
          "relative z-20 shrink-0",
          props.surfaceScrolls && "border-t border-border-weak-base",
        )}
      >
        <LocationStrip
          engine={props.engine}
          open={panel === "goto"}
          onToggle={() => toggle("goto")}
          dense={props.dense}
        />
      </footer>

      {panel === "contents" ? (
        <ContentsPanel engine={props.engine} onClose={() => setPanel(null)} />
      ) : null}
      {panel === "goto" ? <GoToPanel engine={props.engine} onClose={() => setPanel(null)} /> : null}
      {panel === "view" ? <ViewPanel engine={props.engine} onClose={() => setPanel(null)} /> : null}
      {panel === "marks" ? <MarksPanel onClose={() => setPanel(null)} /> : null}
      {panel === "search" ? (
        <SearchPanel engine={props.engine} onClose={() => setPanel(null)} />
      ) : null}
    </div>
  )
}

// ── Frame ────────────────────────────────────────────────────────────────

function ReaderFrame(props: {
  engine: ReaderEngine
  direction: Direction
  width: FrameWidth
  pins: boolean
  scrollMap: boolean
  flow: SurfaceFlow
}) {
  const dense = props.width === "docked"
  const fill = props.width === "fill"
  const surfaceScrolls = props.flow === "scrolled"
  const frameStyle =
    props.width === "fill"
      ? { height: FRAME_HEIGHT }
      : { width: FRAME_WIDTH_PX[props.width], height: FRAME_HEIGHT }
  return (
    <div className={cn("flex flex-col gap-2", fill ? "min-w-0 flex-1" : "shrink-0")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-text-strong">{ENGINE_LABEL[props.engine]}</span>
        <Badge variant="outline" className="text-[10px]">
          {FRAME_WIDTH_LABEL[props.width]}
        </Badge>
        {props.direction === "proposed" ? (
          <Badge variant="outline" className="text-[10px]">
            {FLOW_LABEL[props.engine][props.flow]}
            {surfaceScrolls ? " · no rail" : " · rail"}
          </Badge>
        ) : null}
      </div>
      <div
        data-component="reader"
        className="relative overflow-hidden rounded-lg border border-border-base shadow-sm"
        style={frameStyle}
      >
        {props.direction === "original" ? (
          <OriginalReader engine={props.engine} pins={props.pins} scrollMap={props.scrollMap} />
        ) : (
          <ProposedReader
            engine={props.engine}
            scrollMap={props.scrollMap}
            dense={dense}
            surfaceScrolls={surfaceScrolls}
          />
        )}
      </div>
    </div>
  )
}

// ── The View surface, flat ───────────────────────────────────────────────

/**
 * The whole consistency claim, without a click. Three columns because there are
 * three real states, not two — and the honest result is that only the first and
 * last blocks are shared. Everything between them is engine-specific because
 * the engines genuinely do different things, which is the argument for putting
 * the difference inside one container rather than spreading it across a menu, a
 * bar and a panel.
 */
function ViewSurfaceReview() {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-text-strong">
          The View surface, flat — all three states at once
        </h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-weak">
          Read down: <span className="font-medium text-text-base">Theme</span> and{" "}
          <span className="font-medium text-text-base">Reading</span> and{" "}
          <span className="font-medium text-text-base">Help</span> are identical in all three. The
          middle is not, and cannot be — the capability flags say so. What the proposal buys is that
          the difference is contained in one scrollable container instead of being split across a ⋯
          menu, a preferences popover and the bar.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        {(["epub", "epub-fixed", "pdf"] as ViewVariant[]).map((variant) => (
          <div key={variant} className="flex w-[330px] shrink-0 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-text-strong">
                {VIEW_VARIANT_LABEL[variant]}
              </span>
              <span className="font-mono text-[10px] text-text-weaker">
                {VIEW_VARIANT_CAPABILITY[variant]}
              </span>
            </div>
            <div className="rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha p-5 shadow-sm">
              <ViewPanelBody variant={variant} />
            </div>
            {/* Commentary lives out here, never inside the panel. Everything above
                this line is what a reader would actually see. */}
            <p className="text-[11px] leading-relaxed text-text-weaker">
              <span className="font-mono">
                {viewVariantEngine(variant) === "pdf" ? "pdf.js" : "foliate-js"}
              </span>{" "}
              · {VIEW_VARIANT_NOTE[variant]}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Every surface, flat ───────────────────────────────────────────────────

const ENGINE_TAG = {
  both: "both",
  epub: "epub only",
  pdf: "pdf only",
} satisfies Record<"both" | "epub" | "pdf", string>

/**
 * One tile per surface. The label and the engine tag sit above the frame and
 * the commentary sits below it, so nothing inside the border is anything but
 * what a reader would actually see — the same rule the View review follows.
 */
/**
 * Every tile in a group is the same width and its frame is the same height.
 *
 * The first pass sized each tile to its contents — five widths and five heights
 * in one row — and the result read as clutter no matter how well any single
 * surface was drawn. A gallery is a comparison, and a comparison needs a
 * constant: if the frames differ in size, the eye spends itself measuring the
 * frames instead of reading what is in them. So the frame is a fixed window and
 * the surface sits inside it at its own natural size, which also makes the real
 * width differences between panels visible instead of hidden by the tile hugging
 * each one.
 *
 * A panel taller than its window scrolls inside its own body, exactly as it will
 * in the reader — PanelShell already owns that overflow.
 */
type TileSize = { width: number; frame: number }

const PANEL_TILE: TileSize = { width: 372, frame: 500 }
const FLOATING_TILE: TileSize = { width: 372, frame: 300 }
const STATE_TILE: TileSize = { width: 372, frame: 240 }

function SurfaceTile(props: {
  name: string
  engine: "both" | "epub" | "pdf"
  note: string
  /** What it replaces in the shipped reader, so integration has a checklist. */
  replaces: string
  children: ReactNode
  size: TileSize
  /** Floating surfaces have no band to hang from, so they sit centred in the tile. */
  center?: boolean
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2.5" style={{ width: props.size.width }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-text-strong">{props.name}</span>
        <span
          className={cn(
            "shrink-0 font-mono text-[10px]",
            props.engine === "both" ? "text-text-weaker" : "text-icon-warning-base",
          )}
        >
          {ENGINE_TAG[props.engine]}
        </span>
      </div>
      <div
        className={cn(
          "flex justify-center overflow-hidden rounded-lg border border-border-weak-base bg-background-base p-5",
          props.center ? "items-center" : "items-start",
        )}
        style={{ height: props.size.frame }}
      >
        {props.children}
      </div>
      {/* flex-1 on the note, with the group stretching, drops every ↩ line onto
          one baseline instead of leaving them ragged under uneven paragraphs. */}
      <p className="flex-1 text-[11px] leading-relaxed text-text-weaker">{props.note}</p>
      <p className="font-mono text-[10px] leading-relaxed text-text-weaker">↩ {props.replaces}</p>
    </div>
  )
}

function SurfaceGroup(props: { title: string; caption: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-strong">
          {props.title}
        </h3>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-weak">{props.caption}</p>
      </div>
      <div className="flex flex-wrap items-stretch gap-x-6 gap-y-8">{props.children}</div>
    </section>
  )
}

/**
 * The gap this closes: the proposal had designed the bar and four panels, and
 * the integration check found eleven more surfaces the shipped readers have and
 * this design did not — search above all, which is the largest and most stateful
 * panel in the reader and had been left as an icon with nothing behind it.
 *
 * They are drawn here rather than inside the frame because most of them are
 * mutually exclusive at runtime: you cannot see the selection toolbar and the
 * annotation editor and the password prompt at once, so a frame can only ever
 * show one, and a review needs all of them side by side.
 */
function SurfaceGallery() {
  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="text-sm font-semibold text-text-strong">
          Every surface, flat — the eleven the frame cannot show at once
        </h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-weak">
          The reader is not a bar and four panels. It is a bar, six panels, four things that float
          over the text, and five states that are not reading — and the ones below the first row are
          exactly what the integration check found missing. Each tile names what it replaces in the
          shipped readers, so the swap is a checklist rather than a judgement call.
        </p>
      </div>

      <SurfaceGroup
        title="Bar-anchored panels"
        caption="One trigger, one panel, one subject, opening on the side its trigger is on. Contents is structure, Go to is position, Search is a query, Marks is what you left behind — four different questions, so four panels rather than one panel with tabs."
      >
        <SurfaceTile
          name="Contents"
          engine="both"
          size={PANEL_TILE}
          note="Structure only. It does not repeat the jump field, and Go to does not repeat the chapter list."
          replaces="ReaderTocPopover · reader-toc-popover.tsx"
        >
          <PanelShell title="Contents" width={280} className="max-h-full">
            <div className="flex flex-col gap-0.5">
              {CONTENTS_ENTRIES.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={cn(
                    "truncate rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface-base-hover",
                    entry === DOCUMENT.epub.section ? SELECTED_ROW : "text-text-weak",
                  )}
                >
                  {entry}
                </button>
              ))}
            </div>
          </PanelShell>
        </SurfaceTile>

        <SurfaceTile
          name="Search · results"
          engine="both"
          size={PANEL_TILE}
          note="Scope is two segments, not a Select — there are two scopes and there will only ever be two. The three match modifiers are mono toggles rather than three labelled Switches, which is six objects for three booleans in the busiest panel in the reader."
          replaces="ReaderSearchPanel + ReaderSearchPopover · reader-search-panel.tsx"
        >
          <PanelShell title="Search" width={340} className="max-h-full">
            <SearchPanelBody state="results" />
          </PanelShell>
        </SurfaceTile>

        <SurfaceTile
          name="Search · running"
          engine="both"
          size={PANEL_TILE}
          note="The state a static mock will not tell you about. Foliate walks the spine section by section and pdf.js walks the page text, both reporting progress, so a long document sits here for seconds — results stream in under a live count while the bar fills."
          replaces="search.running / search.progress · the same panel, mid-flight"
        >
          <PanelShell title="Search" width={340} className="max-h-full">
            <SearchPanelBody state="running" />
          </PanelShell>
        </SurfaceTile>

        <SurfaceTile
          name="Search · at rest"
          engine="epub"
          size={PANEL_TILE}
          note="Section is disabled here because this document exposes no table of contents. That is the canSearchSection gate the PDF reader already passes and the EPUB reader never does — so today an EPUB offers a scope it cannot honour."
          replaces="READER_EMPTY_SEARCH_MESSAGE · reader-ui-constants.ts:40"
        >
          <PanelShell title="Search" width={340} className="max-h-full">
            <SearchPanelBody state="empty" canSearchSection={false} />
          </PanelShell>
        </SurfaceTile>

        <SurfaceTile
          name="Highlights & notes"
          engine="both"
          size={PANEL_TILE}
          note="One list in document order, no tabs — a bookmark is a mark with no text. Every row carries Edit and Delete on hover and on focus, which the read-only first draft had dropped from both panels it replaces."
          replaces="ReaderAnnotationsPanel + ReaderBookmarksPanel — two popovers, two triggers"
        >
          <PanelShell title="Highlights & notes" width={320} className="max-h-full">
            <div className="flex flex-col gap-1">
              {MARKS.map((mark) => (
                <MarkRow key={mark.id} mark={mark} />
              ))}
            </div>
          </PanelShell>
        </SurfaceTile>

        <SurfaceTile
          name="Go to"
          engine="both"
          size={PANEL_TILE}
          note="Position only, opened from the readout at the foot of the page — the thing you are trying to change is the thing you press. It absorbs both history buttons out of the footer."
          replaces="FoliateLocationDialog + the PDF 'Go to page' dialog — two modals, one per engine"
        >
          <PanelShell title="Go to" width={300} className="max-h-full">
            <div className="mb-3 flex items-center gap-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border-base bg-background-base px-2.5 py-1.5">
                <MapIcon className="size-3.5 shrink-0 text-icon-base" />
                <span className="truncate text-xs text-text-weaker">Chapter, or 0–100%</span>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Back">
                <Undo2Icon className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Forward" disabled>
                <Redo2Icon className="size-4" />
              </Button>
            </div>
            <PanelLabel>Recent</PanelLabel>
            <div className="flex flex-col">
              {["Cover", "2 · The Cathedral Schools", DOCUMENT.epub.section].map((entry, index) => (
                <button
                  key={entry}
                  type="button"
                  className={cn(
                    "flex items-baseline justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface-base-hover",
                    index === 2 && SELECTED_ROW,
                  )}
                >
                  <span className="truncate text-text-base">{entry}</span>
                  <span className="shrink-0 font-mono text-[10px] text-text-weaker">
                    {index === 2 ? DOCUMENT.epub.position : `${12 + index * 9}%`}
                  </span>
                </button>
              ))}
            </div>
          </PanelShell>
        </SurfaceTile>
      </SurfaceGroup>

      <SurfaceGroup
        title="Floating over the text"
        caption="The only surfaces not anchored to a band. They land beside a span of text, so they share one shape that nothing else in the design uses — that is how a reader tells 'about the thing I just touched' from 'about the document'."
      >
        <SurfaceTile
          name="Selection"
          center
          engine="both"
          size={FLOATING_TILE}
          note="The colours ARE the highlight button: one press makes the mark in that colour. Shipped, Highlight applies the default amber and any other colour costs three more clicks — which is why nobody uses the second one."
          replaces="ReaderSelectionToolbar · reader-selection-toolbar.tsx"
        >
          <SelectionToolbar />
        </SurfaceTile>

        <SurfaceTile
          name="Mark · tapped"
          center
          engine="both"
          size={FLOATING_TILE}
          note="Same dots as the selection toolbar, because recolouring a mark and making one are the same gesture and must not be two controls. Shipped, recolouring means opening a modal."
          replaces="ReaderAnnotationPopover · reader-annotation-popover.tsx"
        >
          <AnnotationPopover />
        </SurfaceTile>

        <SurfaceTile
          name="Note editor"
          center
          engine="both"
          size={FLOATING_TILE}
          note="Anchored, not modal. Shipped this is a Dialog — a sheet over the page, for typing a sentence about the page it is covering. All four styles and all four colours are here."
          replaces="ReaderAnnotationDialog · reader-annotation-dialog.tsx"
        >
          <AnnotationEditor />
        </SurfaceTile>

        <SurfaceTile
          name="Title card"
          center
          engine="both"
          size={FLOATING_TILE}
          note="Small, but it is the only place author, publisher and language are ever shown. The proposal had reduced the title to a plain span, which would have deleted this silently."
          replaces="ReaderMetadataHoverCard + ReaderMetadataPanel"
        >
          <MetadataCard engine="epub" />
        </SurfaceTile>
      </SurfaceGroup>

      <SurfaceGroup
        title="States that are not reading"
        caption="None of these may move the bands. A document that fails to open, is encrypted, or falls back to a layout it did not ask for has to look like the same object — otherwise every failure reads as a different application."
      >
        <SurfaceTile
          name="Opening"
          center
          engine="both"
          size={STATE_TILE}
          note="One pill for both engines. Today the EPUB draws a square-cornered inset badge and the PDF a rounded-full one, in different corners."
          replaces="status === 'loading' in both readers"
        >
          <LoadingState />
        </SurfaceTile>

        <SurfaceTile
          name="Nothing open"
          center
          engine="both"
          size={STATE_TILE}
          note="The one state that is not a failure, so it gets no warning colour and no retry."
          replaces="ReaderEmptyState · reader-empty-state.tsx"
        >
          <EmptyState />
        </SurfaceTile>

        <SurfaceTile
          name="Failed to open"
          center
          engine="both"
          size={STATE_TILE}
          note="Says what probably went wrong and offers the one action worth offering. The shipped state prints the raw Error."
          replaces="ReaderErrorState · reader-error-state.tsx"
        >
          <ErrorState />
        </SurfaceTile>

        <SurfaceTile
          name="Protected"
          center
          engine="pdf"
          size={STATE_TILE}
          note="Not a modal: a modal over a blank page is a dialog about nothing. It sits in the reading area because until it is answered there is nothing else to occupy that area."
          replaces="the PDF password prompt · pdf-reader.tsx:1813"
        >
          <PasswordState />
        </SurfaceTile>

        <SurfaceTile
          name="Layout fell back"
          center
          engine="pdf"
          size={STATE_TILE}
          note="Shipped, this is a full-width strip that pushes the page down by its own height — an advisory notice that moves the thing you are reading. Here it is the same pill as Opening, because it is the same class of thing."
          replaces="layoutFallback banner · pdf-reader.tsx:1546"
        >
          <FallbackNotice />
        </SurfaceTile>
      </SurfaceGroup>
    </section>
  )
}

// ── Ledgers ──────────────────────────────────────────────────────────────

function LedgerCard(props: { title: string; caption?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border-weak-base bg-surface-raised-base p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-strong">
        {props.title}
      </h3>
      {props.caption ? (
        <p className="mt-1 text-xs leading-relaxed text-text-weak">{props.caption}</p>
      ) : null}
      <div className="mt-3">{props.children}</div>
    </section>
  )
}

function SupportCell(props: { value: Support }) {
  const label = props.value === "yes" ? "✓" : props.value === "no" ? "—" : "cond."
  return (
    <td
      className={cn(
        "py-1.5 pr-3 text-center font-mono text-[11px]",
        props.value === "yes" && "text-icon-success-base",
        props.value === "no" && "text-text-weaker",
        props.value === "conditional" && "text-icon-warning-base",
      )}
    >
      {label}
    </td>
  )
}

function CapabilityTable(props: { rows: CapabilityRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border-weak-base text-left text-text-weaker">
            <th className="py-1.5 pr-3 font-medium">Name</th>
            <th className="py-1.5 pr-3 text-center font-medium">EPUB</th>
            <th className="py-1.5 pr-3 text-center font-medium">EPUB fixed</th>
            <th className="py-1.5 pr-3 text-center font-medium">PDF</th>
            <th className="py-1.5 font-medium">Rule in source</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.name} className="border-b border-border-weaker-base last:border-0">
              <td className="py-1.5 pr-3 text-text-base">{row.name}</td>
              <SupportCell value={row.epub} />
              <SupportCell value={row.epubFixed} />
              <SupportCell value={row.pdf} />
              <td className="py-1.5 text-text-weak">{row.rule}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type CoverageRow = { shipped: string; lands: string; note?: string }

/**
 * The integration checklist: every surface the two shipped readers render, and
 * where it goes. Anything that cannot be pointed at a destination is a blocker,
 * because integration is a replacement rather than an addition — the moment the
 * new chrome mounts, whatever is not in this table stops existing.
 */
const COVERAGE: CoverageRow[] = [
  { shipped: "ReaderTocPopover", lands: "Contents panel" },
  { shipped: "ReaderBookmarksPopover", lands: "Highlights & notes" },
  { shipped: "ReaderAnnotationsPopover", lands: "Highlights & notes" },
  { shipped: "ReaderSearchPopover / ReaderSearchPanel", lands: "Search panel" },
  { shipped: "ReaderPreferencesPopover", lands: "View panel" },
  { shipped: "FoliatePreferencesPanel", lands: "View · EPUB variant" },
  { shipped: "PdfEnginePreferences", lands: "View · PDF variant" },
  { shipped: "Bookmark toggle", lands: "Bar · bookmark" },
  {
    shipped: "⋯ menu",
    lands: "dissolved",
    note: "every item already existed elsewhere — the menu was the duplicate",
  },
  {
    shipped: "FoliateLocationDialog",
    lands: "View · Location & navigation",
    note: "retained unchanged for CFI, page list, and landmarks",
  },
  { shipped: "PDF 'Go to page' dialog", lands: "Go to panel" },
  { shipped: "ReaderHelpDialog", lands: "View · last row" },
  { shipped: "ReaderMetadataHoverCard", lands: "Title card" },
  { shipped: "ReaderSelectionToolbar", lands: "Selection" },
  { shipped: "ReaderAnnotationPopover", lands: "Mark · tapped" },
  { shipped: "ReaderAnnotationDialog", lands: "Note editor" },
  { shipped: "ReaderProgressScrubber", lands: "Progress rail", note: "paged only; drag preserved" },
  { shipped: "Footer history buttons", lands: "Go to panel" },
  { shipped: "Footer chapter · position", lands: "Location strip" },
  { shipped: "Page-turn chevrons", lands: "unchanged", note: "surface overlay, not chrome" },
  { shipped: "ReaderEmptyState", lands: "Nothing open" },
  { shipped: "ReaderErrorState", lands: "Failed to open" },
  { shipped: "status === 'loading'", lands: "Opening" },
  { shipped: "PDF password prompt", lands: "Protected" },
  { shipped: "PDF layoutFallback banner", lands: "Layout fell back" },
  {
    shipped: "PDF scale mode (3) + custom slider",
    lands: "Fit (2) + bar zoom",
    note: "`custom` becomes a consequence of ⊖/⊕, not an option",
  },
  { shipped: "EPUB text-size slider", lands: "A− / A+", note: "needs a step constant" },
]

function CoverageLedger() {
  return (
    <LedgerCard
      title="Integration checklist — every shipped surface, and where it goes"
      caption="Integration is a replacement, not an addition: the moment this chrome mounts, anything not in this table stops existing. The advanced EPUB location dialog stays intact behind View; everything else has a named destination."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border-weak-base text-left text-text-weaker">
              <th className="py-1.5 pr-3 font-medium">Shipped today</th>
              <th className="py-1.5 pr-3 font-medium">Lands in</th>
              <th className="py-1.5 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {COVERAGE.map((row) => (
              <tr key={row.shipped} className="border-b border-border-weaker-base last:border-0">
                <td className="py-1.5 pr-3 text-text-base">{row.shipped}</td>
                <td
                  className={cn(
                    "py-1.5 pr-3",
                    row.lands === "dissolved" ? "text-text-weaker" : "text-text-weak",
                  )}
                >
                  {row.lands}
                </td>
                <td className="py-1.5 text-text-weaker">{row.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-text-weak">
        The advanced EPUB tools are no longer cuts. The existing Location &amp; navigation dialog
        stays intact and opens from the row directly beneath Keyboard shortcuts in View. The bottom
        Go to popover remains the faster path for ordinary position changes and history.
      </p>
    </LedgerCard>
  )
}

function ApiLedger() {
  return (
    <div className="flex flex-col gap-4">
      <LedgerCard
        title="Declared capabilities — and the dead flag"
        caption="ReaderEngineCapabilities (reader-types.ts:29) is produced by foliate-reader-adapters.ts:64 and pdf-viewer-session.ts:364. A grep across packages/web finds no consumer. The mechanism for a capability-driven shared toolbar already exists, already runs, and is read by nothing — which is exactly how the two chromes drifted apart."
      >
        <CapabilityTable rows={DECLARED_CAPABILITIES} />
      </LedgerCard>

      <LedgerCard
        title="What each engine actually implements"
        caption="Not the same question as the flags. Three rows here contradict them."
      >
        <CapabilityTable rows={IMPLEMENTED_CONTROLS} />
        <ul className="mt-3 flex flex-col gap-1.5">
          {[
            "Reduce motion is a live switch in EPUB (foliate-themes.ts:235 removes the animated attribute) and a dead switch in PDF — stored, persisted, and never read. It ships in both panels today.",
            "Fixed-layout EPUB reports pageLayouts: true and has no layout, fit, rotation or zoom control anywhere. It is the one state with neither half of scale.",
            "Section search scope is gated on the outline in PDF and ungated in EPUB, because foliate never passes canSearchSection and the panel defaults it to true.",
            "Scale is not one capability. Text size reflows and zoom rasterises; no engine implements both, so the proposal keeps them as two controls with two glyphs in two places rather than one name over two mechanics.",
          ].map((note) => (
            <li key={note} className="flex gap-2 text-xs leading-relaxed text-text-weak">
              <span
                aria-hidden
                className="mt-1.5 size-1 shrink-0 rounded-full bg-icon-warning-base"
              />
              {note}
            </li>
          ))}
        </ul>
      </LedgerCard>
    </div>
  )
}

function ClickLedger() {
  return (
    <LedgerCard
      title="Clicks to reach"
      caption="Depth follows frequency — settings you touch once should not sit at the same depth as the page you turn all day. Note that the two scale rows go opposite ways on purpose: an EPUB has no zoom to put in the bar, and a PDF has no text to resize."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border-weak-base text-left text-text-weaker">
              <th className="py-1.5 pr-3 font-medium">Action</th>
              <th className="py-1.5 pr-3 font-medium">How often</th>
              <th className="py-1.5 pr-3 font-medium">EPUB today</th>
              <th className="py-1.5 pr-3 font-medium">PDF today</th>
              <th className="py-1.5 font-medium">Proposed · both</th>
            </tr>
          </thead>
          <tbody>
            {CLICK_LEDGER.map((row) => {
              const cheaper = row.proposed.startsWith("0") || row.proposed.includes("one")
              const costlier = row.proposed.startsWith("2")
              return (
                <tr key={row.action} className="border-b border-border-weaker-base last:border-0">
                  <td className="py-1.5 pr-3 text-text-base">{row.action}</td>
                  <td className="py-1.5 pr-3 text-text-weaker">{row.frequency}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-text-weak">
                    {row.epubToday}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-text-weak">
                    {row.pdfToday}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 font-mono text-[11px]",
                      cheaper && "text-icon-success-base",
                      costlier && "text-icon-warning-base",
                      !cheaper && !costlier && "text-text-weak",
                    )}
                  >
                    {row.proposed}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </LedgerCard>
  )
}

function DefectLedger(props: { pins: boolean }) {
  return (
    <LedgerCard
      title="What is actually wrong"
      caption="Read out of foliate-reader.tsx and pdf-reader.tsx. Turn on pins in the Original direction to see the numbered ones in place."
    >
      <ol className="flex flex-col gap-2.5">
        {DEFECTS.map((defect) => (
          <li key={defect.title} className="flex gap-2.5">
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
                defect.pin !== null && props.pins
                  ? "bg-surface-critical-base text-text-on-critical-base"
                  : "bg-surface-weak text-text-weaker",
              )}
            >
              {defect.pin ?? "·"}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-text-base">{defect.title}</p>
              <p className="mt-0.5 break-words font-mono text-[10px] text-text-weaker">
                {defect.where}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-weak">{defect.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </LedgerCard>
  )
}

function CutsLedger() {
  return (
    <div className="flex flex-col gap-4">
      <LedgerCard
        title="What gets deleted"
        caption="Not moved — deleted. Each of these is a component or a band that exists today and has no successor."
      >
        <ul className="flex flex-col gap-1.5">
          {CUTS.map((cut) => (
            <li key={cut} className="flex gap-2 text-xs leading-relaxed text-text-weak">
              <span
                aria-hidden
                className="mt-1.5 size-1 shrink-0 rounded-full bg-icon-critical-base"
              />
              {cut}
            </li>
          ))}
        </ul>
      </LedgerCard>

      <LedgerCard
        title="Scroll rules"
        caption="Turn on the scroll map above to see the one container each surface is allowed."
      >
        <ul className="flex flex-col gap-1.5">
          {SCROLL_RULES.map((rule) => (
            <li key={rule} className="flex gap-2 text-xs leading-relaxed text-text-weak">
              <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-icon-success-base" />
              {rule}
            </li>
          ))}
        </ul>
      </LedgerCard>

      <LedgerCard
        title="The two bands"
        caption="Three peers a side on an EPUB, so the centred title is genuinely centred. Grouping is carried by space, not by containers — the zoom trio sits flush, the boundaries are wider gaps, and nothing has a fill behind it. The readouts never share a band with the actions."
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-base bg-background-base p-2">
            <span className="mr-1 shrink-0 font-mono text-[9px] uppercase tracking-widest text-text-weaker">
              top · actions
            </span>
            <TableOfContentsIcon className="size-3.5 text-icon-base" />
            <PencilLineIcon className="size-3.5 text-icon-base" />
            <SearchIcon className="size-3.5 text-icon-base" />
            <span aria-hidden className="text-text-weaker">
              │
            </span>
            <span className="text-xs text-text-weak">title</span>
            <span aria-hidden className="text-text-weaker">
              │
            </span>
            <span className="flex items-center">
              <ZoomOutIcon className="size-3.5 text-icon-base" />
              <FitToScreenIcon className="size-3.5 text-icon-base" />
              <ZoomInIcon className="size-3.5 text-icon-base" />
              <span className="ml-1 text-[10px] text-text-weaker">pdf only</span>
            </span>
            <ALargeSmallIcon className="ml-2 size-3.5 text-icon-base" />
            <BookmarkIcon className="size-3.5 text-icon-base" />
            <IdeaIcon className="ml-2 size-3.5 text-icon-base" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border-base bg-background-base p-2">
            <span className="mr-1 shrink-0 font-mono text-[9px] uppercase tracking-widest text-text-weaker">
              bottom · information
            </span>
            <span className="text-xs text-text-weak">chapter · position</span>
            <span className="font-mono text-[10px] text-text-weaker">— and nothing else, ever</span>
          </div>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-text-weak">
          The engine difference lives inside{" "}
          <span className="font-medium text-text-base">View</span> — text size, typeface, flow,
          margins and hyphenation for EPUB; page layout, fit and rotation for PDF — under an
          identical theme block above and an identical motion/cursor/shortcuts block below. The zoom
          track is the one thing that stays in the bar, because it belongs to the page rather than
          to the type — and it is also the one object a PDF has that an EPUB does not, which is why
          the PDF bar is one pill heavier and not four icons heavier.
        </p>
      </LedgerCard>
    </div>
  )
}

// ── Easel ────────────────────────────────────────────────────────────────

export function ReaderLayoutConsistencyEasel() {
  const [direction, setDirection] = useState<Direction>("proposed")
  const [engineView, setEngineView] = useState<EngineView>("epub")
  const [width, setWidth] = useState<FrameWidth>("fill")
  const [flow, setFlow] = useState<SurfaceFlow>("paged")
  const [pins, setPins] = useState(true)
  const [scrollMap, setScrollMap] = useState(false)

  const active = DIRECTIONS.find((option) => option.id === direction)
  const engines: ReaderEngine[] = engineView === "both" ? ["epub", "pdf"] : [engineView]

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto bg-background-base">
      <div className="flex w-full flex-col gap-6 p-6">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-text-strong">
                Reader chrome · EPUB and PDF, made one thing
              </h1>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-weak">
                One design, two fills. Flip between EPUB and PDF and the skeleton must not move —
                same bands, same order, same depth. Only two things are allowed to differ, and both
                are differences the engines genuinely have: the PDF gets a{" "}
                <span className="font-mono text-text-base">− +</span> zoom pair in the bar, and the
                EPUB gets <span className="font-mono text-text-base">A− A+</span> inside View. If
                anything else changes place, the design has failed.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-text-weak">
                <Switch
                  size="sm"
                  checked={pins}
                  onCheckedChange={setPins}
                  aria-label="Show defect pins"
                />
                Pins
              </label>
              <label className="flex items-center gap-2 text-xs text-text-weak">
                <Switch
                  size="sm"
                  checked={scrollMap}
                  onCheckedChange={setScrollMap}
                  aria-label="Show scroll map"
                />
                Scroll map
              </label>
              {direction === "proposed" ? (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={flow}
                  aria-label="Surface flow"
                  onValueChange={(value) => {
                    if (value === "paged" || value === "scrolled") setFlow(value)
                  }}
                >
                  <ToggleGroupItem value="paged">Paged</ToggleGroupItem>
                  <ToggleGroupItem value="scrolled">Scrolled</ToggleGroupItem>
                </ToggleGroup>
              ) : null}
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={width}
                aria-label="Frame width"
                onValueChange={(value) => {
                  if (value === "fill" || value === "docked" || value === "wide") setWidth(value)
                }}
              >
                <ToggleGroupItem value="fill">Fill</ToggleGroupItem>
                <ToggleGroupItem value="docked">Docked</ToggleGroupItem>
                <ToggleGroupItem value="wide">Wide</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={direction}
              aria-label="Layout direction"
              onValueChange={(value) => {
                const next = DIRECTIONS.find((option) => option.id === value)
                if (next) setDirection(next.id)
              }}
            >
              {DIRECTIONS.map((option) => (
                <ToggleGroupItem key={option.id} value={option.id}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-text-weaker">{active?.tagline}</p>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={engineView}
                aria-label="Engine"
                onValueChange={(value) => {
                  const next = ENGINE_VIEWS.find((option) => option.id === value)
                  if (next) setEngineView(next.id)
                }}
              >
                {ENGINE_VIEWS.map((option) => (
                  <ToggleGroupItem key={option.id} value={option.id}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        </header>

        <Separator />

        <div className={cn("flex items-start gap-6", width === "fill" ? "" : "flex-wrap")}>
          {engines.map((engine) => (
            <ReaderFrame
              key={engine}
              engine={engine}
              direction={direction}
              width={width}
              pins={pins}
              scrollMap={scrollMap}
              flow={flow}
            />
          ))}
        </div>

        {direction === "original" ? (
          <>
            <p className="max-w-4xl text-xs leading-relaxed text-text-weak">
              A faithful reproduction, class for class, of what ships today — the two frames differ
              in nine visible ways before you click anything. Switch to{" "}
              <span className="font-medium text-text-base">Docked</span> and watch the PDF title
              vanish while the EPUB title stays.
            </p>
            <Separator />
            <OriginalOnlyInventory engines={engines} />
          </>
        ) : (
          <p className="max-w-4xl text-xs leading-relaxed text-text-weak">
            Five things to try. Press{" "}
            <span className="font-medium text-text-base">the last button in the bar</span> for Focus
            — both bands leave, one control stays. Open{" "}
            <span className="font-medium text-text-base">Aa</span> on EPUB and find A− / A+ at the
            head of the type block, then open it on PDF and confirm they are absent and{" "}
            <span className="font-mono text-text-base">− +</span> is in the bar instead. Click the
            quiet line at the bottom to jump. Open{" "}
            <span className="font-medium text-text-base">Search</span>, which until now was an icon
            with nothing behind it. And flip{" "}
            <span className="font-medium text-text-base">Paged → Scrolled</span> to watch the
            progress rail delete itself the moment the scrollbar can say the same thing.
          </p>
        )}

        <Separator />

        <ViewSurfaceReview />

        <Separator />

        <SurfaceGallery />

        <Separator />

        <CoverageLedger />

        <Separator />

        <ApiLedger />

        <ClickLedger />

        <div className="grid gap-4 lg:grid-cols-2">
          <DefectLedger pins={pins} />
          <CutsLedger />
        </div>

        <LedgerCard
          title="Open questions for review"
          caption="Calls I made that could reasonably go the other way."
        >
          <ol className="flex flex-col gap-2.5 text-xs leading-relaxed text-text-weak">
            <li>
              <span className="font-medium text-text-base">
                Text size sits inside View rather than in the bar.
              </span>{" "}
              It follows from the rule that only page properties are bar-level, and it matches
              Books. But it does mean the EPUB's most-used adjustment costs one click more than the
              PDF's, on an engine where it is arguably used more. The counter-argument is that once
              the panel is open, every further press is free — and text size is set in a burst, not
              continuously.
            </li>
            <li>
              <span className="font-medium text-text-base">
                Layout and flow demoted out of the top-level menu.
              </span>{" "}
              I ranked them as set-once. If you flip between Continuous and Two-up while comparing
              figures, they are per-minute controls and belong in the bar beside zoom.
            </li>
            <li>
              <span className="font-medium text-text-base">
                The bottom band is kept for the PDF too.
              </span>{" "}
              A PDF could carry page-of-total up top, where Preview puts it, and drop the band
              entirely. I kept it because the two engines then have the same skeleton, and because
              chapter and page are the same kind of thing wherever they are shown. The cost is 28px
              of reading height on a surface that already tells you the page number in its
              scrollbar.
            </li>
            <li>
              <span className="font-medium text-text-base">
                Focus has no discoverable way back other than the one button.
              </span>{" "}
              That button is deliberately the only chrome left, which is the point — but a reader
              who scrolls past it, or who entered Focus by keyboard, has one small target and two
              shortcuts and nothing else.
            </li>
            <li>
              <span className="font-medium text-text-base">
                The selection toolbar has no plain &ldquo;highlight&rdquo; button.
              </span>{" "}
              Four colour dots make every highlight a colour decision, where shipped you press
              Highlight and get amber without thinking. It is still one click either way, and the
              alternative — a default button plus a colour row — is five targets for one action. But
              if you always highlight in one colour, this asks you a question you never wanted.
            </li>
            <li>
              <span className="font-medium text-text-base">
                The note editor is anchored rather than modal.
              </span>{" "}
              Keeping the text visible while you write about it is the whole argument, and it wins
              on a wide frame. In a docked bench the card is 330px against a 480px pane, so it
              covers most of the column anyway — at which point a modal would at least have been
              honest about it.
            </li>
            <li>
              <span className="font-medium text-text-base">
                Search&rsquo;s match modifiers stopped being Switches.
              </span>{" "}
              Three mono toggles are far cheaper in a panel that also holds a query, a scope, a
              count, a progress bar and a list — but Switch is the standard control for a boolean
              everywhere else in Buddy, and this is the one place that diverges from it.
            </li>
          </ol>
        </LedgerCard>

        <div className="flex items-center gap-2 pb-4 text-xs text-text-weaker">
          <Loader2Icon className="size-3" />
          Prototype only — no reader engine is mounted here. Everything is a mock at the layout
          layer.
        </div>
      </div>
    </div>
  )
}
