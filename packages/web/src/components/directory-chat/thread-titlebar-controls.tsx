import { Button, cn } from "@buddy/ui"
import {
  CornerUpLeftIcon,
  Maximize2Icon,
  MinusIcon,
  PictureInPicture2Icon,
  SquarePenIcon,
} from "@/icons/app-icons"
import { language } from "@/context/language"
import { parseSubagentSession } from "@/lib/session-family"
import type { SessionInfo } from "@/state/chat-types"
import { ThreadHistoryPopover } from "@/components/directory-chat/thread-history-popover"
import { TextShimmer } from "@/components/chat/tools/text-shimmer"

type ThreadControlSize = "regular" | "compact" | "mini" | "titlebar"

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
  /** Optional thread title rendered inside the pill (after controls). */
  title?: string
  titleActive?: boolean
  size?: ThreadControlSize
  className?: string
}

type ThreadParentReturnButtonProps = {
  parentSession?: SessionInfo
  onSelectSession?: (sessionID: string) => void | Promise<void>
  size?: ThreadControlSize
  className?: string
}

/** 14px; the default stroke scales with size. */
const CONTROL_ICON_SIZE_CLASS = "size-3.5 shrink-0"

const CONTROL_SIZE_STYLES = {
  regular: {
    // No inset padding — hover fill must meet the outer rounded border (no halo gap).
    pill: "overflow-hidden p-0",
    button: "size-6",
    icon: CONTROL_ICON_SIZE_CLASS,
    parentButton: "h-8 gap-1.5 px-2.5",
    parentText: "max-w-32",
  },
  compact: {
    pill: "overflow-hidden p-0",
    button: "size-6",
    icon: CONTROL_ICON_SIZE_CLASS,
    parentButton: "h-7 gap-1 px-2",
    parentText: "max-w-28",
  },
  mini: {
    pill: "overflow-hidden p-0",
    button: "size-[22px]",
    icon: CONTROL_ICON_SIZE_CLASS,
    parentButton: "h-6 gap-1 px-1.5",
    parentText: "max-w-24",
  },
  // Matches desktop titlebar left cluster (sidebar / pop-out): h-6 w-8 hit targets.
  titlebar: {
    pill: "overflow-hidden p-0",
    button: "box-border h-6 w-8 p-0",
    icon: CONTROL_ICON_SIZE_CLASS,
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
        "rounded-full text-icon-base transition-all hover:bg-surface-raised-base-hover hover:text-text-strong",
        styles.parentButton,
        props.className,
      )}
      aria-label={`Return to ${parentSessionTitle}`}
      onClick={() => {
        void props.onSelectSession?.(parentSessionID)
      }}
    >
      <CornerUpLeftIcon className={CONTROL_ICON_SIZE_CLASS} />
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
  const title = props.title?.trim()
  const hasTitle = Boolean(title)
  const hasLeadingControls = showHistory || showNewSession || showFloat
  const leadingControlCount = Number(showHistory) + Number(showNewSession) + Number(showFloat)
  // Single lone control (e.g. new-chat only) should not get the pill "halo" border.
  // Title + any control always uses pill chrome so the label sits inside the shell.
  const usePillChrome =
    showWindowControls || leadingControlCount > 1 || (hasTitle && hasLeadingControls)

  if (!hasLeadingControls && !showWindowControls && !hasTitle) {
    return null
  }

  // When inside pill chrome, square the control so hover is clipped by the outer rounded border.
  const controlRadius = usePillChrome ? "rounded-none" : "rounded-full"
  const controlClassName = cn(
    controlRadius,
    "text-icon-base transition-all hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.95] [-webkit-app-region:no-drag]",
    styles.button,
  )

  const historyControl = showHistory ? (
    <ThreadHistoryPopover
      sessions={props.sessions}
      activeSessionID={props.activeSessionID}
      linkedSessionID={props.linkedSessionID}
      onSelectSession={props.onSelectSession}
      notebookName={props.notebookName}
      triggerClassName={controlClassName}
      triggerIconClassName={styles.icon}
    />
  ) : null

  const newSessionControl = showNewSession ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={controlClassName}
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
      className={controlClassName}
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
        "flex items-center",
        hasLeadingControls ? "ml-0.5 border-l border-border-weaker-base" : "",
      )}
    >
      {props.onMinimizeChat ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-action="directory-chat-minimize"
          className={controlClassName}
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
          className={controlClassName}
          aria-label={language.t("sidebar.dockChat")}
          title={language.t("sidebar.dockChat")}
          onClick={props.onDockChat}
        >
          <Maximize2Icon className={cn(styles.icon, "-rotate-90")} />
        </Button>
      ) : null}
    </div>
  ) : null

  const titleControl =
    hasTitle && title ? (
      <ThreadHistoryPopover
        sessions={props.sessions}
        activeSessionID={props.activeSessionID}
        linkedSessionID={props.linkedSessionID}
        onSelectSession={props.onSelectSession}
        notebookName={props.notebookName}
        openOnTriggerHover
        trigger={
          <button
            type="button"
            className={cn(
              "min-w-0 max-w-[20rem] shrink truncate text-left text-xs transition-colors hover:bg-surface-raised-base-hover [-webkit-app-region:no-drag]",
              usePillChrome ? "rounded-none text-icon-base" : "rounded-full",
              props.size === "titlebar" ? "h-6 px-2.5" : "h-6 px-2",
            )}
            aria-label={language.t("sidebar.showAllThreads")}
          >
            <TextShimmer text={title} active={props.titleActive ?? false} />
          </button>
        }
      />
    ) : null

  const showTitleSeparator = Boolean(titleControl && (hasLeadingControls || showWindowControls))

  return (
    <div
      className={cn(
        "flex min-w-0 shrink items-center self-center",
        usePillChrome
          ? cn(
              "rounded-full border border-border-weaker-base bg-surface-raised-base/60 shadow-xs",
              styles.pill,
            )
          : "gap-0.5",
        props.className,
      )}
    >
      {historyControl}
      {newSessionControl}
      {floatControl}
      {windowControls}
      {showTitleSeparator ? (
        <div
          aria-hidden
          className="h-3.5 w-px shrink-0 bg-border-weaker-base"
          data-component="thread-action-pill-title-separator"
        />
      ) : null}
      {titleControl}
    </div>
  )
}
