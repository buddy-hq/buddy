import type { ReactNode } from "react"
import { XIcon } from "@/icons/app-icons"
import { Button, cn } from "@buddy/ui"

type ReaderPanelHeaderProps = {
  title: string
  onClose?: () => void
  trailing?: ReactNode
  className?: string
}

export function ReaderPanelHeader({ title, onClose, trailing, className }: ReaderPanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between border-b border-border-weak-base px-3 py-2",
        className,
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-text-weaker">{title}</span>
      {trailing}
      {onClose ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close"
          onClick={onClose}
          className="text-text-weaker"
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  )
}

export function ReaderPanelBody(props: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto p-4", props.className)}>
      {props.children}
    </div>
  )
}

export function ReaderPanelLabel(props: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "mb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-weaker",
        props.className,
      )}
    >
      {props.children}
    </p>
  )
}
