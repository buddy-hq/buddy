import { useState, type ReactNode } from "react"
import { Badge, BookOpenIcon, MessagesSquareIcon, SquarePenIcon, Switch, cn } from "@buddy/ui"
import { Globe, NoteIcon, PresentationIcon, type AppIcon } from "@/icons/app-icons"
import {
  SIDEBAR_ROW_LEADING_GAP_PX,
  SIDEBAR_ROW_LEADING_SLOT_PX,
  SIDEBAR_ROW_PADDING_LEFT_PX,
} from "@/components/layout/chat-left-sidebar/row-geometry"
import {
  ThreadStatusIndicator,
  type ThreadStatus,
} from "@/components/layout/chat-left-sidebar/thread-helpers"

// ---------------------------------------------------------------------------
// The action area above the chat lists is four `text-sm` rows in `text-text-weak`, while
// every chat below it is `text-xs font-light`. It is the largest, brightest text in the
// sidebar and it is not content. Each direction here turns it into Arc-style tiles — soft
// filled squares that read as chrome — and keeps the real section and chat styles below
// so only the action area changes.
// ---------------------------------------------------------------------------

const SIDEBAR_WIDTH_PX = 244

type TAction = {
  id: "chat" | "note" | "board" | "tab"
  label: string
  shortLabel: string
  icon: AppIcon
}

const NEW_CHAT_ACTION: TAction = {
  id: "chat",
  label: "New chat",
  shortLabel: "Chat",
  icon: SquarePenIcon,
}

const SECONDARY_ACTIONS: TAction[] = [
  { id: "note", label: "New note", shortLabel: "Note", icon: NoteIcon },
  { id: "board", label: "New board", shortLabel: "Board", icon: PresentationIcon },
  { id: "tab", label: "New tab", shortLabel: "Tab", icon: Globe },
]

type TMockChat = { id: string; title: string; status: ThreadStatus; active?: boolean }

const RECENT_CHATS: TMockChat[] = [
  { id: "r-1", title: "Recents section in the left sidebar", status: "working", active: true },
  { id: "r-2", title: "Spaced repetition scheduling", status: "unread" },
  { id: "r-3", title: "Why forgetting curves flatten", status: "idle" },
]

const NOTEBOOK_CHATS: TMockChat[] = [
  { id: "n-1", title: "Food Triangle and Ideal Diets", status: "idle" },
  { id: "n-2", title: "How AI Agents Work", status: "idle" },
]

const ACTION_ROW_STYLE = {
  paddingLeft: `${SIDEBAR_ROW_PADDING_LEFT_PX}px`,
  gap: `${SIDEBAR_ROW_LEADING_GAP_PX}px`,
}

// ---------------------------------------------------------------------------
// Shared chrome — frozen copies of the shipped section label and chat row
// ---------------------------------------------------------------------------

function SectionLabel(props: { children: string }) {
  return (
    <p
      className="pt-1 pb-1 text-[13px] font-normal tracking-wide text-icon-base"
      style={{ paddingLeft: `${SIDEBAR_ROW_PADDING_LEFT_PX}px` }}
    >
      {props.children}
    </p>
  )
}

function ChatRow(props: { chat: TMockChat }) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg py-1 pr-2.5",
        props.chat.active
          ? "bg-surface-raised-strong text-text-strong"
          : "text-text-weak hover:bg-surface-raised-base-hover",
      )}
      style={ACTION_ROW_STYLE}
    >
      <span
        className="flex shrink-0 items-center justify-center self-stretch"
        style={{ width: `${SIDEBAR_ROW_LEADING_SLOT_PX}px` }}
      >
        <ThreadStatusIndicator status={props.chat.status} />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-light">{props.chat.title}</span>
    </div>
  )
}

function NotebookHeader(props: { icon: AppIcon; label: string }) {
  const Icon = props.icon
  return (
    <div
      className="flex items-center rounded-lg py-1 text-sm font-light text-text-weak"
      style={ACTION_ROW_STYLE}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{props.label}</span>
    </div>
  )
}

function MockSidebar(props: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border-base bg-surface-raised-base"
      style={{ width: `${SIDEBAR_WIDTH_PX}px` }}
    >
      <div className="flex h-8 items-center gap-1.5 px-3">
        <span className="size-2.5 rounded-full bg-surface-critical-strong" />
        <span className="size-2.5 rounded-full bg-surface-warning-strong" />
        <span className="size-2.5 rounded-full bg-surface-success-strong" />
      </div>
      <div className="px-1.5 pt-3.5 pb-3">
        {props.children}
        <section className="mb-2 space-y-0.5 px-1.5">
          <SectionLabel>Recents</SectionLabel>
          {RECENT_CHATS.map((chat) => (
            <ChatRow key={chat.id} chat={chat} />
          ))}
        </section>
        <div className="px-1.5">
          <SectionLabel>Notebooks</SectionLabel>
          <NotebookHeader icon={MessagesSquareIcon} label="Quick chats" />
          <div className="flex flex-col space-y-0.5">
            {NOTEBOOK_CHATS.map((chat) => (
              <ChatRow key={chat.id} chat={chat} />
            ))}
          </div>
          <div className="mt-1">
            <NotebookHeader icon={BookOpenIcon} label="Learning science" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionIcon(props: { action: TAction; className?: string }) {
  const Icon = props.action.icon
  return (
    <Icon
      className={cn("shrink-0", props.className)}
      strokeWidth={props.action.id === "chat" ? 2 : undefined}
    />
  )
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

/** Arc's favourites: a soft fill that lifts one step on hover, no border. */
const FILLED_TILE_CLASS =
  "rounded-lg bg-surface-raised-base-hover text-icon-base transition-[background-color,color,transform] duration-100 ease-out hover:bg-surface-raised-strong hover:text-text-strong active:scale-[0.97]"

/** Same shape without the fill — a hairline until hovered. */
const OUTLINED_TILE_CLASS =
  "rounded-lg border border-border-weaker-base text-icon-base transition-[background-color,border-color,color,transform] duration-100 ease-out hover:border-transparent hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.97]"

/** With a single action there is nothing to tile, so every direction gives New chat the row. */
function SoloChatTile(props: { tileClass: string }) {
  return (
    <button
      type="button"
      className={cn(
        props.tileClass,
        "flex h-8 w-full items-center justify-center gap-1.5 text-xs font-light text-text-weak",
      )}
    >
      <ActionIcon action={NEW_CHAT_ACTION} className="size-3.5" />
      {NEW_CHAT_ACTION.label}
    </button>
  )
}

type TActionAreaProps = { actions: TAction[] }

/** Frozen copy of the shipped markup: `text-sm` rows, `py-1.5`, `text-text-weak`. */
function CurrentActionArea(props: TActionAreaProps) {
  const rowClass =
    "flex w-full items-center rounded-lg pr-2 py-1.5 text-left text-sm font-light text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
  return (
    <div className="mb-2 px-1.5">
      {props.actions.map((action) => (
        <button key={action.id} type="button" className={rowClass} style={ACTION_ROW_STYLE}>
          <ActionIcon action={action} className="size-3.5" />
          <span className="truncate">{action.label}</span>
        </button>
      ))}
    </div>
  )
}

/** A · Arc's favourites row: four equal filled tiles, icon only. */
function ArcRowActionArea(props: TActionAreaProps) {
  if (props.actions.length === 1) {
    return (
      <div className="mb-3 px-1.5">
        <SoloChatTile tileClass={FILLED_TILE_CLASS} />
      </div>
    )
  }
  return (
    <div className="mb-3 grid grid-cols-4 gap-1.5 px-1.5">
      {props.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-label={action.label}
          title={action.label}
          className={cn(FILLED_TILE_CLASS, "flex h-9 items-center justify-center")}
        >
          <ActionIcon action={action} className="size-4" />
        </button>
      ))}
    </div>
  )
}

/** B · Same row, taller tiles with a caption under the icon. Nothing to learn. */
function ArcCaptionedActionArea(props: TActionAreaProps) {
  if (props.actions.length === 1) {
    return (
      <div className="mb-3 px-1.5">
        <SoloChatTile tileClass={FILLED_TILE_CLASS} />
      </div>
    )
  }
  return (
    <div className="mb-3 grid grid-cols-4 gap-1.5 px-1.5">
      {props.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={cn(
            FILLED_TILE_CLASS,
            "flex h-12 flex-col items-center justify-center gap-1 text-[10px] font-light",
          )}
        >
          <ActionIcon action={action} className="size-4" />
          {action.shortLabel}
        </button>
      ))}
    </div>
  )
}

/** C · New chat is the wide tile with its name; the rest are square icon tiles beside it. */
function ArcWidePrimaryActionArea(props: TActionAreaProps) {
  const [primary, ...secondary] = props.actions
  if (!primary) return null
  return (
    <div className="mb-3 flex gap-1.5 px-1.5">
      <button
        type="button"
        className={cn(
          FILLED_TILE_CLASS,
          "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 text-xs font-light text-text-weak",
        )}
      >
        <ActionIcon action={primary} className="size-3.5" />
        <span className="truncate">{primary.label}</span>
      </button>
      {secondary.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-label={action.label}
          title={action.label}
          className={cn(FILLED_TILE_CLASS, "flex size-9 shrink-0 items-center justify-center")}
        >
          <ActionIcon action={action} className="size-4" />
        </button>
      ))}
    </div>
  )
}

/** D · A 2 × 2 grid of named tiles — every action labelled, two rows of height. */
function ArcGridActionArea(props: TActionAreaProps) {
  if (props.actions.length === 1) {
    return (
      <div className="mb-3 px-1.5">
        <SoloChatTile tileClass={FILLED_TILE_CLASS} />
      </div>
    )
  }
  return (
    <div className="mb-3 grid grid-cols-2 gap-1.5 px-1.5">
      {props.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={cn(
            FILLED_TILE_CLASS,
            "flex h-8 min-w-0 items-center gap-1.5 px-2.5 text-xs font-light",
            action.id === "chat" ? "text-text-weak" : undefined,
          )}
        >
          <ActionIcon action={action} className="size-3.5" />
          <span className="truncate">{action.shortLabel}</span>
        </button>
      ))}
    </div>
  )
}

/** E · Arc's row with no fill: hairline tiles that only fill on hover. The quietest tiles. */
function ArcOutlinedActionArea(props: TActionAreaProps) {
  if (props.actions.length === 1) {
    return (
      <div className="mb-3 px-1.5">
        <SoloChatTile tileClass={OUTLINED_TILE_CLASS} />
      </div>
    )
  }
  return (
    <div className="mb-3 grid grid-cols-4 gap-1.5 px-1.5">
      {props.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-label={action.label}
          title={action.label}
          className={cn(OUTLINED_TILE_CLASS, "flex h-9 items-center justify-center")}
        >
          <ActionIcon action={action} className="size-4" />
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

type TDirection = {
  id: string
  name: string
  badge?: string
  summary: string
  notes: string[]
  render: (props: TActionAreaProps) => ReactNode
}

const DIRECTIONS: TDirection[] = [
  {
    id: "current",
    name: "Current",
    badge: "Shipped",
    summary: "Four text-sm rows at text-weak — the loudest text in the sidebar.",
    notes: ["~128px tall with every action", "Heavier than the chat titles it sits above"],
    render: (props) => <CurrentActionArea {...props} />,
  },
  {
    id: "arc-row",
    name: "A · Arc row",
    badge: "Closest to Arc",
    summary: "Four equal filled tiles, icon only — Arc's favourites row.",
    notes: ["36px tall", "Reads as chrome, not a list", "Names live in tooltips only"],
    render: (props) => <ArcRowActionArea {...props} />,
  },
  {
    id: "arc-captioned",
    name: "B · Captioned tiles",
    summary: "The same row, a little taller, with a 10px caption under each icon.",
    notes: ["48px tall", "Every action named without a tooltip", "Most app-launcher-like"],
    render: (props) => <ArcCaptionedActionArea {...props} />,
  },
  {
    id: "arc-wide-primary",
    name: "C · Wide New chat",
    summary: "New chat takes the wide tile with its name; note, board and tab are square tiles.",
    notes: [
      "36px tall",
      "Keeps New chat obviously first",
      "Secondary tiles are learned by icon",
    ],
    render: (props) => <ArcWidePrimaryActionArea {...props} />,
  },
  {
    id: "arc-grid",
    name: "D · 2 × 2 grid",
    summary: "Four named tiles in two columns — Chat, Note, Board, Tab.",
    notes: ["70px tall — still half the current height", "Every action labelled at a glance"],
    render: (props) => <ArcGridActionArea {...props} />,
  },
  {
    id: "arc-outlined",
    name: "E · Outlined tiles",
    summary: "Arc's row without the fill: hairline tiles that fill only on hover.",
    notes: ["36px tall", "Quietest of the tile options", "Hairlines add four more edges"],
    render: (props) => <ArcOutlinedActionArea {...props} />,
  },
]

export function SidebarActionAreaEasel() {
  const [chatOpen, setChatOpen] = useState(true)
  const actions = chatOpen ? [NEW_CHAT_ACTION, ...SECONDARY_ACTIONS] : [NEW_CHAT_ACTION]

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-background-base">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-weaker-base px-4 py-2">
        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-medium text-text-base">Left sidebar · action area</p>
          <p className="truncate text-[11px] text-text-weaker">
            New chat, note, board and tab outrank every chat below them · five Arc-style tile
            directions
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="sidebar-action-chat-open" className="text-xs text-text-weak">
              Chat open
            </label>
            <Switch
              id="sidebar-action-chat-open"
              size="sm"
              checked={chatOpen}
              aria-label="Show the actions that need an open chat"
              onCheckedChange={setChatOpen}
            />
          </div>
          <Badge variant="outline">Easel</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-8 p-6">
        {DIRECTIONS.map((direction) => (
          <div key={direction.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text-strong">{direction.name}</p>
              {direction.badge ? <Badge variant="outline">{direction.badge}</Badge> : null}
            </div>
            <MockSidebar>{direction.render({ actions })}</MockSidebar>
            <div className="flex flex-col gap-1.5" style={{ width: `${SIDEBAR_WIDTH_PX}px` }}>
              <p className="text-xs leading-relaxed text-text-weak">{direction.summary}</p>
              <ul className="space-y-0.5 text-[11px] leading-relaxed text-text-weaker">
                {direction.notes.map((note) => (
                  <li key={note}>· {note}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
