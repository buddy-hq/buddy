import { useState, type CSSProperties, type ReactNode } from "react"
import { ToggleGroup, ToggleGroupItem } from "@buddy/ui"
import { CopyIcon, PencilLineIcon, QuoteIcon, SearchIcon } from "@/icons/app-icons"
import { READER_THEMES } from "@/components/readers/foliate-reader-constants"
import type { FoliateReaderThemeDefinition } from "@/components/readers/foliate-reader-types"

/**
 * Reader highlights · app tokens vs reader-owned inks.
 *
 * Every reader mark borrows an app surface token (`--surface-warning-base` and
 * friends). Those are chip fills: a dark shade in a dark app theme, a pale tint in
 * a light one. The page follows its own reader theme, so a dark app over a Sepia
 * page paints dark amber blocks, and a light app over Paper paints near nothing.
 *
 * "Now" reproduces what ships, per engine: EPUB selection is the token solid with
 * a forced foreground, EPUB saved highlights overlay the token at 26%, the EPUB
 * citation mark sits behind the text at 45%, and every PDF mark overlays the token
 * at 34%. "Proposed" gives the reader fixed inks and sets strength by the page's
 * appearance, one model for both engines. Switch the app theme: the "Now" column
 * changes with it, the "Proposed" column must not.
 */

type Paint = CSSProperties

type InkRole = {
  id: string
  label: string
  token: string
  ink: string
}

const HIGHLIGHT_INKS: InkRole[] = [
  { id: "amber", label: "Amber", token: "--surface-warning-base", ink: "#f59e0b" },
  { id: "mint", label: "Mint", token: "--surface-success-base", ink: "#34d399" },
  { id: "sky", label: "Sky", token: "--surface-info-base", ink: "#38bdf8" },
  { id: "rose", label: "Rose", token: "--surface-critical-base", ink: "#fb7185" },
]

const SELECTION_INK: InkRole = {
  id: "selection",
  label: "Selection",
  token: "--surface-warning-base",
  ink: "#f59e0b",
}

const CITATION_INK: InkRole = {
  id: "citation",
  label: "Citation",
  token: "--surface-interactive-base",
  ink: "#3b82f6",
}

const ENGINES = [
  { id: "epub", label: "EPUB" },
  { id: "pdf", label: "PDF" },
] as const
type EngineID = (typeof ENGINES)[number]["id"]

const LIGHT_STRENGTHS = ["25", "35", "45"] as const
const DARK_STRENGTHS = ["20", "30", "40"] as const
const LIGHT_BLENDS = [
  { id: "multiply", label: "Multiply" },
  { id: "normal", label: "Normal" },
] as const
type LightStrength = (typeof LIGHT_STRENGTHS)[number]
type DarkStrength = (typeof DARK_STRENGTHS)[number]
type LightBlend = (typeof LIGHT_BLENDS)[number]["id"]

type Proposal = {
  lightStrength: LightStrength
  darkStrength: DarkStrength
  lightBlend: LightBlend
}

/** Painted behind the glyphs, like `::selection` and `::highlight`. */
function behind(color: string, percent: number): Paint {
  return { backgroundColor: `color-mix(in srgb, ${color} ${percent}%, transparent)` }
}

/** A translucent layer over the glyphs, like Foliate's overlayer and PDF marks. */
function over(color: string, percent: number, theme: FoliateReaderThemeDefinition): Paint {
  return {
    backgroundColor: `color-mix(in srgb, ${color} ${percent}%, ${theme.contentBackground})`,
    color: `color-mix(in srgb, ${color} ${percent}%, ${theme.contentForeground})`,
  }
}

/** Multiply over the glyphs: the paper takes the ink, dark letters stay dark. */
function multiply(color: string, percent: number): Paint {
  return {
    backgroundColor: `color-mix(in srgb, ${color} ${percent}%, white)`,
    mixBlendMode: "multiply",
  }
}

function currentPaint(
  role: InkRole,
  kind: "selection" | "highlight" | "citation",
  engine: EngineID,
  theme: FoliateReaderThemeDefinition,
): Paint {
  const token = `var(${role.token})`
  if (engine === "pdf") return over(token, 34, theme)
  if (kind === "selection") {
    return { backgroundColor: token, color: "var(--text-on-warning-base)" }
  }
  if (kind === "citation") return behind(token, 45)
  return over(token, 26, theme)
}

function proposedPaint(
  role: InkRole,
  proposal: Proposal,
  theme: FoliateReaderThemeDefinition,
): Paint {
  if (theme.appearance === "dark") return over(role.ink, Number(proposal.darkStrength), theme)
  const strength = Number(proposal.lightStrength)
  return proposal.lightBlend === "multiply"
    ? multiply(role.ink, strength)
    : over(role.ink, strength, theme)
}

function ToolbarMock(props: { dotColor: (role: InkRole) => string }) {
  return (
    <div className="flex w-fit items-center rounded-full bg-surface-raised-stronger-non-alpha px-2.5 py-1.5 shadow-md ring-1 ring-border-weak-base">
      <span className="flex items-center gap-2">
        {HIGHLIGHT_INKS.map((role) => (
          <span
            key={role.id}
            title={role.label}
            className="size-5 rounded-full"
            style={{ backgroundColor: props.dotColor(role) }}
          />
        ))}
      </span>
      <span aria-hidden className="mx-2.5 h-5 w-px bg-border-weak-base" />
      <span className="flex items-center gap-3 px-1 text-icon-base">
        <QuoteIcon className="size-4" />
        <PencilLineIcon className="size-4" />
        <CopyIcon className="size-4" />
        <SearchIcon className="size-4" />
      </span>
    </div>
  )
}

function PageSample(props: {
  theme: FoliateReaderThemeDefinition
  paint: (role: InkRole, kind: "selection" | "highlight" | "citation") => Paint
  dotColor: (role: InkRole) => string
}) {
  const mark = (role: InkRole, kind: "selection" | "highlight" | "citation", text: ReactNode) => (
    <span style={props.paint(role, kind)}>{text}</span>
  )
  const [amber, mint, sky, rose] = HIGHLIGHT_INKS

  return (
    <div className="flex flex-col gap-3">
      <ToolbarMock dotColor={props.dotColor} />
      <div
        className="isolate rounded-md px-5 py-4 font-serif text-[16px] leading-8"
        style={{
          backgroundColor: props.theme.contentBackground,
          color: props.theme.contentForeground,
        }}
      >
        <p>
          “We must have a cab.” {mark(SELECTION_INK, "selection", "“No, my brougham is waiting.”")}{" "}
          “Then that will simplify matters.”
        </p>
        <p className="mt-2">
          {amber ? mark(amber, "highlight", "“Irene Adler is married,”") : null} remarked Holmes.
          “Married! When?” {mint ? mark(mint, "highlight", "“Yesterday.”") : null}{" "}
          {sky ? mark(sky, "highlight", "“But to whom?”") : null} “To an English lawyer{" "}
          {rose ? mark(rose, "highlight", "named Norton.”") : null}
        </p>
        <p className="mt-2">
          “But she could not love him.” “I am in hopes that{" "}
          {mark(CITATION_INK, "citation", "she does, Watson.")}”
        </p>
      </div>
    </div>
  )
}

function Segmented<T extends string>(props: {
  label: string
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-weak">{props.label}</span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={props.value}
        onValueChange={(value) => {
          const next = props.options.find((option) => option.id === value)
          if (next) props.onChange(next.id)
        }}
      >
        {props.options.map((option) => (
          <ToggleGroupItem key={option.id} value={option.id} className="px-3 text-xs">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export function ReaderHighlightStrengthsEasel() {
  const [engine, setEngine] = useState<EngineID>("epub")
  const [lightStrength, setLightStrength] = useState<LightStrength>("35")
  const [darkStrength, setDarkStrength] = useState<DarkStrength>("30")
  const [lightBlend, setLightBlend] = useState<LightBlend>("multiply")
  const proposal: Proposal = { lightStrength, darkStrength, lightBlend }

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto bg-background-base">
      <div className="flex w-full flex-col gap-6 p-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-text-strong">
            Reader highlights · app tokens vs reader-owned inks
          </h1>
          <p className="max-w-3xl text-xs leading-relaxed text-text-weak">
            Each row is a real reader page theme. Left is what ships: the app's warning, success,
            info, critical and interactive surfaces, which follow the app theme, not the page. Right
            gives the reader fixed inks and sets strength by the page's appearance. Switch the app
            theme to see the left column break and the right column hold. Each page shows a
            selection, the four saved highlight colours, and the citation mark.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Segmented label="Now as" value={engine} options={ENGINES} onChange={setEngine} />
          <Segmented
            label="Light pages"
            value={lightStrength}
            options={LIGHT_STRENGTHS.map((id) => ({ id, label: `${id}%` }))}
            onChange={setLightStrength}
          />
          <Segmented
            label="Blend"
            value={lightBlend}
            options={LIGHT_BLENDS}
            onChange={setLightBlend}
          />
          <Segmented
            label="Dark pages"
            value={darkStrength}
            options={DARK_STRENGTHS.map((id) => ({ id, label: `${id}%` }))}
            onChange={setDarkStrength}
          />
        </div>

        <div className="grid grid-cols-[auto_1fr_1fr] items-start gap-x-5 gap-y-6">
          <span />
          <h2 className="text-xs font-semibold tracking-wider text-text-strong uppercase">
            Now · app tokens ({engine === "pdf" ? "PDF" : "EPUB"})
          </h2>
          <h2 className="text-xs font-semibold tracking-wider text-text-strong uppercase">
            Proposed · reader inks
          </h2>
          {READER_THEMES.map((theme) => (
            <div key={theme.id} className="contents">
              <div className="flex w-20 flex-col pt-14">
                <span className="text-sm font-semibold text-text-strong">{theme.label}</span>
                <span className="text-xs text-text-weak">{theme.appearance} page</span>
              </div>
              <PageSample
                theme={theme}
                paint={(role, kind) => currentPaint(role, kind, engine, theme)}
                dotColor={(role) => `var(${role.token})`}
              />
              <PageSample
                theme={theme}
                paint={(role) => proposedPaint(role, proposal, theme)}
                dotColor={(role) => role.ink}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
