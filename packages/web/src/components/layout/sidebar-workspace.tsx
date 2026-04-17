import { useMemo, useState } from "react"
import { Button } from "@buddy/ui"
import { language } from "@/context/language"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { isSessionWorking } from "@/state/session-status"
import { getFilename } from "./sidebar-helpers"
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "./sidebar-icons"
import { NewSessionItem, SessionItem } from "./sidebar-items"
import { workspaceOpenState } from "./sidebar-workspace-helpers"

type SidebarWorkspaceProps = {
  directory: string
  sessions: SessionInfo[]
  activeSessionID?: string
  sessionStatusByID: Record<string, SessionStatusInfo>
  onSelectSession: (sessionID: string) => void
  onNewSession: () => void
  onRemoveProject: () => void
}

export function SidebarWorkspace(props: SidebarWorkspaceProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const workspaceLabel = useMemo(() => getFilename(props.directory), [props.directory])
  const open = workspaceOpenState(expanded, props.directory, true)

  return (
    <aside className="w-full md:w-[320px] shrink-0 max-h-[45vh] md:max-h-none border-b md:border-b-0 md:border-r bg-background-base/20 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b">
        <div className="group/workspace relative rounded-md">
          <button
            type="button"
            className="w-full rounded-md px-2 py-1.5 text-left hover:bg-surface-weak/40 transition-colors"
            onClick={() =>
              setExpanded((current) => ({
                ...current,
                [props.directory]: !workspaceOpenState(current, props.directory, true),
              }))
            }
          >
            <div className="flex items-center gap-2 min-w-0 pr-12">
              {open ? (
                <ChevronDownIcon className="size-3.5 text-text-weak" />
              ) : (
                <ChevronRightIcon className="size-3.5 text-text-weak" />
              )}
              <span className="text-sm text-text-weak shrink-0">
                {language.t("sidebar.localLabel")}
              </span>
              <span className="text-sm truncate">{workspaceLabel}</span>
            </div>
          </button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 pointer-events-none group-hover/workspace:opacity-100 group-hover/workspace:pointer-events-auto"
            onClick={props.onNewSession}
            title={language.t("sidebar.newChat")}
          >
            <PlusIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1">
          <NewSessionItem onClick={props.onNewSession} />
          {props.sessions.length === 0 ? (
            <p className="px-2 py-2 text-xs text-text-weak">
              {language.t("sidebar.noSessionsYet")}
            </p>
          ) : (
            props.sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                active={session.id === props.activeSessionID}
                busy={isSessionWorking({
                  info: session,
                  status: props.sessionStatusByID[session.id],
                })}
                onSelect={() => props.onSelectSession(session.id)}
              />
            ))
          )}
        </div>
      )}

      <div className="border-t px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={props.onRemoveProject}
          className="w-full justify-start"
        >
          {language.t("sidebar.closeProject")}
        </Button>
      </div>
    </aside>
  )
}
