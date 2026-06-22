import { Button, cn } from "@buddy/ui"
import {
  CornerUpLeftIcon,
  Maximize2Icon,
  MinusIcon,
  PictureInPicture2Icon,
  SquarePenIcon,
} from "lucide-react"
import { language } from "@/context/language"
import { parseSubagentSession } from "@/lib/session-family"
import type { SessionInfo } from "@/state/chat-types"
import { ThreadHistoryPopover } from "@/components/directory-chat/thread-history-popover"

type ThreadControlSize = "regular" | "compact" | "mini"

type ThreadActionPillProps = {
  sessions: SessionInfo[]
  activeSessionID?: string
  linkedSessionID?: string
  onSelectSession: (sessionID: string) => void | Promise<void>
  notebookName?: string
  onNewSession?: () => void | Promise<void>
  onFloatChat?: () => void
  onMinimizeChat?: () => void
  onDockChat?: () => void
  showHistory?: boolean
  size?: ThreadControlSize
  className?: string
}

type ThreadParentReturnButtonProps = {
  parentSession?: SessionInfo
  onSelectSession?: (sessionID: string) => void | Promise<void>
  size?: ThreadControlSize
  className?: string
}

const CONTROL_SIZE_STYLES = {
  regular: {
    pill: "p-0.5",
    button: "size-6",
    icon: "size-3.5",
    parentButton: "h-8 gap-1.5 px-2.5",
    parentText: "max-w-32",
  },
  compact: {
    pill: "p-px",
    button: "size-6",
    icon: "size-3.5",
    parentButton: "h-7 gap-1 px-2",
    parentText: "max-w-28",
  },
  mini: {
    pill: "p-0.5",
    button: "size-[22px]",
    icon: "size-3.5",
    parentButton: "h-6 gap-1 px-1.5",
    parentText: "max-w-24",
  },
} as const

export function getThreadDisplayTitle(session: SessionInfo): string {
  return (
    parseSubagentSession(session).title ||
    session.title.trim() ||
    language.t("sidebar.untitledThread")
  )
}

export function ThreadParentReturnButton(props: ThreadParentReturnButtonProps) {
  if (!props.parentSession || !props.onSelectSession) return null

  const styles = CONTROL_SIZE_STYLES[props.size ?? "regular"]
  const parentSessionID = props.parentSession.id
  const parentSessionTitle = getThreadDisplayTitle(props.parentSession)

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "rounded-full text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-strong",
        styles.parentButton,
        props.className,
      )}
      aria-label={`Return to ${parentSessionTitle}`}
      onClick={() => {
        void props.onSelectSession?.(parentSessionID)
      }}
    >
      <CornerUpLeftIcon className="size-3.5" />
      <span className={cn("truncate text-xs", styles.parentText)}>{parentSessionTitle}</span>
    </Button>
  )
}

export function ThreadActionPill(props: ThreadActionPillProps) {
  const styles = CONTROL_SIZE_STYLES[props.size ?? "regular"]
  const showHistory = props.showHistory ?? true
  const showNewSession = props.onNewSession !== undefined
  const showFloat = props.onFloatChat !== undefined
  const showWindowControls = props.onMinimizeChat !== undefined || props.onDockChat !== undefined
  const hasLeadingControls = showHistory || showNewSession || showFloat

  if (!hasLeadingControls && !showWindowControls) {
    return null
  }

  const historyControl = showHistory ? (
    <ThreadHistoryPopover
      sessions={props.sessions}
      activeSessionID={props.activeSessionID}
      linkedSessionID={props.linkedSessionID}
      onSelectSession={props.onSelectSession}
      notebookName={props.notebookName}
      triggerClassName={styles.button}
      triggerIconClassName={styles.icon}
    />
  ) : null

  const newSessionControl = showNewSession ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        "rounded-full text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.95] [-webkit-app-region:no-drag]",
        styles.button,
      )}
      aria-label={language.t("sidebar.newChat")}
      title={language.t("sidebar.newChat")}
      onClick={() => {
        void props.onNewSession?.()
      }}
    >
      <SquarePenIcon className={cn("animate-in fade-in zoom-in duration-200", styles.icon)} />
    </Button>
  ) : null

  const floatControl = showFloat ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        "rounded-full text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.95] [-webkit-app-region:no-drag]",
        styles.button,
      )}
      aria-label={language.t("sidebar.popOutChat")}
      title={language.t("sidebar.popOutChat")}
      onClick={props.onFloatChat}
    >
      <PictureInPicture2Icon
        className={cn("animate-in fade-in zoom-in duration-200", styles.icon)}
      />
    </Button>
  ) : null

  const windowControls = showWindowControls ? (
    <div
      className={cn(
        "flex items-center gap-0.5",
        hasLeadingControls ? "ml-0.5 border-l border-border-weaker-base pl-0.5" : "",
      )}
    >
      {props.onMinimizeChat ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-action="directory-chat-minimize"
          className={cn(
            "rounded-full text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.95] [-webkit-app-region:no-drag]",
            styles.button,
          )}
          aria-label={language.t("sidebar.minimizePopOutChat")}
          title={language.t("sidebar.minimizePopOutChat")}
          onClick={props.onMinimizeChat}
        >
          <MinusIcon className={styles.icon} />
        </Button>
      ) : null}

      {props.onDockChat ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-action="directory-chat-dock"
          className={cn(
            "rounded-full text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.95] [-webkit-app-region:no-drag]",
            styles.button,
          )}
          aria-label={language.t("sidebar.dockChat")}
          title={language.t("sidebar.dockChat")}
          onClick={props.onDockChat}
        >
          <Maximize2Icon className={cn(styles.icon, "-rotate-90")} />
        </Button>
      ) : null}
    </div>
  ) : null

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 self-center rounded-full border border-border-weaker-base bg-surface-raised-base/60 shadow-xs",
        styles.pill,
        props.className,
      )}
    >
      {historyControl}
      {newSessionControl}
      {floatControl}
      {windowControls}
    </div>
  )
}
