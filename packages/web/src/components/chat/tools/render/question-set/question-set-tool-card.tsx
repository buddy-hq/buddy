import { ToolStatusBadge } from "../../tool-header"

type QuestionSetToolCardProps = {
  title: string
  subtitle?: string
  status?: "pending" | "running" | "completed" | "error"
  children?: React.ReactNode
}

export function QuestionSetToolCard({
  title,
  subtitle,
  status,
  children,
}: QuestionSetToolCardProps) {
  return (
    <div className="flex min-w-0 w-full max-w-full flex-col overflow-hidden rounded-xl bg-background-base shadow-sm">
      <div className="flex w-full items-center justify-between gap-4 border-b border-border-base/40 bg-surface-base px-3 py-2">
        <div className="flex min-w-0 flex-col">
          <span className="min-w-0 truncate text-xs font-semibold text-text-base">{title}</span>
          {subtitle ? <span className="text-[11px] text-text-weak">{subtitle}</span> : null}
        </div>
        {status ? <ToolStatusBadge status={status} /> : null}
      </div>
      {children ? <div className="p-3">{children}</div> : null}
    </div>
  )
}
