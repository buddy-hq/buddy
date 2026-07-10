"use client"

import "./chat-empty-state-board.css"
import { useMemo } from "react"
import {
  AspectRatio,
  BookIcon,
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  MessagesSquareIcon,
} from "@buddy/ui"
import { language } from "@/context/language"
import { getFilename } from "@/components/layout/sidebar-helpers"
import buddyMascotWaveUrl from "../../../../../assets/mascot/buddy-mascot-wave.png"

const INBOX_DIRECTORY_LABEL = "Inbox" as const

/** Wide landscape board (~16:9) — reads shorter than 3:2 for the same width. */
const BLACKBOARD_ASPECT_WIDTH = 16
const BLACKBOARD_ASPECT_HEIGHT = 9
const EMPTY_STATE_BOARD_ASPECT_RATIO = BLACKBOARD_ASPECT_WIDTH / BLACKBOARD_ASPECT_HEIGHT

const BOARD_MAX_WIDTH_CLASS = "max-w-[48rem]" as const
/** Matches prompt composer shell (`rounded-[16px]`). */
const BOARD_CORNER_RADIUS_CLASS = "rounded-[16px]" as const

const BOARD_MASCOT_DROP_SHADOW_CLASS = "drop-shadow-[0_8px_24px_rgba(0,0,0,0.32)]" as const

/** Copy column — wide notebook names must not shift the mascot slot. */
const BOARD_COPY_MAX_WIDTH_CLASS = "max-w-[58%]" as const

/** Headline width sets the grid column; combobox row uses `w-0 min-w-full` to match it. */
const BOARD_COPY_BLOCK_CLASS = "inline-grid w-max min-w-0 max-w-[20rem]" as const
const BOARD_COMBOBOX_ROW_CLASS = "col-start-1 row-start-2 mt-4 w-0 min-w-full" as const

/** Chevron on the trigger is hidden until the board is hovered, focused, or the menu is open. */
const BOARD_CARD_CLASS = "group/board" as const
const BOARD_MASCOT_SLOT_WIDTH_CLASS = "w-[42%]" as const

/** Same inset from board edge → text start (left) and mascot (right). */
const BOARD_COPY_GUTTER_CLASS = "pl-16" as const
const BOARD_MASCOT_GUTTER_CLASS = "pr-12" as const

const BOARD_COMBOBOX_CONTENT_CLASS =
  "chat-empty-board-combobox-content min-w-[14rem] max-w-[20rem] text-text-base !ring-0" as const

const BOARD_COMBOBOX_ITEM_CLASS =
  "min-w-0 data-[highlighted]:bg-surface-weak/50 data-[selected]:bg-surface-weak/70" as const

/** Icon flush with headline; negative margin keeps a wider hover target without shifting layout. */
const BOARD_COMBOBOX_TRIGGER_CLASS =
  "-ml-2 flex h-9 w-full min-w-0 items-center justify-start gap-2 overflow-hidden rounded-md border-0 bg-transparent py-0 pl-2 pr-2 text-left text-base font-medium text-text-interactive-base shadow-none hover:bg-surface-weak/60 hover:text-text-interactive-base data-popup-open:bg-surface-weak/60 data-pressed:bg-surface-weak/80 [&>svg:last-child]:hidden [&>svg:last-child]:size-4 [&>svg:last-child]:shrink-0 [&>svg:last-child]:text-text-weak group-hover/board:[&>svg:last-child]:block group-focus-within/board:[&>svg:last-child]:block data-popup-open:[&>svg:last-child]:block" as const
const BOARD_COMBOBOX_LABEL_CLASS = "min-w-0 flex-1 truncate" as const

const BOARD_DATE_CHALK_STROKE_WIDTH = 1.75
const BOARD_DATE_CHALK_STROKE_OPACITY = 0.48

/** Padding inside the chalk L-bracket (board edge is the top/left border). */
const BOARD_DATE_CORNER_PADDING_CLASS = "pt-3 px-5 pb-4" as const

type BoardDateCornerProps = {
  dateLine: string
  weekday: string
}

/** Chalk L-bracket flush in the top-left: right + bottom strokes only; date over weekday. */
function BoardDateCorner(props: BoardDateCornerProps) {
  return (
    <div className="absolute left-0 top-0 z-[3] w-fit">
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
        <div className="relative flex flex-col gap-2.5">
          <span className="chat-empty-board-chalk whitespace-nowrap text-sm leading-none text-text-subtle">
            {props.dateLine}
          </span>
          <span className="chat-empty-board-chalk whitespace-nowrap text-sm leading-none uppercase text-text-subtle">
            {props.weekday}
          </span>
        </div>
      </div>
    </div>
  )
}

type ChatEmptyStateBoardProps = {
  directory: string
  directories: string[]
  persona: string
  onSelectNotebook: (directory: string) => void
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
  const headline =
    props.persona === "teaching-buddy"
      ? language.t("chat.emptyState.teachTitle")
      : language.t("chat.emptyState.title")
  const boardDate = useMemo(() => formatBoardDate(new Date()), [])

  return (
    <div
      data-component="chat-empty-state-board"
      className="animate-in fade-in slide-in-from-bottom-2 flex flex-1 items-center justify-center duration-700"
    >
      <div className={`relative w-full ${BOARD_MAX_WIDTH_CLASS} px-4`}>
        <AspectRatio
          ratio={EMPTY_STATE_BOARD_ASPECT_RATIO}
          className={`w-full ${BOARD_MAX_WIDTH_CLASS}`}
        >
          <article
            className={`${BOARD_CARD_CLASS} absolute inset-0 overflow-hidden border border-border-weaker-base bg-background-base shadow-[0_8px_32px_rgba(0,0,0,0.28)] ${BOARD_CORNER_RADIUS_CLASS}`}
          >
            <div
              aria-hidden
              className="chat-empty-board-grain pointer-events-none absolute inset-0 z-[1] opacity-[0.12]"
            />

            <BoardDateCorner dateLine={boardDate.dateLine} weekday={boardDate.weekday} />

            <div
              className={`relative z-[2] flex min-h-full min-w-0 flex-col justify-center py-6 ${BOARD_COPY_GUTTER_CLASS} ${BOARD_COPY_MAX_WIDTH_CLASS}`}
            >
              <div className={BOARD_COPY_BLOCK_CLASS}>
                <h1 className="col-start-1 row-start-1 text-4xl font-bold leading-[1.1] tracking-tight text-text-subtle">
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

            <div
              className={`pointer-events-none absolute inset-y-0 right-0 z-[2] flex items-end justify-end ${BOARD_MASCOT_GUTTER_CLASS} ${BOARD_MASCOT_SLOT_WIDTH_CLASS}`}
            >
              <img
                src={buddyMascotWaveUrl}
                alt={`${language.t("routes.chat.productName")} mascot waving`}
                className={`relative -bottom-0.5 w-52 select-none md:w-56 ${BOARD_MASCOT_DROP_SHADOW_CLASS}`}
              />
            </div>
          </article>
        </AspectRatio>
      </div>
    </div>
  )
}
