import { useState, type ReactNode } from "react"
import { Badge, cn } from "@buddy/ui"
import { BenchFrame, FOCUS_RING, type FrameWidth, type RunAction } from "./shared"
import { OneListVariant } from "./variant-one-list"
import { ShelfVariant } from "./variant-shelf"
import { ShelfCoversVariant } from "./variant-shelf-covers"
import { ShelfDockVariant } from "./variant-shelf-dock"
import { ShelfContinueVariant } from "./variant-shelf-continue"

// ---------------------------------------------------------------------------
// The empty Bench is the notebook's home: one bar that holds search, commands and
// Buddy (Raycast / Arc), with the library nearby. 01 is the keyboard list; 02 is
// the shelf, and 02a–c are calmer takes on it that each keep only one or two
// things on the page. UX only — every action is simulated and announced.
// ---------------------------------------------------------------------------

type DirectionID = "one-list" | "shelf" | "shelf-covers" | "shelf-dock" | "shelf-continue"

type Direction = {
  id: DirectionID
  number: string
  name: string
  idea: string
  notes: ReadonlyArray<readonly [string, readonly string[]]>
  render: (run: RunAction) => ReactNode
}

const DIRECTIONS: readonly Direction[] = [
  {
    id: "one-list",
    number: "01",
    name: "One list",
    idea: "Raycast. The bar and one keyboard list are the whole page: Pinned, Continue, Create, Ask Buddy and Browse are sections of the same list; typing filters all of them.",
    notes: [
      ["Try", ["Type “boo”, Tab", "Select New note, Tab, type a title, Enter", "Select a book, press →", "⌥1 opens the first pin"]],
      ["Trade-offs", ["Fastest by keyboard", "Covers shrink to row icons", "Long list before typing"]],
    ],
    render: (run) => <OneListVariant run={run} />,
  },
  {
    id: "shelf",
    number: "02",
    name: "Shelf",
    idea: "Arc's new tab. A visual shelf — quick-action chips, pinned tiles, reading covers, jump-back cards — with a menu that drops over it as you type: a Top hit with actions, suggestions, then Ask Buddy and the web.",
    notes: [
      ["On the page", ["Four blocks: chips, pins, covers, cards."]],
      ["Why 02a–c", ["Too much at once. Each take below keeps the bar and the no-dead-end search, and cuts the page to one or two things."]],
    ],
    render: (run) => <ShelfVariant run={run} />,
  },
  {
    id: "shelf-covers",
    number: "02a",
    name: "Covers",
    idea: "The shelf is only the books you are reading. Everything else is one search away.",
    notes: [
      ["On the page", ["Bar + reading covers with progress. Add book is the last cover."]],
      ["Creating", ["Three quiet icons at the end of the bar — note, board, browser. They hide while you type."]],
      ["Typing", ["A plain list drops over the covers: first match is a taller row, then Ask Buddy and the web."]],
      ["Dropped", ["Pins", "Quick-action chips", "Jump-back cards", "Top-hit buttons and key hints"]],
      ["Trade-offs", ["Calmest; reading is the hero", "Practice, chats and notes are not visible until you search"]],
    ],
    render: (run) => <ShelfCoversVariant run={run} />,
  },
  {
    id: "shelf-dock",
    number: "02b",
    name: "Dock",
    idea: "Safari favourites. One grid of tiles; making something and opening something look the same.",
    notes: [
      ["On the page", ["Bar + one grid: four make tiles (small plus badge), then your pins. Practice shows its due count."]],
      ["Recents", ["Not on the page. Click into the bar or press ↓ and the last five appear, omnibox-style."]],
      ["Typing", ["Same plain list as 02a."]],
      ["Try", ["Click the bar with no text", "Right-click a pin to unpin it"]],
      ["Trade-offs", ["Most launcher-like; one pattern to learn", "Books lose their covers’ progress", "Recents hide behind a click"]],
    ],
    render: (run) => <ShelfDockVariant run={run} />,
  },
  {
    id: "shelf-continue",
    number: "02c",
    name: "Continue",
    idea: "One decision. The page answers “what was I doing?” and offers the next step.",
    notes: [
      ["On the page", ["Bar + one large card for the thing you were in (Resume, Quiz me) + three “Up next” rows."]],
      ["Creating", ["A single line of text links at the bottom."]],
      ["Typing", ["No overlay — results replace the page in place; Esc brings it back."]],
      ["Trade-offs", ["Strongest pull back into studying", "Only one book is visible", "Hero must be picked well (last opened? most due?)"]],
    ],
    render: (run) => <ShelfContinueVariant run={run} />,
  },
]

export function BenchHomeDirectionsEasel() {
  const [directionID, setDirectionID] = useState<DirectionID>("shelf-covers")
  const [width, setWidth] = useState<FrameWidth>("wide")
  const [lastRun, setLastRun] = useState<{ id: number; message: string }>()
  const direction = DIRECTIONS.find((candidate) => candidate.id === directionID) ?? DIRECTIONS[0]!

  const run: RunAction = (message) => setLastRun((current) => ({ id: (current?.id ?? 0) + 1, message }))

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-background-base">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-weaker-base px-4 py-2">
        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-medium text-text-base">Empty Bench · notebook home</p>
          <p className="truncate text-[11px] text-text-weaker">
            One bar for search, commands and Buddy · the list, the shelf, and three calmer shelves · mock data
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Segmented
            label="Direction"
            value={directionID}
            options={DIRECTIONS.map((candidate) => [candidate.id, `${candidate.number} ${candidate.name}`] as const)}
            onChange={(next) => {
              setDirectionID(next)
              setLastRun(undefined)
            }}
          />
          <Segmented
            label="Bench width"
            value={width}
            options={[["narrow", "Narrow"], ["wide", "Wide"]] as const}
            onChange={setWidth}
          />
          <Badge variant="outline">Easel</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-8 p-6">
        <BenchFrame key={`${direction.id}:${width}`} width={width} lastRun={lastRun}>
          {direction.render(run)}
        </BenchFrame>

        <aside className="flex w-[300px] shrink-0 flex-col gap-4 pt-1">
          <div>
            <p className="text-[11px] text-text-weaker">{direction.number}</p>
            <p className="text-sm font-medium text-text-strong">{direction.name}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-text-weak">{direction.idea}</p>
          </div>
          {direction.notes.map(([title, body]) => (
            <div key={title}>
              <p className="mb-1 text-[11px] font-medium text-text-base">{title}</p>
              {body.length === 1 ? (
                <p className="text-xs leading-relaxed text-text-weak">{body[0]}</p>
              ) : (
                <ul className="space-y-0.5 text-xs leading-relaxed text-text-weak">
                  {body.map((line) => (
                    <li key={line}>· {line}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}

function Segmented<TValue extends string>(props: {
  label: string
  value: TValue
  options: ReadonlyArray<readonly [TValue, string]>
  onChange: (value: TValue) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface-inset-base p-0.5" role="group" aria-label={props.label}>
      {props.options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={props.value === value}
          className={cn(
            FOCUS_RING,
            "rounded-md px-2.5 py-1 text-xs",
            props.value === value ? "bg-background-base text-text-strong shadow-sm" : "text-text-weak hover:text-text-base",
          )}
          onClick={() => props.onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
