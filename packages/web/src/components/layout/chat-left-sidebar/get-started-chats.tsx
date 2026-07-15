import { useState, type ComponentType, type SVGProps } from "react"
import {
  Bookmark,
  BookOpen,
  Brain,
  Compass,
  Dna,
  Gamepad2,
  Layers,
  Lightbulb,
  PencilRuler,
  ScrollText,
} from "lucide-react"
import {
  ChevronRightIcon,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  XIcon,
  cn,
} from "@buddy/ui"
import {
  GET_STARTED_CAPABILITY,
  GET_STARTED_CAPABILITY_LABEL,
  GET_STARTED_ICON,
  type GetStartedCapability,
  type GetStartedChat,
  type GetStartedIconId,
} from "@/lib/get-started-chats"
import { language } from "@/context/language"

/** Board hover cards wait so they don't flash on every pass over the grid. */
const BOARD_HOVER_CARD_OPEN_DELAY_MS = 1200

export type GetStartedChatsVariant = "sidebar" | "board"

type GetStartedChatsProps = {
  chats: readonly GetStartedChat[]
  disabled?: boolean
  onStart: (chat: GetStartedChat) => Promise<void> | void
  onDismiss: () => void
  /** Sidebar list (default) or Option B–style scenario cards on the empty board. */
  variant?: GetStartedChatsVariant
}

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

/** Full Lucide set — not limited to `@buddy/ui` re-exports. */
const GET_STARTED_ICON_COMPONENT = {
  [GET_STARTED_ICON.tour]: Compass,
  [GET_STARTED_ICON.whiteboard]: PencilRuler,
  [GET_STARTED_ICON.simulation]: Dna,
  [GET_STARTED_ICON.practice]: Brain,
  [GET_STARTED_ICON.reading]: BookOpen,
  [GET_STARTED_ICON.brainstorm]: Lightbulb,
  [GET_STARTED_ICON.standards]: ScrollText,
  [GET_STARTED_ICON.activity]: Gamepad2,
  [GET_STARTED_ICON.differentiate]: Layers,
} as const satisfies Record<GetStartedIconId, LucideIcon>

function GetStartedBoardIcon(props: { icon: GetStartedIconId; className?: string }) {
  const Icon = GET_STARTED_ICON_COMPONENT[props.icon]
  return <Icon className={props.className} aria-hidden />
}

/** Skip the universal Bench tag so chips stay distinctive. */
function hoverCardTags(
  capabilities: readonly GetStartedCapability[],
): readonly GetStartedCapability[] {
  return capabilities.filter((capability) => capability !== GET_STARTED_CAPABILITY.bench)
}

export function GetStartedChats(props: GetStartedChatsProps) {
  const [startingChatID, setStartingChatID] = useState<GetStartedChat["id"] | undefined>(undefined)
  const variant = props.variant ?? "sidebar"

  async function startChat(chat: GetStartedChat) {
    if (startingChatID || props.disabled) return

    setStartingChatID(chat.id)
    try {
      await props.onStart(chat)
    } finally {
      setStartingChatID(undefined)
    }
  }

  if (props.chats.length === 0) return null

  if (variant === "board") {
    const lastIndex = props.chats.length - 1

    return (
      <section
        aria-label={language.t("settings.general.getStartedChatsTitle")}
        data-component="get-started-chats"
        data-variant="board"
        className="min-h-0 min-w-0 w-full overflow-hidden"
      >
        {/*
          Title-only cards on the board; HoverCard shows icon + title + overview.
          Pop-out / narrow: max 3, 1 col. @[32rem]+: full set, 2-col.
        */}
        <div className="chat-empty-board-get-started-grid grid min-h-0 grid-cols-1 gap-1.5 @[32rem]:grid-cols-2 @[32rem]:gap-2.5">
          {props.chats.map((chat, index) => {
            const isLastOdd = index === lastIndex && props.chats.length % 2 === 1
            const tags = hoverCardTags(chat.capabilities)

            return (
              <HoverCard key={chat.id} openDelay={BOARD_HOVER_CARD_OPEN_DELAY_MS} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    data-action="get-started-chat"
                    data-get-started-chat={chat.id}
                    disabled={props.disabled || Boolean(startingChatID)}
                    className={cn(
                      "chat-empty-board-action group min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left outline-none",
                      // Narrow / pop-out: only first 3. Tailwind `flex` must not win over hide.
                      index >= 3 ? "hidden @[32rem]:flex" : "flex",
                      "focus-visible:ring-2 focus-visible:ring-border-interactive-base",
                      "disabled:opacity-70",
                      "@[32rem]:rounded-xl @[32rem]:px-3 @[32rem]:py-2.5",
                      isLastOdd &&
                        "@[32rem]:col-span-2 @[32rem]:mx-auto @[32rem]:w-full @[32rem]:max-w-md",
                    )}
                    onClick={() => {
                      void startChat(chat)
                    }}
                  >
                    <GetStartedBoardIcon
                      icon={chat.icon}
                      className="size-3.5 shrink-0 @[32rem]:size-4"
                    />
                    {/* Same chalk face + ink as the date (color pinned in board CSS). */}
                    <span className="chat-empty-board-chalk min-w-0 flex-1 truncate text-sm leading-snug @[28rem]:text-base">
                      {chat.title}
                    </span>
                    <ChevronRightIcon className="size-3 shrink-0 opacity-40 transition-opacity duration-150 group-hover:opacity-100 @[32rem]:size-3.5" />
                  </button>
                </HoverCardTrigger>
                <HoverCardContent side="top" align="start" sideOffset={8} className="w-72 p-3">
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-weaker-base bg-surface-weak/40">
                        <GetStartedBoardIcon
                          icon={chat.icon}
                          className="size-4 text-text-interactive-base"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium leading-snug text-text-strong">
                          {chat.title}
                        </p>
                        <p className="text-xs leading-relaxed text-text-weak">{chat.description}</p>
                      </div>
                    </div>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1 border-t border-border-weaker-base pt-2.5">
                        {tags.map((capability) => (
                          <span
                            key={capability}
                            className="rounded-md border border-border-weaker-base bg-surface-weak/30 px-1.5 py-0.5 text-[10px] leading-none text-text-weaker"
                          >
                            {GET_STARTED_CAPABILITY_LABEL[capability]}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </HoverCardContent>
              </HoverCard>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="get-started-chats-title"
      data-component="get-started-chats"
      data-variant="sidebar"
      className="mb-3 space-y-1"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-text-weak">
          <Bookmark className="size-3 shrink-0 text-text-interactive-base" />
          <h2 id="get-started-chats-title" className="min-w-0 truncate">
            {language.t("chat.emptyState.tryThese")}
          </h2>
        </div>
        <button
          type="button"
          data-action="dismiss-get-started-chats"
          aria-label={language.t("chat.emptyState.hideGetStarted")}
          title={language.t("chat.emptyState.hideGetStarted")}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-text-weaker outline-none transition-colors hover:bg-surface-raised-base-hover hover:text-text-base focus-visible:ring-2 focus-visible:ring-border-interactive-base"
          onClick={props.onDismiss}
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="space-y-0.5 pl-4">
        {props.chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            data-action="get-started-chat"
            data-get-started-chat={chat.id}
            disabled={props.disabled || Boolean(startingChatID)}
            className="group/get-started flex w-full items-center rounded-lg px-2 py-1 text-left text-text-weak outline-none transition-colors duration-150 hover:bg-surface-raised-base-hover hover:text-text-strong focus-visible:ring-2 focus-visible:ring-border-interactive-base disabled:cursor-wait disabled:opacity-70"
            onClick={() => {
              void startChat(chat)
            }}
          >
            <span className="min-w-0 flex-1 truncate text-xs font-light">{chat.title}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
