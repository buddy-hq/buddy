import { useRef, useState, type RefObject } from "react"
import { cn } from "@buddy/ui"
import {
  ArrowLeftIcon,
  BookOpenIcon,
  FolderIcon,
  Globe,
  NoteIcon,
  PlusIcon,
  PresentationIcon,
  SearchIcon,
  WorkflowIcon,
  type AppIcon,
} from "@/icons/app-icons"

type Direction = "search" | "list" | "launcher"
type Destination = { label: string; icon: AppIcon }

const CREATE: Destination[] = [
  { label: "New board", icon: PresentationIcon },
  { label: "New note", icon: NoteIcon },
  { label: "New tab", icon: Globe },
  { label: "New diagram", icon: WorkflowIcon },
]

const OPEN: Destination[] = [
  { label: "Search", icon: SearchIcon },
  { label: "Sources", icon: BookOpenIcon },
  { label: "Boards", icon: PresentationIcon },
  { label: "Files", icon: FolderIcon },
  { label: "Browser", icon: Globe },
]

const EXAMPLE_RESULTS: Destination[] = [
  { label: "Learning science", icon: PresentationIcon },
  { label: "Chapter 4: Recall", icon: BookOpenIcon },
  { label: "Memory notes", icon: NoteIcon },
]

const FOCUS_CLASS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"

function Rail(props: { onSearch: () => void; onOpen: (item: Destination) => void }) {
  const items = OPEN.slice(0, 4)
  return (
    <nav
      aria-label="Prototype right rail"
      className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-border-weaker-base bg-background-base px-1 py-2"
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.label}
            type="button"
            aria-label={item.label}
            title={item.label}
            className={cn(
              FOCUS_CLASS,
              "flex size-8 items-center justify-center rounded-lg text-icon-base hover:bg-surface-raised-base-hover hover:text-text-strong",
            )}
            onClick={() => item.label === "Search" ? props.onSearch() : props.onOpen(item)}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        )
      })}
    </nav>
  )
}

function SearchLanding(props: {
  query: string
  onQueryChange: (query: string) => void
  inputRef: RefObject<HTMLInputElement>
  onOpen: (item: Destination) => void
}) {
  const results = EXAMPLE_RESULTS.filter((item) =>
    item.label.toLowerCase().includes(props.query.trim().toLowerCase()),
  )
  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-y-auto px-7 pt-[min(24vh,180px)]">
      <div className="w-full max-w-lg">
        <div className="flex h-11 items-center gap-3 rounded-xl border border-border-base bg-surface-raised-base px-3 focus-within:border-border-interactive-base">
          <SearchIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
          <input
            ref={props.inputRef}
            type="search"
            aria-label="Search this notebook"
            placeholder="Search this notebook"
            value={props.query}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-strong outline-none placeholder:text-text-weaker"
            onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          />
        </div>
        {props.query.trim() ? (
          <div className="mt-3 flex flex-col gap-1">
            {results.length ? results.map((item) => (
              <Choice key={item.label} item={item} onClick={() => props.onOpen(item)} />
            )) : <p className="px-2 py-3 text-xs text-text-weaker">No matches</p>}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-2">
            {CREATE.map((item) => (
              <Choice key={item.label} item={item} onClick={() => props.onOpen(item)} boxed />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Choice(props: { item: Destination; boxed?: boolean; onClick: () => void }) {
  const Icon = props.item.icon
  return (
    <button
      type="button"
      className={cn(
        FOCUS_CLASS,
        "flex h-10 items-center gap-3 rounded-lg px-3 text-left text-sm text-text-base hover:bg-surface-raised-base-hover active:scale-[0.98]",
        props.boxed && "border border-border-weaker-base hover:border-border-base",
      )}
      onClick={props.onClick}
    >
      <Icon className="size-4 shrink-0 text-icon-base" aria-hidden />
      <span className="truncate">{props.item.label}</span>
    </button>
  )
}

function ListLanding(props: {
  onSearch: () => void
  onOpen: (item: Destination) => void
}) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto px-7 py-12">
      <div className="w-full max-w-xs">
        <p className="mb-4 text-center text-sm text-text-weak">Open on Bench</p>
        <div className="flex flex-col gap-0.5">
          {OPEN.map((item) => (
            <Choice
              key={item.label}
              item={item}
              onClick={() => item.label === "Search" ? props.onSearch() : props.onOpen(item)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function OpenedSurface(props: { item: Destination; onBack: () => void }) {
  const Icon = props.item.icon
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-2 border-b border-border-weaker-base px-3">
        <button
          type="button"
          aria-label="Back to empty Bench"
          className={cn(FOCUS_CLASS, "rounded-md p-1 text-icon-base hover:bg-surface-raised-base-hover")}
          onClick={props.onBack}
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
        </button>
        <span className="text-xs text-text-base">{props.item.label}</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-weak">
        <Icon className="size-6" aria-hidden />
        <span className="text-sm">{props.item.label}</span>
      </div>
    </div>
  )
}

export function BenchEmptyStateEasel() {
  const [direction, setDirection] = useState<Direction>("search")
  const [query, setQuery] = useState("")
  const [opened, setOpened] = useState<Destination>()
  const [launcherOpen, setLauncherOpen] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

  function selectDirection(next: Direction) {
    setDirection(next)
    setQuery("")
    setOpened(undefined)
    setLauncherOpen(true)
  }

  function goToSearch() {
    selectDirection("search")
    window.requestAnimationFrame(() => searchRef.current?.focus())
  }

  const closed = direction === "launcher" && !opened

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background-base">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-weaker-base px-4 py-2">
        <span className="text-xs font-medium text-text-weak">Empty Bench</span>
        <div className="flex items-center gap-1" role="group" aria-label="Choose empty Bench design">
          {([
            ["search", "Search"],
            ["list", "List"],
            ["launcher", "Choose first"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={direction === id}
              className={cn(
                FOCUS_CLASS,
                "rounded-md px-3 py-1.5 text-xs",
                direction === id
                  ? "bg-surface-raised-base text-text-strong"
                  : "text-text-weak hover:bg-surface-raised-base-hover",
              )}
              onClick={() => selectDirection(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <div className="relative mx-auto flex h-full min-h-[480px] w-full max-w-6xl overflow-hidden rounded-xl border border-border-base bg-background-base shadow-lg">
          <div className={cn(
            "relative hidden border-r border-border-weaker-base bg-surface-inset-base lg:block",
            closed ? "flex-1" : "w-[28%] shrink-0",
          )}>
            {closed ? (
              <button
                type="button"
                className={cn(
                  FOCUS_CLASS,
                  "absolute right-4 top-3 flex h-8 items-center gap-1.5 rounded-lg border border-border-weaker-base bg-background-base px-3 text-xs text-text-base hover:bg-surface-raised-base-hover",
                )}
                onClick={() => setLauncherOpen(true)}
              >
                <PlusIcon className="size-3.5" aria-hidden />
                Open Bench
              </button>
            ) : null}
          </div>
          {!closed ? (
            <>
              <main className="min-w-0 flex-1">
                {opened ? (
                  <OpenedSurface item={opened} onBack={() => {
                    setOpened(undefined)
                    setLauncherOpen(true)
                  }} />
                ) : direction === "search" ? (
                  <SearchLanding
                    query={query}
                    onQueryChange={setQuery}
                    inputRef={searchRef}
                    onOpen={setOpened}
                  />
                ) : (
                  <ListLanding onSearch={goToSearch} onOpen={setOpened} />
                )}
              </main>
              <Rail onSearch={goToSearch} onOpen={setOpened} />
            </>
          ) : (
            <button
              type="button"
              className={cn(
                FOCUS_CLASS,
                "flex flex-1 items-start justify-end p-4 text-xs text-text-weak lg:hidden",
              )}
              onClick={() => setLauncherOpen(true)}
            >
              <PlusIcon className="mr-1 size-3.5" aria-hidden />
              Open Bench
            </button>
          )}
          {closed && launcherOpen ? (
            <div className="absolute right-4 top-14 w-64 rounded-xl border border-border-base bg-background-base p-2 shadow-xl">
              {[OPEN[0]!, CREATE[0]!, CREATE[1]!, CREATE[2]!].map((item) => (
                <Choice
                  key={item.label}
                  item={item}
                  onClick={() => item.label === "Search" ? goToSearch() : setOpened(item)}
                />
              ))}
              <button
                type="button"
                className={cn(FOCUS_CLASS, "mt-1 w-full rounded-md px-3 py-1.5 text-right text-xs text-text-weaker hover:text-text-base")}
                onClick={() => setLauncherOpen(false)}
              >
                Close
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
