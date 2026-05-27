import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@buddy/ui/lib/utils"

const composerDockVariants = cva(
  "relative flex flex-col overflow-hidden rounded-2xl border border-border-base bg-surface-raised-base backdrop-blur-xl shadow-lg outline-none",
  {
    variants: {
      size: {
        auto: "h-auto max-h-[60vh]",
        sm: "h-[300px]",
        md: "h-[440px]",
        lg: "h-[60vh] min-h-[500px]",
      },
    },
    defaultVariants: {
      size: "auto",
    },
  },
)

type ComposerDockProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof composerDockVariants> & {
    autoFocus?: boolean
  }

const ComposerDock = React.forwardRef<HTMLDivElement, ComposerDockProps>(
  ({ className, size, autoFocus = true, children, ...props }, forwardedRef) => {
    const internalRef = React.useRef<HTMLDivElement | null>(null)
    // Merge refs is a bit complex in raw React, we'll just use the forwarded ref if provided
    // but we need it for focus. Let's just use internalRef if forwardedRef is null.
    // Actually, setting a standard callback ref is better:
    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        internalRef.current = node
        if (typeof forwardedRef === "function") {
          forwardedRef(node)
        } else if (forwardedRef) {
          ;(forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        }
      },
      [forwardedRef],
    )

    React.useEffect(() => {
      if (!autoFocus) return
      const frame = window.requestAnimationFrame(() => {
        if (internalRef.current) {
          internalRef.current.focus({ preventScroll: true })
        }
      })
      return () => window.cancelAnimationFrame(frame)
    }, [autoFocus])

    return (
      <div
        ref={setRefs}
        tabIndex={-1}
        className={cn(composerDockVariants({ size, className }))}
        {...props}
      >
        {children}
      </div>
    )
  },
)
ComposerDock.displayName = "ComposerDock"

const ComposerDockHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative flex shrink-0 items-center justify-between border-b border-border-weak-base bg-surface-base/50 px-4 py-2 gap-4",
        className,
      )}
      {...props}
    />
  ),
)
ComposerDockHeader.displayName = "ComposerDockHeader"

const ComposerDockTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { icon?: React.ElementType; title: string }
>(({ className, icon: Icon, title, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-border-weak-base bg-surface-weak px-2.5 py-0.5 shadow-sm sm:flex",
      className,
    )}
    {...props}
  >
    {Icon && <Icon className="size-3 text-text-weak" />}
    <h3 className="text-[9px] font-black uppercase tracking-wider text-text-base">{title}</h3>
  </div>
))
ComposerDockTitle.displayName = "ComposerDockTitle"

const ComposerDockActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex shrink-0 items-center gap-1", className)} {...props} />
  ),
)
ComposerDockActions.displayName = "ComposerDockActions"

const ComposerDockBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }
>(({ className, padded = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden",
      padded && "p-4",
      className,
    )}
    {...props}
  />
))
ComposerDockBody.displayName = "ComposerDockBody"

const ComposerDockFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex shrink-0 min-h-[52px] items-center border-t border-border-weak-base bg-surface-base/30 px-5 py-3",
        className,
      )}
      {...props}
    />
  ),
)
ComposerDockFooter.displayName = "ComposerDockFooter"

export {
  ComposerDock,
  ComposerDockHeader,
  ComposerDockTitle,
  ComposerDockActions,
  ComposerDockBody,
  ComposerDockFooter,
}
