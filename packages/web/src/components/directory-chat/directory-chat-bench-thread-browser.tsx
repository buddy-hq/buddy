import { useRef, useState } from "react"
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  SquarePenIcon,
  cn,
} from "@buddy/ui"
import { CornerUpLeftIcon, HistoryIcon, PictureInPicture2Icon, SearchIcon } from "lucide-react"
import { language } from "@/context/language"
import type { SessionInfo } from "@/state/chat-types"
import { formatThreadAge } from "@/components/layout/chat-left-sidebar/thread-helpers"
import { Popover, PopoverContent, PopoverTrigger } from "@buddy/ui/components/ui/popover"
import { parseSubagentSession } from "@/lib/session-family"

type DirectoryChatBenchThreadBrowserProps = {
  sessionTitle: string
  sessions: SessionInfo[]
  activeSessionID?: string
  linkedSessionID?: string
  parentSession?: SessionInfo
  onFloatChat?: () => void
  onNewSession: () => void | Promise<void>
  onSelectSession: (sessionID: string) => void | Promise<void>
  className?: string
}

const THREAD_SEARCH_PLACEHOLDER = "Search notebook threads" as const
const THREAD_NO_MATCHES_MESSAGE = "No matches found" as const
const BENCH_CHAT_FLOAT_LABEL = "Pop out chat" as const

function getThreadTitle(session: SessionInfo) {
  const title = session.title.trim()
  return title || language.t("sidebar.untitledThread")
}

export function DirectoryChatBenchThreadBrowser(props: DirectoryChatBenchThreadBrowserProps) {
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const hasQuery = query.trim().length > 0
  const linkedSessionID = props.linkedSessionID
  const parentSessionID = props.parentSession?.id
  const parentSessionTitle = props.parentSession
    ? parseSubagentSession(props.parentSession).title || getThreadTitle(props.parentSession)
    : undefined
  const orderedSessions =
    linkedSessionID === undefined
      ? props.sessions
      : props.sessions.toSorted((a, b) => {
          const aLinked = a.id === linkedSessionID
          const bLinked = b.id === linkedSessionID
          if (aLinked === bLinked) return 0
          return aLinked ? -1 : 1
        })

  return (
    <div
      data-component="directory-chat-bench-thread-browser"
      className={cn("flex w-full items-center justify-between gap-4 py-1", props.className)}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {props.parentSession ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-full px-2.5 text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-strong"
            aria-label={`Return to ${parentSessionTitle}`}
            onClick={() => {
              if (parentSessionID) {
                void props.onSelectSession(parentSessionID)
              }
            }}
          >
            <CornerUpLeftIcon className="size-3.5" />
            <span className="max-w-32 truncate text-xs">{parentSessionTitle}</span>
          </Button>
        ) : null}

        <Popover
          open={isOpen}
          onOpenChange={(nextOpen) => {
            setIsOpen(nextOpen)
            if (!nextOpen) {
              setQuery("")
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-8 rounded-full text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.95]"
              aria-label={language.t("sidebar.showAllThreads")}
            >
              <HistoryIcon className="size-4" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={12}
            className="flex max-h-[480px] w-80 flex-col overflow-hidden border-border-weaker-base/20 bg-background-base/95 p-0 shadow-2xl backdrop-blur-xl"
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              searchInputRef.current?.focus()
            }}
          >
            <Command
              label={language.t("sidebar.showAllThreads")}
              defaultValue={props.activeSessionID}
              loop
              className="h-auto w-full flex-1 min-h-0 rounded-none bg-transparent p-0 shadow-none"
            >
              <CommandInput
                ref={searchInputRef}
                onValueChange={setQuery}
                placeholder={THREAD_SEARCH_PLACEHOLDER}
              />

              <CommandList className="flex-1 min-h-0 max-h-none px-2 pb-2">
                <CommandEmpty className="px-0 py-0">
                  <div className="flex flex-col items-center justify-center py-12 text-center opacity-30">
                    <SearchIcon className="mb-3 size-8 stroke-[1px]" />
                    <p className="text-xs font-medium tracking-tight">
                      {hasQuery ? THREAD_NO_MATCHES_MESSAGE : language.t("sidebar.noThreads")}
                    </p>
                  </div>
                </CommandEmpty>

                {orderedSessions.map((session) => {
                  const title = getThreadTitle(session)
                  const age = formatThreadAge(session.time.updated ?? session.time.created)
                  const isLinkedSession = session.id === linkedSessionID

                  return (
                    <CommandItem
                      key={session.id}
                      value={session.id}
                      keywords={[title]}
                      data-action="directory-chat-bench-thread-select"
                      data-session-id={session.id}
                      data-active={session.id === props.activeSessionID ? "true" : undefined}
                      aria-current={session.id === props.activeSessionID ? "true" : undefined}
                      className={cn(
                        "flex w-full cursor-pointer flex-row items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
                        "text-text-weak hover:bg-surface-raised-base/50 hover:text-text-base",
                        "data-[active=true]:bg-surface-raised-base/40 data-[active=true]:text-text-base data-[active=true]:ring-1 data-[active=true]:ring-border-base/5",
                        "data-selected:bg-surface-raised-base-hover/80 data-selected:text-text-strong data-selected:shadow-xs data-selected:ring-1 data-selected:ring-border-base/5",
                      )}
                      onSelect={(value) => {
                        void props.onSelectSession(value)
                        setIsOpen(false)
                        setQuery("")
                      }}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight transition-colors duration-200">
                          {title}
                        </span>
                        {isLinkedSession ? (
                          <Badge
                            variant="outline"
                            className="h-5 border-border-base text-text-weaker"
                          >
                            Current book
                          </Badge>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums uppercase tracking-[0.16em] text-text-weaker">
                        {age}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <span className="min-w-0 truncate text-sm font-medium tracking-tight text-text-base/90">
          {props.sessionTitle}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {props.onFloatChat ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            data-action="directory-chat-float"
            className="size-8 rounded-full text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.95]"
            aria-label={BENCH_CHAT_FLOAT_LABEL}
            title={BENCH_CHAT_FLOAT_LABEL}
            onClick={props.onFloatChat}
          >
            <PictureInPicture2Icon className="size-4" />
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-8 rounded-full text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.95]"
          aria-label={language.t("sidebar.newChat")}
          onClick={() => {
            void props.onNewSession()
          }}
        >
          <SquarePenIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
