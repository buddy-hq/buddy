import type { SessionInfo } from "@/state/chat-types"
import { language } from "@/context/language"
import { projectInitials, relativeTime } from "./sidebar-helpers"
import { PlusIcon } from "./sidebar-icons"
import { LoaderCircleIcon } from "lucide-react"

type ProjectIconProps = {
  project: string
  active?: boolean
  onClick: () => void
}

export function ProjectIcon(props: ProjectIconProps) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.project}
      className={`size-10 rounded-lg border text-xs font-semibold transition-colors ${
        props.active
          ? "bg-surface-interactive-base text-text-on-interactive-base border-border-interactive-base"
          : "border-transparent hover:border-border-base hover:bg-surface-weak/60"
      }`}
    >
      {projectInitials(props.project)}
    </button>
  )
}

type SessionItemProps = {
  session: SessionInfo
  active: boolean
  busy: boolean
  onSelect: () => void
}

export function SessionItem(props: SessionItemProps) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={`group/session relative w-full rounded-md pl-6 pr-2 py-1 text-left transition-colors ${
        props.active
          ? "bg-surface-weak border border-border-base"
          : "border border-transparent hover:bg-surface-weak/40 hover:border-border-base/70"
      }`}
    >
      <div className="absolute left-2 top-1.5 flex items-center justify-center">
        {props.busy ? (
          <LoaderCircleIcon
            className="size-3 shrink-0 animate-spin text-icon-warning-base"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className="flex items-center min-w-0">
        <span className="text-sm truncate">
          {props.session.title || language.t("sidebar.newChat")}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[11px] text-text-weak">
        <span className="truncate">{props.session.id.slice(0, 10)}</span>
        <span>{relativeTime(props.session.time.updated ?? props.session.time.created)}</span>
      </div>
    </button>
  )
}

type NewSessionItemProps = {
  onClick: () => void
}

export function NewSessionItem(props: NewSessionItemProps) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="w-full rounded-md px-2 py-1 text-left text-sm border border-transparent hover:border-border-base hover:bg-surface-weak/40"
    >
      <span className="inline-flex items-center gap-2">
        <PlusIcon className="size-3.5 text-text-weak" />
        <span>{language.t("sidebar.newChat")}</span>
      </span>
    </button>
  )
}
