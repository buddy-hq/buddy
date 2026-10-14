import { Fragment, useState, type KeyboardEvent } from "react"
import { cn } from "@buddy/ui"
import { Kbd } from "@buddy/ui/components/ui/kbd"
import { ChevronRightIcon, PinIcon, SearchIcon } from "@/icons/app-icons"
import { BENCH_CHAT_ART } from "@/components/bench/bench-action-art"
import {
  COMMANDS,
  DEFAULT_PIN_IDS,
  KIND_ART,
  KIND_LABEL,
  KIND_PLURAL,
  RECENTS,
  itemByID,
  looksLikeUrl,
  primaryVerb,
  scopeFromKeyword,
  searchCommands,
  searchItems,
  type HomeCommand,
  type HomeItem,
  type HomeKind,
} from "./mock"
import {
  ALT_LABEL,
  ArtGlyph,
  ItemGlyph,
  ItemMeta,
  KeyHints,
  WebGlyph,
  useAutoFocus,
  useListNav,
  type RunAction,
} from "./shared"

// ---------------------------------------------------------------------------
// 01 · One list. Raycast's model: the bar and a single keyboard list are the whole
// page. Pins, recents, create, Buddy and browse are sections of that list; typing
// filters all of it at once. The library is not a place on the page, it is a
// scope: "books" + Tab lists every book. Commands take their text inline.
// ---------------------------------------------------------------------------

type Row =
  | { type: "item"; item: HomeItem; pinSlot?: number }
  | { type: "command"; command: HomeCommand }
  | { type: "scope"; kind: HomeKind }
  | { type: "ask"; text: string }
  | { type: "web"; text: string }
  | { type: "create"; command: HomeCommand; text: string }

type Section = { label: string; rows: Row[] }

type RowAction = { label: string; run: () => void; hint?: string }

const SCOPE_COMMAND = {
  book: "add-resource",
  note: "new-note",
  board: "new-board",
  practice: "quiz",
  chat: "ask",
  page: "new-tab",
  file: "new-note",
  creation: "summarize",
} as const satisfies Record<HomeKind, string>

const ARGUMENT_KINDS: ReadonlySet<HomeKind> = new Set(["book", "note", "practice", "page"])

function rowKey(row: Row): string {
  switch (row.type) {
    case "item":
      return `item:${row.item.id}`
    case "command":
      return `command:${row.command.id}`
    case "scope":
      return `scope:${row.kind}`
    case "ask":
      return "ask"
    case "web":
      return "web"
    case "create":
      return `create:${row.command.id}`
  }
}

export function OneListVariant(props: { run: RunAction }) {
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<HomeKind>()
  const [argument, setArgument] = useState<HomeCommand>()
  const [pins, setPins] = useState<string[]>([...DEFAULT_PIN_IDS])
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionIndex, setActionIndex] = useState(0)
  const inputRef = useAutoFocus<HTMLInputElement>()

  const sections = buildSections({ query, scope, argument, pins })
  const rows = sections.flatMap((section) => section.rows)
  const nav = useListNav(rows.length, `${query}|${scope ?? ""}|${argument?.id ?? ""}`)
  const activeRow = nav.active >= 0 ? rows[nav.active] : undefined
  const keywordScope = !scope && !argument ? scopeFromKeyword(query) : undefined
  const actions = activeRow ? rowActions(activeRow) : []

  function reset(next?: { scope?: HomeKind; argument?: HomeCommand }) {
    setQuery("")
    setScope(next?.scope)
    setArgument(next?.argument)
    setActionsOpen(false)
    inputRef.current?.focus()
  }

  function togglePin(item: HomeItem) {
    setPins((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
    )
  }

  function runRow(row: Row) {
    switch (row.type) {
      case "item":
        props.run(`${primaryVerb(row.item)} — “${row.item.title}” opens in this tab`)
        return
      case "command":
        if (row.command.scope) reset({ scope: row.command.scope })
        else if (row.command.argument) reset({ argument: row.command })
        else props.run("File picker opens · the book lands in Books and opens here")
        return
      case "scope":
        reset({ scope: row.kind })
        return
      case "ask":
        props.run(`Chat beside the Bench asks Buddy: “${row.text}”`)
        return
      case "web":
        props.run(looksLikeUrl(row.text) ? `Browser tab opens ${row.text}` : `Browser tab searches the web for “${row.text}”`)
        return
      case "create":
        props.run(createMessage(row.command, row.text))
        return
    }
  }

  function rowActions(row: Row): RowAction[] {
    if (row.type !== "item") return [{ label: "Run", hint: "↵", run: () => runRow(row) }]
    const item = row.item
    const pinned = pins.includes(item.id)
    return [
      { label: primaryVerb(item), hint: "↵", run: () => runRow(row) },
      { label: pinned ? "Unpin" : "Pin to top", run: () => togglePin(item) },
      { label: `Ask Buddy about “${item.title}”`, run: () => reset({ argument: COMMANDS.find((command) => command.id === "ask") }) },
      ...(item.kind === "book" || item.kind === "note"
        ? [
            { label: "Quiz me on this", run: () => props.run(`Buddy writes a quiz on “${item.title}” · opens in Practice`) },
            { label: "Make flashcards", run: () => props.run(`Buddy drafts flashcards from “${item.title}”`) },
          ]
        : []),
      { label: "Show in Files", run: () => props.run(`Files opens with “${item.title}” selected`) },
    ]
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (actionsOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const delta = event.key === "ArrowDown" ? 1 : -1
        setActionIndex((index) => (index + delta + actions.length) % actions.length)
      } else if (event.key === "Enter") {
        event.preventDefault()
        actions[actionIndex]?.run()
        setActionsOpen(false)
      } else if (event.key === "Escape" || event.key === "ArrowLeft") {
        event.preventDefault()
        setActionsOpen(false)
      }
      return
    }
    if (event.altKey && /^Digit[1-5]$/u.test(event.code)) {
      const pin = pins[Number(event.code.slice(5)) - 1]
      if (pin) {
        event.preventDefault()
        runRow({ type: "item", item: itemByID(pin) })
      }
      return
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault()
        nav.move(event.key === "ArrowDown" ? 1 : -1)
        return
      case "Enter":
        event.preventDefault()
        if (activeRow) runRow(activeRow)
        return
      case "ArrowRight": {
        const input = event.currentTarget
        if (activeRow && input.selectionStart === input.value.length) {
          event.preventDefault()
          setActionIndex(0)
          setActionsOpen(true)
        }
        return
      }
      case "Tab":
        if (keywordScope) {
          event.preventDefault()
          reset({ scope: keywordScope })
        } else if (activeRow?.type === "command" && (activeRow.command.argument || activeRow.command.scope)) {
          event.preventDefault()
          runRow(activeRow)
        } else if (activeRow?.type === "scope") {
          event.preventDefault()
          reset({ scope: activeRow.kind })
        }
        return
      case "Backspace":
        if (query === "" && (scope || argument)) {
          event.preventDefault()
          reset()
        }
        return
      case "Escape":
        event.preventDefault()
        if (query) setQuery("")
        else reset()
        return
    }
  }

  let index = -1
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden px-4 pt-8">
        <div className="relative flex min-h-0 w-full max-w-[560px] flex-col">
          <div className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border-base bg-surface-raised-base px-3 focus-within:border-border-interactive-base">
            <SearchIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
            {scope || argument ? (
              <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-raised-stronger-non-alpha px-1.5 py-0.5 text-xs text-text-strong">
                {argument ? argument.title.replace("…", "") : KIND_PLURAL[scope ?? "book"]}
                <ChevronRightIcon className="size-3 text-icon-base" aria-hidden />
              </span>
            ) : null}
            <input
              ref={inputRef}
              type="text"
              aria-label="Search or run a command"
              placeholder={
                argument?.argument ??
                (scope ? `Search ${KIND_PLURAL[scope].toLowerCase()}` : "Search, ask Buddy, or run a command")
              }
              value={query}
              className="min-w-0 flex-1 bg-transparent text-sm text-text-strong outline-none placeholder:text-text-weaker"
              onChange={(event) => {
                setQuery(event.currentTarget.value)
                setActionsOpen(false)
              }}
              onKeyDown={onKeyDown}
            />
            {keywordScope ? (
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-text-weaker">
                <Kbd>Tab</Kbd> search {KIND_PLURAL[keywordScope].toLowerCase()}
              </span>
            ) : scope || argument ? (
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-text-weaker">
                <Kbd>⌫</Kbd> back
              </span>
            ) : null}
          </div>

          <div ref={nav.listRef} className="mt-2 min-h-0 flex-1 overflow-y-auto pb-6">
            {sections.map((section) => (
              <Fragment key={section.label}>
                <p className="px-2 pt-3 pb-1 text-[11px] font-medium text-text-weaker">{section.label}</p>
                {section.rows.map((row) => {
                  index += 1
                  const rowIndex = index
                  return (
                    <RowButton
                      key={rowKey(row)}
                      row={row}
                      index={rowIndex}
                      active={rowIndex === nav.active}
                      onHover={() => nav.select(rowIndex)}
                      onRun={() => runRow(row)}
                    />
                  )
                })}
              </Fragment>
            ))}
            {rows.length === 0 ? (
              <p className="px-2 py-4 text-xs text-text-weaker">Nothing here yet.</p>
            ) : null}
          </div>

          {actionsOpen && actions.length > 0 ? (
            <div className="absolute right-0 bottom-3 w-64 rounded-xl border border-border-base bg-surface-raised-stronger-non-alpha p-1 shadow-xl">
              {actions.map((action, actionPosition) => (
                <button
                  key={action.label}
                  type="button"
                  className={cn(
                    "flex h-8 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-xs text-text-base",
                    actionPosition === actionIndex && "bg-surface-raised-base-hover",
                  )}
                  onMouseMove={() => setActionIndex(actionPosition)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    action.run()
                    setActionsOpen(false)
                  }}
                >
                  <span className="truncate">{action.label}</span>
                  {action.hint ? <Kbd>{action.hint}</Kbd> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-border-weaker-base px-3">
        <span className="truncate text-[11px] text-text-weaker">Learning science</span>
        <KeyHints
          hints={[
            ["↵", activeRow?.type === "item" ? primaryVerb(activeRow.item) : "Run"],
            ["Tab", "Complete"],
            ["→", "Actions"],
          ]}
        />
      </div>
    </div>
  )
}

function RowButton(props: { row: Row; index: number; active: boolean; onHover: () => void; onRun: () => void }) {
  const row = props.row
  return (
    <button
      type="button"
      tabIndex={-1}
      data-nav-index={props.index}
      className={cn(
        "flex h-10 w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 text-left text-sm text-text-base",
        props.active && "bg-surface-raised-base",
      )}
      onMouseMove={props.onHover}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onRun}
    >
      {row.type === "item" ? (
        <ItemGlyph item={row.item} />
      ) : row.type === "command" || row.type === "create" ? (
        <ArtGlyph src={row.command.art} />
      ) : row.type === "scope" ? (
        <ArtGlyph src={KIND_ART[row.kind]} />
      ) : row.type === "ask" ? (
        <ArtGlyph src={BENCH_CHAT_ART} />
      ) : (
        <WebGlyph />
      )}
      <span className="min-w-0 flex-1 truncate">
        {rowTitle(row)}
        {row.type === "item" ? (
          <span className="ml-2 text-xs text-text-weaker">
            {row.item.kind === "book" ? row.item.detail : KIND_LABEL[row.item.kind]}
          </span>
        ) : row.type === "command" ? (
          <span className="ml-2 text-xs text-text-weaker">{row.command.description}</span>
        ) : null}
      </span>
      {row.type === "item" && row.pinSlot !== undefined ? (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-text-weaker">
          <PinIcon className="size-3" aria-hidden />
          <Kbd>
            {ALT_LABEL}
            {row.pinSlot + 1}
          </Kbd>
        </span>
      ) : row.type === "item" ? (
        <ItemMeta item={row.item} />
      ) : row.type === "command" && (row.command.argument || row.command.scope) && props.active ? (
        <Kbd>Tab</Kbd>
      ) : null}
    </button>
  )
}

function rowTitle(row: Row): string {
  switch (row.type) {
    case "item":
      return row.item.title
    case "command":
      return row.command.title
    case "scope":
      return `Search ${KIND_PLURAL[row.kind].toLowerCase()}`
    case "ask":
      return `Ask Buddy “${row.text}”`
    case "web":
      return looksLikeUrl(row.text) ? `Open ${row.text}` : `Search the web for “${row.text}”`
    case "create":
      return createTitle(row.command, row.text)
  }
}

function createTitle(command: HomeCommand, text: string): string {
  switch (command.id) {
    case "new-note":
      return `Create note “${text}”`
    case "new-board":
      return `Create board “${text}”`
    case "ask":
      return `Ask Buddy “${text}”`
    default:
      return `${command.title.replace("…", "")} “${text}”`
  }
}

function createMessage(command: HomeCommand, text: string): string {
  switch (command.id) {
    case "new-note":
      return `Note “${text}” is created and opens in this tab`
    case "new-board":
      return `Board “${text}” is created and opens in this tab`
    case "ask":
      return `Chat beside the Bench asks Buddy: “${text}”`
    case "new-tab":
      return looksLikeUrl(text) ? `Browser tab opens ${text}` : `Browser tab searches the web for “${text}”`
    default:
      return `Buddy runs “${command.title.replace("…", "")} ${text}” in the chat`
  }
}

function buildSections(input: {
  query: string
  scope: HomeKind | undefined
  argument: HomeCommand | undefined
  pins: readonly string[]
}): Section[] {
  const text = input.query.trim()

  // A command that takes text: its own preview first, then things it could be about.
  if (input.argument) {
    const command = input.argument
    const aboutSomething = command.group === "buddy" && command.id !== "ask"
    const suggestions = aboutSomething
      ? searchItems(text).filter((item) => ARGUMENT_KINDS.has(item.kind)).slice(0, 6)
      : []
    return [
      ...(text ? [{ label: command.title.replace("…", ""), rows: [{ type: "create" as const, command, text }] }] : []),
      ...(suggestions.length > 0
        ? [{ label: text ? "Matching" : "Pick one", rows: suggestions.map((item) => ({ type: "item" as const, item })) }]
        : []),
    ]
  }

  // Inside a scope: the whole library of that kind, with its one create command.
  if (input.scope) {
    const scoped = searchItems(text, input.scope)
    const command = COMMANDS.find((candidate) => candidate.id === SCOPE_COMMAND[input.scope ?? "book"])
    return [
      { label: KIND_PLURAL[input.scope], rows: scoped.map((item) => ({ type: "item" as const, item })) },
      ...(command ? [{ label: "Create", rows: [{ type: "command" as const, command }] }] : []),
    ]
  }

  if (!text) {
    const pinned = input.pins.map((id, slot) => ({ type: "item" as const, item: itemByID(id), pinSlot: slot < 5 ? slot : undefined }))
    const recent = RECENTS.filter((item) => !input.pins.includes(item.id)).slice(0, 4)
    return [
      { label: "Pinned", rows: pinned },
      { label: "Continue", rows: recent.map((item) => ({ type: "item" as const, item })) },
      { label: "Create", rows: COMMANDS.filter((command) => command.group === "create").map((command) => ({ type: "command" as const, command })) },
      { label: "Ask Buddy", rows: COMMANDS.filter((command) => command.group === "buddy").map((command) => ({ type: "command" as const, command })) },
      {
        label: "Browse",
        rows: COMMANDS.filter((command) => command.group === "open").map((command) => ({ type: "command" as const, command })),
      },
    ].filter((section) => section.rows.length > 0)
  }

  const keywordScope = scopeFromKeyword(text)
  const items = searchItems(text).slice(0, 8)
  const commands = searchCommands(text).filter((command) => command.scope !== keywordScope)
  return [
    ...(keywordScope ? [{ label: "Scope", rows: [{ type: "scope" as const, kind: keywordScope }] }] : []),
    ...(items.length > 0 ? [{ label: "Results", rows: items.map((item) => ({ type: "item" as const, item })) }] : []),
    ...(commands.length > 0 ? [{ label: "Commands", rows: commands.map((command) => ({ type: "command" as const, command })) }] : []),
    { label: "Anything else", rows: [{ type: "ask", text }, { type: "web", text }] },
  ]
}
