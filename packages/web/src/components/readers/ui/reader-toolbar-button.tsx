import { forwardRef, type ComponentProps, type ComponentType } from "react"
import { Button, cn } from "@buddy/ui"

type ReaderToolbarButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  icon: ComponentType<{ className?: string }>
  label: string
  active?: boolean
  pressed?: boolean
}

/** Native reader control that forwards popover semantics and input handlers to its button. */
export const ReaderToolbarButton = forwardRef<HTMLButtonElement, ReaderToolbarButtonProps>(
  function ReaderToolbarButton(
    { icon: Icon, label, active = false, pressed, className, ...buttonProps },
    ref,
  ) {
    return (
      <Button
        {...buttonProps}
        ref={ref}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={pressed}
        title={label}
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
