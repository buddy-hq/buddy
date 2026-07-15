"use client"

import "./chat-empty-state-board.css"
import { useMemo } from "react"
import {
  BookIcon,
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  MessagesSquareIcon,
} from "@buddy/ui"
import { language } from "@/context/language"
import { GetStartedChats } from "@/components/layout/chat-left-sidebar/get-started-chats"
import { getFilename } from "@/components/layout/sidebar-helpers"
import type { GetStartedChat } from "@/lib/get-started-chats"
import { useGetStartedFlow } from "@/state/use-get-started-flow"
import buddyMascotWaveUrl from "../../../../../assets/mascot/buddy-mascot-wave.png"
import buddyMascotIdeaUrl from "../../../../../assets/mascot/buddy-mascot-idea.png"

const INBOX_DIRECTORY_LABEL = "Inbox" as const

const BOARD_MAX_WIDTH_CLASS = "max-w-[48rem]" as const
/** Matches prompt composer shell (`rounded-[16px]`). */
const BOARD_CORNER_RADIUS_CLASS = "rounded-[16px]" as const

const BOARD_MASCOT_DROP_SHADOW_CLASS = "drop-shadow-[0_8px_24px_rgba(0,0,0,0.32)]" as const

/**
 * Headline width sets the grid column; combobox row uses `w-0 min-w-full` to match it.
 * Cap is the flex copy column (board minus mascot) — not a fixed 20rem, which forced
 * text-4xl headlines like "What are we learning?" to wrap with empty space still free.
 */
const BOARD_COPY_BLOCK_CLASS = "inline-grid w-max min-w-0 max-w-full" as const
const BOARD_COMBOBOX_ROW_CLASS =
  "col-start-1 row-start-2 mt-2 w-0 min-w-full max-[560px]:mt-1.5 @[28rem]:mt-4" as const

/** Chevron on the trigger is hidden until the board is hovered, focused, or the menu is open. */
const BOARD_CARD_CLASS = "group/board chat-empty-board-card" as const

const BOARD_COMBOBOX_CONTENT_CLASS =
  "chat-empty-board-combobox-content min-w-[14rem] max-w-[20rem] text-text-base !ring-0" as const

const BOARD_COMBOBOX_ITEM_CLASS =
  "min-w-0 data-[highlighted]:bg-surface-weak/50 data-[selected]:bg-surface-weak/70" as const

/** Icon flush with headline; negative margin keeps a wider hover target without shifting layout. */
const BOARD_COMBOBOX_TRIGGER_CLASS =
  "-ml-2 flex h-9 w-full min-w-0 items-center justify-start gap-2 overflow-hidden rounded-md border-0 bg-transparent py-0 pl-2 pr-2 text-left text-base font-medium text-text-interactive-base shadow-none hover:bg-surface-weak/60 hover:text-text-interactive-base data-popup-open:bg-surface-weak/60 data-pressed:bg-surface-weak/80 max-[560px]:h-8 [&>svg:last-child]:hidden [&>svg:last-child]:size-4 [&>svg:last-child]:shrink-0 [&>svg:last-child]:text-text-weak group-hover/board:[&>svg:last-child]:block group-focus-within/board:[&>svg:last-child]:block data-popup-open:[&>svg:last-child]:block" as const
const BOARD_COMBOBOX_LABEL_CLASS = "min-w-0 flex-1 truncate" as const

const BOARD_DATE_CHALK_STROKE_WIDTH = 1.75
const BOARD_DATE_CHALK_STROKE_OPACITY = 0.48

/** Padding inside the chalk L-bracket (board edge is the top/left border). */
const BOARD_DATE_CORNER_PADDING_CLASS =
  "pt-2 px-3 pb-2.5 max-[560px]:pt-1.5 max-[560px]:px-2.5 max-[560px]:pb-2 @[28rem]:pt-3 @[28rem]:px-5 @[28rem]:pb-4" as const

type BoardDateCornerProps = {
  dateLine: string
  weekday: string
}

/** Chalk L-bracket flush in the top-left: right + bottom strokes only; date over weekday. */
function BoardDateCorner(props: BoardDateCornerProps) {
  return (
    <div className={`relative w-fit ${BOARD_DATE_CORNER_PADDING_CLASS}`}>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full text-text-weaker"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M98 1 Q99 42 98 99"
          stroke="currentColor"
          strokeWidth={BOARD_DATE_CHALK_STROKE_WIDTH}
          strokeLinecap="round"
          opacity={BOARD_DATE_CHALK_STROKE_OPACITY}
        />
        <path
          d="M1 98 Q48 100 98 98"
          stroke="currentColor"
          strokeWidth={BOARD_DATE_CHALK_STROKE_WIDTH}
          strokeLinecap="round"
          opacity={BOARD_DATE_CHALK_STROKE_OPACITY}
        />
      </svg>
      <div className="relative flex flex-col gap-1.5 @[28rem]:gap-2.5">
        <span className="chat-empty-board-chalk whitespace-nowrap text-xs leading-none text-text-subtle @[28rem]:text-sm">
          {props.dateLine}
        </span>
        <span className="chat-empty-board-chalk whitespace-nowrap text-xs leading-none uppercase text-text-subtle @[28rem]:text-sm">
          {props.weekday}
        </span>
      </div>
    </div>
  )
}

type ChatEmptyStateBoardProps = {
  directory: string
  directories: string[]
  persona: string
  onSelectNotebook: (directory: string) => void
  onStartGetStartedChat?: (chat: GetStartedChat) => Promise<void> | void
}

function isInboxDirectory(directory: string) {
  return getFilename(directory).toLowerCase() === INBOX_DIRECTORY_LABEL.toLowerCase()
}

function notebookLabel(directory: string) {
  return isInboxDirectory(directory) ? language.t("sidebar.quickChat") : getFilename(directory)
}

function formatBoardDate(now: Date) {
  const day = String(now.getDate()).padStart(2, "0")
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const year = String(now.getFullYear() % 100).padStart(2, "0")
  const dateLine = `${day}/${month}/${year}`
  const weekday = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
  })
    .format(now)
    .toUpperCase()

  return { dateLine, weekday }
}

export function ChatEmptyStateBoard(props: ChatEmptyStateBoardProps) {
  const isInbox = isInboxDirectory(props.directory)
  const getStartedFlow = useGetStartedFlow(props.directory)
  const showGetStarted =
    isInbox && getStartedFlow.isActive && Boolean(props.onStartGetStartedChat)
  const headline = isInbox
    ? language.t("chat.emptyState.inboxTitle")
    : props.persona === "teaching-buddy"
      ? language.t("chat.emptyState.teachTitle")
      : language.t("chat.emptyState.title")
  const boardDate = useMemo(() => formatBoardDate(new Date()), [])

  return (
    <div
      data-component="chat-empty-state-board"
      className="animate-in fade-in slide-in-from-bottom-2 flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-visible py-3 duration-700"
    >
      {/*
        Container queries for width (floating chat).
        overflow-visible + vertical padding so shadow-md is not clipped by a parent.
      */}
      <div
        className={`@container flex h-full min-h-0 w-full max-h-full ${BOARD_MAX_WIDTH_CLASS} items-center overflow-visible px-3 @[28rem]:px-4`}
      >
        {/*
          Shadow lives on this outer shell. Inner article keeps overflow-hidden for
          grain / rounded clip without eating the drop shadow.
        */}
        <div
          className={`relative w-full min-h-0 ${BOARD_CARD_CLASS} shadow-md ${BOARD_CORNER_RADIUS_CLASS}`}
        >
          <article
            className={`relative flex h-full min-h-0 w-full overflow-hidden border border-border-weaker-base bg-background-base ${BOARD_CORNER_RADIUS_CLASS}`}
          >
          <div
            aria-hidden
            className="chat-empty-board-grain pointer-events-none absolute inset-0 z-[1] opacity-[0.12]"
          />

          <div className="absolute left-0 top-0 z-[3] max-[560px]:origin-top-left max-[560px]:scale-90">
            <BoardDateCorner dateLine={boardDate.dateLine} weekday={boardDate.weekday} />
          </div>

          {showGetStarted && props.onStartGetStartedChat ? (
            /*
              Get Started: idea mascot bottom-left (faces into the cards).
              Chalk "TRY THESE" heading above the card grid — no thought bubble.
            */
            <>
              {/*
                Asymmetric vertical padding biases the block upward (~extra 10–16px)
                vs pure justify-center, which ignored a small -mt.
              */}
              <div className="relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden pb-10 pl-[4.75rem] pr-3 pt-12 @[28rem]:pb-12 @[28rem]:pl-36 @[28rem]:pr-8 @[28rem]:pt-14 @[32rem]:pl-44 @[40rem]:pl-48 @[40rem]:pr-10">
                <div className="flex min-h-0 min-w-0 w-full max-w-2xl -translate-y-2.5 flex-col gap-5 @[28rem]:gap-6">
                  <div className="w-fit px-0.5">
                    <p className="chat-empty-board-chalk text-left text-base leading-none text-text-subtle @[28rem]:text-lg @[32rem]:text-xl">
                      {language.t("chat.emptyState.tryThese").toUpperCase()}
                    </p>
                    {/* Chalk underline — same stroke language as the date L-bracket. */}
                    <svg
                      aria-hidden
                      className="mt-1.5 h-1.5 w-full text-text-weaker @[28rem]:mt-2"
                      viewBox="0 0 100 6"
                      preserveAspectRatio="none"
                      fill="none"
                    >
                      <path
                        d="M1 3.5 Q28 1.5 52 3.2 T99 2.8"
                        stroke="currentColor"
                        strokeWidth={BOARD_DATE_CHALK_STROKE_WIDTH}
                        strokeLinecap="round"
                        opacity={BOARD_DATE_CHALK_STROKE_OPACITY}
                      />
                    </svg>
                  </div>
                  <GetStartedChats
                    variant="board"
                    chats={getStartedFlow.chats}
                    onStart={props.onStartGetStartedChat}
                    onDismiss={getStartedFlow.dismiss}
                  />
                </div>
              </div>
              <div className="pointer-events-none absolute bottom-0 left-0 z-[2] pl-2 @[28rem]:pl-6 @[40rem]:pl-8">
                <img
                  src={buddyMascotIdeaUrl}
                  alt={`${language.t("routes.chat.productName")} mascot`}
                  className={`relative -bottom-0.5 block h-auto w-16 select-none object-contain object-bottom @[28rem]:w-32 @[32rem]:w-36 @[40rem]:w-40 ${BOARD_MASCOT_DROP_SHADOW_CLASS}`}
                />
              </div>
            </>
          ) : (
            <>
              {/* Copy — reserved flex column so mascot cannot paint over it. */}
              <div className="relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col justify-center py-3 pl-5 pr-2 pt-12 max-[720px]:py-2.5 max-[720px]:pt-11 max-[560px]:py-2 max-[560px]:pt-10 @[28rem]:py-6 @[28rem]:pl-10 @[28rem]:pr-3 @[28rem]:pt-6 max-[720px]:@[28rem]:py-4 max-[720px]:@[28rem]:pt-5 @[40rem]:pl-16">
                <div className={BOARD_COPY_BLOCK_CLASS}>
                  <h1 className="chat-empty-board-headline col-start-1 row-start-1 font-semibold tracking-tight text-text-subtle">
                    {headline}
                  </h1>
                  {props.directories.length > 0 ? (
                    <div className={BOARD_COMBOBOX_ROW_CLASS}>
                      <Combobox
                        value={props.directory}
                        onValueChange={(nextDirectory) => {
                          if (!nextDirectory || nextDirectory === props.directory) return
                          props.onSelectNotebook(nextDirectory)
                        }}
                      >
                        <ComboboxTrigger
                          data-action="chat-empty-state-notebook-select"
                          className={BOARD_COMBOBOX_TRIGGER_CLASS}
                          aria-label={language.t("sidebar.optionsForDirectory", {
                            directoryLabel: notebookLabel(props.directory),
                          })}
                        >
                          {isInbox ? (
                            <MessagesSquareIcon className="size-4 shrink-0" />
                          ) : (
                            <BookIcon className="size-4 shrink-0" />
                          )}
                          <span className={BOARD_COMBOBOX_LABEL_CLASS}>
                            {notebookLabel(props.directory)}
                          </span>
                        </ComboboxTrigger>
                        <ComboboxContent className={BOARD_COMBOBOX_CONTENT_CLASS}>
                          <ComboboxList>
                            {props.directories.map((directory) => (
                              <ComboboxItem
                                key={directory}
                                value={directory}
                                className={BOARD_COMBOBOX_ITEM_CLASS}
                              >
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {isInboxDirectory(directory) ? (
                                    <MessagesSquareIcon className="size-3.5 shrink-0" />
                                  ) : (
                                    <BookIcon className="size-3.5 shrink-0" />
                                  )}
                                  <span className="truncate">{notebookLabel(directory)}</span>
                                </span>
                              </ComboboxItem>
                            ))}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </div>
                  ) : null}
                </div>
              </div>

              {/*
                Mascot scales with the board:
                - slot width tracks board width (~40%)
                - image height tracks board height (~90% of slot)
                - max-width 14rem matches the old md:w-56 ceiling
              */}
              <div className="pointer-events-none relative z-[2] flex w-[38%] shrink-0 items-end justify-end self-stretch pr-4 @[28rem]:w-[40%] @[28rem]:pr-8 @[40rem]:w-[42%] @[40rem]:pr-12">
                <img
                  src={buddyMascotWaveUrl}
                  alt={`${language.t("routes.chat.productName")} mascot waving`}
                  className={`chat-empty-board-mascot relative -bottom-0.5 select-none ${BOARD_MASCOT_DROP_SHADOW_CLASS}`}
                />
              </div>
            </>
          )}
          </article>
        </div>
      </div>
    </div>
  )
}
