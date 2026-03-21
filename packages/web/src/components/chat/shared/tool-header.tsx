import { Badge, cn } from '@buddy/ui'
import type { ToolInfo, ToolState } from '../tools/registry'

interface ToolHeaderProps {
  info: ToolInfo
  status: ToolState['status']
  running: boolean
}

function statusLabel(status: ToolState['status']): string {
  if (status === 'completed') return 'completed'
  if (status === 'running') return 'running'
  if (status === 'error') return 'error'
  return 'pending'
}

function toolStatusTone(status: ToolState['status']): string {
  if (status === 'completed') {
    return 'border-primary/40 bg-primary/10 text-primary'
  }
  if (status === 'error') {
    return 'border-destructive/40 bg-destructive/10 text-destructive'
  }
  if (status === 'running' || status === 'pending') {
    return 'border-border bg-muted text-muted-foreground'
  }
  return 'border-border bg-muted text-muted-foreground'
}

export function ToolStatusBadge({ status }: { status: ToolState['status'] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        toolStatusTone(status),
      )}
    >
      {statusLabel(status)}
    </Badge>
  )
}

export function ToolHeader({ info, status, running }: ToolHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={cn('text-sm font-medium text-foreground', running && 'animate-pulse')}>
          {info.title}
        </span>
        {info.subtitle ? (
          <span className="truncate text-sm text-muted-foreground">{info.subtitle}</span>
        ) : null}
        {info.detail ? (
          <span className="truncate text-sm text-muted-foreground">{info.detail}</span>
        ) : null}
        {info.args?.map((arg) => (
          <span key={arg} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {arg}
          </span>
        ))}
      </div>
      <ToolStatusBadge status={status} />
    </div>
  )
}
