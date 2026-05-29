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
const BOARD_MASCOT_SLOT_WIDTH_CLASS = "w-[42%]" as const

const BOARD_GRAIN_BACKGROUND_IMAGE = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`

const BOARD_DATE_CHALK_STROKE_WIDTH = 1.75
const BOARD_DATE_CHALK_STROKE_OPACITY = 0.48

type BoardDateCornerProps = {
  dateLine: string
  weekday: string
}

/** Chalk L-bracket flush in the top-left: right + bottom strokes only; date over weekday. */
function BoardDateCorner(props: BoardDateCornerProps) {
  return (
    <div className="absolute left-0 top-0 z-[3] w-fit">
      <div className="relative w-fit pt-4 pl-3 pr-4 pb-3.5">
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
  onSelectNotebook: (directory: string) => void
}

function isInboxDirectory(directory: string) {
  return getFilename(directory).toLowerCase() === INBOX_DIRECTORY_LABEL.toLowerCase()
}

function notebookLabel(directory: string) {
  return isInboxDirectory(directory)
    ? language.t("sidebar.quickChat")
    : getFilename(directory)
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
  const headline = isInbox
    ? language.t("sidebar.quickChat")
    : language.t("chat.emptyState.title")
  const boardDate = useMemo(() => formatBoardDate(new Date()), [])

  return (
    <div
      data-component="chat-empty-state-board"
      className="animate-in fade-in slide-in-from-bottom-2 flex flex-1 items-center justify-center duration-700"
    >
      <div className={`relative w-full ${BOARD_MAX_WIDTH_CLASS} px-4`}>
        <AspectRatio ratio={EMPTY_STATE_BOARD_ASPECT_RATIO} className={`w-full ${BOARD_MAX_WIDTH_CLASS}`}>
          <article
            className={`absolute inset-0 overflow-hidden border border-border-weaker-base bg-background-base shadow-[0_8px_32px_rgba(0,0,0,0.28)] ${BOARD_CORNER_RADIUS_CLASS}`}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[1] opacity-[0.12]"
              style={{ backgroundImage: BOARD_GRAIN_BACKGROUND_IMAGE }}
            />

            <BoardDateCorner dateLine={boardDate.dateLine} weekday={boardDate.weekday} />

            <div
              className={`relative z-[2] flex min-h-full min-w-0 flex-col justify-center pl-14 pr-5 py-6 md:pl-16 md:pr-6 ${BOARD_COPY_MAX_WIDTH_CLASS}`}
            >
              <h1 className="max-w-[20rem] text-4xl font-bold leading-[1.1] tracking-tight text-text-stronger">
                {headline}
              </h1>
              {props.directories.length > 0 ? (
                <div className="mt-4 w-fit max-w-[20rem]">
                  <Combobox
                    value={props.directory}
                    onValueChange={(nextDirectory) => {
                      if (!nextDirectory || nextDirectory === props.directory) return
                      props.onSelectNotebook(nextDirectory)
                    }}
                  >
                    <ComboboxTrigger
                      data-action="chat-empty-state-notebook-select"
                      className="inline-flex h-9 w-fit max-w-full items-center justify-start gap-2 overflow-hidden border-0 bg-transparent p-0 text-left text-base font-medium text-text-interactive-base shadow-none hover:bg-transparent hover:text-text-interactive-base data-pressed:bg-transparent [&>svg:last-child]:size-4 [&>svg:last-child]:shrink-0 [&>svg:last-child]:text-text-weak"
                      aria-label={language.t("sidebar.optionsForDirectory", {
                        directoryLabel: notebookLabel(props.directory),
                      })}
                    >
                      {isInbox ? (
                        <MessagesSquareIcon className="size-4 shrink-0" />
                      ) : (
                        <BookIcon className="size-4 shrink-0" />
                      )}
                      <span className="max-w-full truncate">{notebookLabel(props.directory)}</span>
                    </ComboboxTrigger>
                    <ComboboxContent className="min-w-[14rem] max-w-[20rem]">
                      <ComboboxList>
                        {props.directories.map((directory) => (
                          <ComboboxItem key={directory} value={directory} className="min-w-0">
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

            <div
              className={`pointer-events-none absolute inset-y-0 right-0 z-[2] flex items-end justify-center ${BOARD_MASCOT_SLOT_WIDTH_CLASS}`}
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
