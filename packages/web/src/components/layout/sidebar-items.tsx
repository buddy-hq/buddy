import type { SessionInfo } from '@/state/chat-types'
import { projectInitials, relativeTime } from './sidebar-helpers'
import { PlusIcon } from './sidebar-icons'

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
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-transparent hover:border-border hover:bg-muted/60'
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
      className={`group/session relative w-full rounded-md pl-2 pr-2 py-1 text-left transition-colors ${
        props.active
          ? 'bg-muted border border-border'
          : 'border border-transparent hover:bg-muted/40 hover:border-border/70'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`inline-block size-1.5 rounded-full shrink-0 ${props.busy ? 'bg-[var(--chart-3)]' : 'bg-[var(--chart-2)]'}`}
        />
        <span className="text-sm truncate">{props.session.title || 'New chat'}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
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
      className="w-full rounded-md px-2 py-1 text-left text-sm border border-transparent hover:border-border hover:bg-muted/40"
    >
      <span className="inline-flex items-center gap-2">
        <PlusIcon className="size-3.5 text-muted-foreground" />
        <span>New chat</span>
      </span>
    </button>
  )
}
