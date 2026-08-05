import { useRef, useState } from "react"
import "@/components/prompt/composer-surfaces.css"
import {
  BookOpen,
  Brain,
  Compass,
  Dna,
  Gamepad2,
  Layers,
  Lightbulb,
  NoteIcon,
  PencilRuler,
  Search,
  ScrollText,
  Sparkles,
  type AppIcon,
} from "@/icons/app-icons"
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

type GetStartedChatsBaseProps = {
  chats: readonly GetStartedChat[]
  disabled?: boolean
  onDismiss: () => void
}

type GetStartedChatsProps =
  | (GetStartedChatsBaseProps & {
      /** Sidebar suggestions stage a draft so repeated clicks cannot create sessions. */
      variant?: "sidebar"
      onStage: (chat: GetStartedChat) => Promise<void> | void
    })
  | (GetStartedChatsBaseProps & {
      /** Empty-board suggestions intentionally create and send a chat immediately. */
      variant: "board"
      onStart: (chat: GetStartedChat) => Promise<void> | void
    })

/** App icon set for get-started scenarios. */
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
  [GET_STARTED_ICON.research]: Search,
  [GET_STARTED_ICON.skills]: Sparkles,
} as const satisfies Record<GetStartedIconId, AppIcon>

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
  const activationInFlightRef = useRef(false)
  const [activeChatID, setActiveChatID] = useState<GetStartedChat["id"] | undefined>(undefined)
  const variant = props.variant ?? "sidebar"

  async function activateChat(chat: GetStartedChat) {
    if (activationInFlightRef.current || props.disabled) return

    activationInFlightRef.current = true
    setActiveChatID(chat.id)
    try {
      if (props.variant === "board") {
        await props.onStart(chat)
      } else {
        await props.onStage(chat)
      }
    } finally {
      activationInFlightRef.current = false
      setActiveChatID(undefined)
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
                    disabled={props.disabled || Boolean(activeChatID)}
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
                      void activateChat(chat)
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
      className="composer-surface composer-grain relative mx-1 mb-3 space-y-1 overflow-hidden px-1.5 py-1.5 [--composer-surface-bg:var(--surface-raised-stronger-non-alpha)]"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-text-weak">
          <NoteIcon className="size-3 shrink-0" />
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
            disabled={props.disabled || Boolean(activeChatID)}
            className="group/get-started flex w-full items-center rounded-lg px-2 py-1 text-left text-text-weak outline-none transition-colors duration-150 hover:bg-surface-raised-base-hover hover:text-text-strong focus-visible:ring-2 focus-visible:ring-border-interactive-base disabled:cursor-wait disabled:opacity-70"
            onClick={() => {
              void activateChat(chat)
            }}
          >
            <span className="min-w-0 flex-1 truncate text-xs font-light">{chat.title}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
