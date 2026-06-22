import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
} from "@buddy/ui"
import { Popover, PopoverContent, PopoverTrigger } from "@buddy/ui/components/ui/popover"
import { HistoryIcon, SearchIcon } from "lucide-react"
import { language } from "@/context/language"
import type { SessionInfo } from "@/state/chat-types"
import { formatThreadAge } from "@/components/layout/chat-left-sidebar/thread-helpers"

const HOVER_CLOSE_DELAY_MS = 100

type ThreadHistoryPopoverProps = {
  sessions: SessionInfo[]
  activeSessionID?: string
  linkedSessionID?: string
  onSelectSession: (sessionID: string) => void | Promise<void>
  notebookName?: string
  trigger?: ReactNode
  openOnTriggerHover?: boolean
  triggerClassName?: string
  triggerIconClassName?: string
}

export function ThreadHistoryPopover(props: ThreadHistoryPopoverProps) {
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hasQuery = query.trim().length > 0
  const linkedSessionID = props.linkedSessionID
  const notebookName = props.notebookName?.trim()
  const searchPlaceholder =
    notebookName && notebookName.length > 0
      ? language.t("sidebar.searchNotebook", { name: notebookName })
      : language.t("sidebar.searchNotebookThreads")

  const orderedSessions =
    linkedSessionID === undefined
      ? props.sessions
      : props.sessions.toSorted((a, b) => {
          const aLinked = a.id === linkedSessionID
          const bLinked = b.id === linkedSessionID
          if (aLinked === bLinked) return 0
          return aLinked ? -1 : 1
        })

  function getThreadTitle(session: SessionInfo) {
    return session.title.trim() || language.t("sidebar.untitledThread")
  }

  function clearHoverCloseTimeout() {
    if (hoverCloseTimeoutRef.current === undefined) return
    clearTimeout(hoverCloseTimeoutRef.current)
    hoverCloseTimeoutRef.current = undefined
  }

  function openFromHover() {
    clearHoverCloseTimeout()
    setIsOpen(true)
  }

  function closeFromHover() {
    clearHoverCloseTimeout()
    hoverCloseTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
      setQuery("")
      hoverCloseTimeoutRef.current = undefined
    }, HOVER_CLOSE_DELAY_MS)
  }

  useEffect(() => clearHoverCloseTimeout, [])

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen)
        if (!nextOpen) {
          setQuery("")
        }
      }}
    >
      <PopoverTrigger
        asChild
        onMouseEnter={props.openOnTriggerHover ? openFromHover : undefined}
        onMouseLeave={props.openOnTriggerHover ? closeFromHover : undefined}
      >
        {props.trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              "size-8 rounded-full text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.95] [-webkit-app-region:no-drag]",
              props.triggerClassName,
            )}
            aria-label={language.t("sidebar.showAllThreads")}
          >
            <HistoryIcon className={cn("size-4", props.triggerIconClassName)} />
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={12}
        className="flex max-h-[480px] w-80 flex-col overflow-hidden border-border-weaker-base/20 bg-background-base/95 p-0 shadow-2xl backdrop-blur-xl z-50"
        onMouseEnter={props.openOnTriggerHover ? clearHoverCloseTimeout : undefined}
        onMouseLeave={props.openOnTriggerHover ? closeFromHover : undefined}
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
            placeholder={searchPlaceholder}
          />

          <CommandList className="flex-1 min-h-0 max-h-none px-2 pb-2">
            <CommandEmpty className="px-0 py-0">
              <div className="flex flex-col items-center justify-center py-12 text-center opacity-30">
                <SearchIcon className="mb-3 size-8 stroke-[1px]" />
                <p className="text-xs font-medium tracking-tight">
                  {hasQuery ? language.t("prompt.autocomplete.noMatches") : language.t("sidebar.noThreads")}
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
                        {language.t("sidebar.currentBook")}
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
  )
}
