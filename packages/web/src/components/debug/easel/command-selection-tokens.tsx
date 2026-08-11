import { useState } from "react"
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  cn,
} from "@buddy/ui"
import {
  BookOpenIcon,
  PanelsTopLeftIcon,
  PresentationIcon,
  WorkflowIcon,
  type AppIcon,
} from "@/icons/app-icons"

/**
 * Why a cmdk row never lit up.
 *
 * `packages/ui/src/index.css` redefines the `data-selected` variant as
 * `&[data-state="selected"]` — the Radix table-row convention. cmdk marks its
 * active row with `data-selected="true"` and leaves `data-state` unset, so every
 * `data-selected:*` class on `CommandItem` compiles to a selector that cannot
 * match. Keyboard and pointer selection both worked the whole time; nothing was
 * ever painted.
 *
 * Fixed in `command.tsx` by matching the value — `data-[selected=true]:*`, the
 * form the same class list already used for `data-disabled`. This page keeps the
 * two side by side, and the candidate highlight tokens on the real popover
 * surface, so the choice can be re-judged rather than re-derived.
 */

type SelectionSample = {
  id: string
  title: string
  kindLabel: string
  glyph: AppIcon
}

type HighlightCandidate = {
  className: string
  token: string
  note: string
}

const SELECTION_SAMPLES: SelectionSample[] = [
  { id: "board", title: "Bird Whiteboard Bug Repro", kindLabel: "Whiteboard", glyph: PresentationIcon },
  { id: "diagram", title: "High-level view of Bench workspace", kindLabel: "Diagram", glyph: WorkflowIcon },
  { id: "widget", title: "Workspace Hydration Flow", kindLabel: "Widget", glyph: PanelsTopLeftIcon },
  { id: "source", title: "glm-5-paper", kindLabel: "Resource", glyph: BookOpenIcon },
]

/** Every surface token plausible as a highlight over the popover's own. */
const HIGHLIGHT_CANDIDATES: HighlightCandidate[] = [
  {
    className: "bg-surface-raised-base-hover",
    token: "surface-raised-base-hover",
    note: "What CommandItem ships now — the row hover used across the app",
  },
  {
    className: "bg-surface-weak",
    token: "surface-weak",
    note: "The previous ask; nearly the popover's own value in dark",
  },
  {
    className: "bg-surface-raised-base",
    token: "surface-raised-base",
    note: "One step up from the popover",
  },
  {
    className: "bg-surface-raised-strong",
    token: "surface-raised-strong",
    note: "Heavier; reads as a pressed row",
  },
  {
    className: "bg-surface-interactive-weak",
    token: "surface-interactive-weak",
    note: "Tinted rather than lighter",
  },
]

const POPOVER_SURFACE_CLASS = "bg-surface-raised-stronger-non-alpha"

function SelectionRow(props: {
  sample: SelectionSample
  selected: boolean
  highlightClass: string
  onSelect: () => void
}) {
  const Glyph = props.sample.glyph

  return (
    <button
      type="button"
      data-selected={props.selected}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-base",
        props.highlightClass,
      )}
      onClick={props.onSelect}
    >
      <Glyph className="size-3.5 shrink-0 text-icon-base" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{props.sample.title}</span>
      <span className="shrink-0 text-[11px] text-text-weaker">{props.sample.kindLabel}</span>
    </button>
  )
}

function SelectionColumn(props: { title: string; note: string; highlightClass: string }) {
  const [selectedID, setSelectedID] = useState(SELECTION_SAMPLES[1]?.id ?? "")

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-text-strong">{props.title}</h3>
        <p className="text-xs text-text-weak">{props.note}</p>
      </header>
      <div
        className={cn(
          "flex flex-col gap-0.5 rounded-lg p-1 ring-1 ring-border-weak-base",
          POPOVER_SURFACE_CLASS,
        )}
      >
        {SELECTION_SAMPLES.map((sample) => (
          <SelectionRow
            key={sample.id}
            sample={sample}
            selected={sample.id === selectedID}
            highlightClass={props.highlightClass}
            onSelect={() => setSelectedID(sample.id)}
          />
        ))}
      </div>
    </section>
  )
}

/** The real primitive, in the real popover, exactly as the Bench tab strip uses it. */
function LiveCommandPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Open the live Command popover
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-80 gap-0 p-0">
        <Command label="Command selection sample" shouldFilter={false} loop>
          <CommandInput placeholder="Search this notebook…" />
          <CommandList className="max-h-80 px-1 pb-1">
            <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-text-weaker">
              Recent in this notebook
            </p>
            {SELECTION_SAMPLES.map((sample) => {
              const Glyph = sample.glyph
              return (
                <CommandItem key={sample.id} value={sample.id}>
                  <Glyph className="size-3.5 shrink-0 text-icon-base" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{sample.title}</span>
                  <span className="shrink-0 text-[11px] text-text-weaker">{sample.kindLabel}</span>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function CommandSelectionTokensEasel() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-6 overflow-y-auto bg-background-base p-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-text-strong">
          Command selection · the variant, then the token
        </h2>
        <p className="max-w-3xl text-sm text-text-weak">
          <code className="text-text-base">@custom-variant data-selected (&amp;[data-state=&quot;selected&quot;])</code>{" "}
          in <code className="text-text-base">packages/ui/src/index.css</code> retargets every{" "}
          <code className="text-text-base">data-selected:*</code> class. cmdk writes{" "}
          <code className="text-text-base">data-selected=&quot;true&quot;</code>, never{" "}
          <code className="text-text-base">data-state</code>, so the highlight never painted.{" "}
          <code className="text-text-base">command.tsx</code> now matches the value —{" "}
          <code className="text-text-base">data-[selected=true]:*</code> — which is what the rest of
          that class list already used for <code className="text-text-base">data-disabled</code>.
        </p>
      </header>

      <div className="flex flex-wrap gap-6">
        <SelectionColumn
          title="Broken · data-selected:"
          note="Compiles to [data-state=&quot;selected&quot;]. Nothing matches; click a row and it stays flat."
          highlightClass="data-selected:bg-surface-weak"
        />
        <SelectionColumn
          title="Fixed · data-[selected=true]:"
          note="Matches the attribute cmdk actually writes."
          highlightClass="data-[selected=true]:bg-surface-weak"
        />
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-text-strong">
          Highlight candidates on the popover surface
        </h3>
        <p className="max-w-3xl text-xs text-text-weak">
          Each swatch is the row background over{" "}
          <code className="text-text-base">surface-raised-stronger-non-alpha</code>, the popover's
          own. Pick the pair that survives both themes — switch the theme in the header.
        </p>
        <div
          className={cn(
            "flex flex-col gap-1 rounded-lg p-2 ring-1 ring-border-weak-base",
            POPOVER_SURFACE_CLASS,
          )}
        >
          {HIGHLIGHT_CANDIDATES.map((candidate) => (
            <div
              key={candidate.token}
              className={cn(
                "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm text-text-base",
                candidate.className,
              )}
            >
              <span className="w-64 shrink-0 truncate font-mono text-xs text-text-base">
                {candidate.className}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-text-weak">
                {candidate.note}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-text-strong">The live primitive</h3>
        <p className="max-w-3xl text-xs text-text-weak">
          The shared <code className="text-text-base">Command</code> inside the shared{" "}
          <code className="text-text-base">Popover</code> — arrow keys, hover, and Enter, with
          whatever <code className="text-text-base">command.tsx</code> currently ships.
        </p>
        <div>
          <LiveCommandPopover />
        </div>
      </section>
    </div>
  )
}
