import { useState } from "react"
import { Button, ToggleGroup, ToggleGroupItem } from "@buddy/ui"
import { QuoteIcon } from "@/icons/app-icons"

/**
 * Citation comment highlight · which palette colour marks the cited text.
 *
 * While a fresh citation's comment editor is open, the cited source text stays
 * marked (`::highlight(buddy-citation-comment)` in `citations.css`). It shipped as
 * the warning surface at 58%; Accent at 45% was chosen here. Every candidate below is a live theme token mixed
 * toward transparent, painted over the real chat and document backgrounds, so
 * switching the Easel theme re-judges all of them at once.
 */

type HighlightCandidate = {
  id: string
  name: string
  token: string
  note: string
  /** Neutral ink is far stronger than a tinted surface at the same mix. */
  strengthScale?: number
}

const CANDIDATES: HighlightCandidate[] = [
  {
    id: "warning",
    name: "Amber · previous",
    token: "--surface-warning-base",
    note: "Same family as reader selections and the jump-to-citation flash",
  },
  {
    id: "interactive",
    name: "Accent · shipped",
    token: "--surface-interactive-base",
    note: "The app's interactive accent · closest to t3code, which uses its primary",
  },
  {
    id: "info",
    name: "Sky",
    token: "--surface-info-base",
    note: "Informational blue · cooler and quieter than the accent",
  },
  {
    id: "success",
    name: "Mint",
    token: "--surface-success-base",
    note: "Green-teal · nearest to the screenshot",
  },
  {
    id: "brand",
    name: "Brand",
    token: "--surface-brand-base",
    note: "Buddy purple · strongest identity, may read as a mode",
  },
  {
    id: "critical",
    name: "Rose",
    token: "--surface-critical-base",
    note: "The reader's rose annotation · risks reading as an error",
  },
  {
    id: "neutral",
    name: "Ink",
    token: "--text-base",
    note: "No hue · marks by contrast alone",
    strengthScale: 0.35,
  },
]

const STRENGTHS = [
  { id: "30", label: "30%" },
  { id: "45", label: "45% · shipped" },
  { id: "58", label: "58% · previous" },
] as const

type StrengthID = (typeof STRENGTHS)[number]["id"]

function highlightColor(candidate: HighlightCandidate, strength: StrengthID): string {
  const percent = Math.round(Number(strength) * (candidate.strengthScale ?? 1))
  return `color-mix(in oklab, var(${candidate.token}) ${percent}%, transparent)`
}

function CommentEditorMock() {
  return (
    <div className="ml-auto w-72 max-w-full rounded-lg bg-surface-raised-stronger-non-alpha p-3 text-sm shadow-md ring-1 ring-border-weak-base">
      <div className="min-h-16 px-1 py-1.5 text-text-weak">Add an optional comment...</div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="outline" size="xs">
          Cancel
        </Button>
        <Button size="xs">Save</Button>
      </div>
    </div>
  )
}

function CandidateCard(props: { candidate: HighlightCandidate; strength: StrengthID }) {
  const background = highlightColor(props.candidate, props.strength)
  const mark = (text: string) => <span style={{ backgroundColor: background }}>{text}</span>

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-border-weak-base bg-surface-raised-base">
      <header className="flex flex-col gap-0.5 border-b border-border-weak-base px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-strong">{props.candidate.name}</h3>
          <code className="truncate text-[11px] text-text-weak">{props.candidate.token}</code>
        </div>
        <p className="text-xs text-text-weak">{props.candidate.note}</p>
      </header>

      <div className="flex flex-col gap-3 bg-background-base px-4 pt-3 pb-4">
        <span className="text-[10px] font-medium tracking-wide text-text-weaker uppercase">
          Chat
        </span>
        <p className="text-sm leading-6 text-text-base">
          Photosynthesis runs in two stages. The light-dependent reactions capture energy from
          sunlight and {mark("store it as ATP and NADPH, which the Calvin cycle spends")} to build
          sugars from carbon dioxide.
        </p>
        <CommentEditorMock />
      </div>

      <div className="flex flex-col gap-2 border-t border-border-weak-base bg-background-base px-4 pt-3 pb-4">
        <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-text-weaker uppercase">
          <QuoteIcon className="size-3" />
          Document
        </span>
        <h4 className="text-[16px] font-semibold text-text-strong">Cellular respiration</h4>
        <p className="font-serif text-[15px] leading-7 text-text-base">
          Glycolysis splits one glucose into two pyruvate molecules.{" "}
          {mark("Oxygen is the final electron acceptor")}, which is why the chain stalls without it.
        </p>
      </div>
    </section>
  )
}

export function CitationHighlightColorsEasel() {
  const [strength, setStrength] = useState<StrengthID>("45")

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto bg-background-base">
      <div className="flex w-full flex-col gap-6 p-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-text-strong">
            Citation highlight · which palette colour marks the cited text
          </h1>
          <p className="max-w-3xl text-xs leading-relaxed text-text-weak">
            Shown while a fresh citation's comment box is open beneath it. Each option is a live
            theme token mixed toward transparent, so switch the theme to compare light and dark. The
            pick applies to chat and markdown documents; the PDF and EPUB readers would be aligned
            to it afterwards.
          </p>
        </header>

        <div className="flex items-center gap-3">
          <span className="text-xs text-text-weak">Strength</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={strength}
            onValueChange={(value) => {
              const next = STRENGTHS.find((option) => option.id === value)
              if (next) setStrength(next.id)
            }}
          >
            {STRENGTHS.map((option) => (
              <ToggleGroupItem key={option.id} value={option.id} className="px-3 text-xs">
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {CANDIDATES.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} strength={strength} />
          ))}
        </div>
      </div>
    </div>
  )
}
