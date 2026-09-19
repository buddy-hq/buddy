import type { ComponentType, ReactNode } from "react"
import { Button } from "@buddy/ui"
import { ArrowLeftIcon, ArrowRightIcon, RefreshCwIcon } from "@/icons/app-icons"

function BrowserToolbarButton(props: {
  label: string
  icon: ComponentType<{ className?: string }>
  disabled?: boolean
  onClick: () => void
}) {
  const Icon = props.icon
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon className="size-4" />
    </Button>
  )
}

export function BrowserProfileLabel(props: { name: string }) {
  return (
    <span className="max-w-28 shrink-0 truncate rounded-md bg-surface-base px-2 py-0.5 text-xs text-text-weak">
      {props.name}
    </span>
  )
}

export function BrowserToolbar(props: {
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  onBack: () => void
  onForward: () => void
  onReload: () => void
  children: ReactNode
}) {
  return (
    <div
      aria-busy={props.loading}
      className="relative flex h-10 shrink-0 items-center gap-1 border-b border-border-weaker-base px-2"
    >
      <BrowserToolbarButton
        label="Back"
        icon={ArrowLeftIcon}
        disabled={!props.canGoBack}
        onClick={props.onBack}
      />
      <BrowserToolbarButton
        label="Forward"
        icon={ArrowRightIcon}
        disabled={!props.canGoForward}
        onClick={props.onForward}
      />
      <BrowserToolbarButton label="Reload" icon={RefreshCwIcon} onClick={props.onReload} />
      {props.children}
      {props.loading ? <div aria-hidden className="browser-loading-bar" /> : null}
    </div>
  )
}
