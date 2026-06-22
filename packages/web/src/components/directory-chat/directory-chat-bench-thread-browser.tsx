import { cn } from "@buddy/ui"
import type { SessionInfo } from "@/state/chat-types"
import {
  ThreadActionPill,
  ThreadParentReturnButton,
} from "@/components/directory-chat/thread-titlebar-controls"

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

export function DirectoryChatBenchThreadBrowser(props: DirectoryChatBenchThreadBrowserProps) {
  const linkedSessionID = props.linkedSessionID

  return (
    <div
      data-component="directory-chat-bench-thread-browser"
      className={cn("flex w-full items-center justify-between gap-4 py-1", props.className)}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <ThreadParentReturnButton
          parentSession={props.parentSession}
          onSelectSession={props.onSelectSession}
        />

        <ThreadActionPill
          sessions={props.sessions}
          activeSessionID={props.activeSessionID}
          linkedSessionID={linkedSessionID}
          onSelectSession={props.onSelectSession}
          onNewSession={props.onNewSession}
          onFloatChat={props.onFloatChat}
        />

        <span className="min-w-0 truncate text-sm font-medium tracking-tight text-text-base/90">
          {props.sessionTitle}
        </span>
      </div>
    </div>
  )
}
