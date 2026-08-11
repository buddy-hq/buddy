import { forwardRef, type ComponentType } from "react"
import { Button, cn } from "@buddy/ui"

type ReaderToolbarButtonProps = {
  icon: ComponentType<{ className?: string }>
  label: string
  active?: boolean
  pressed?: boolean
  onClick?: () => void
  className?: string
}

export const ReaderToolbarButton = forwardRef<HTMLButtonElement, ReaderToolbarButtonProps>(
  function ReaderToolbarButton(
    { icon: Icon, label, active = false, pressed, onClick, className },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={pressed}
        title={label}
        onClick={onClick}
        className={cn(
          "shrink-0",
          active
            ? "bg-surface-raised-strong text-text-strong"
            : "text-text-weaker hover:bg-surface-weak hover:text-text-base",
          className,
        )}
      >
        <Icon />
      </Button>
    )
  },
)
