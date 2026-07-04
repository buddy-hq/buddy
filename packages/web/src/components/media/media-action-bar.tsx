import { memo, type ReactNode } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@buddy/ui"
import type { MediaAction } from "./types"

function mediaActionButtonClassName(minimal?: boolean): string {
  return cn(
    "inline-flex items-center justify-center rounded-full transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50",
    minimal
      ? "size-7 text-text-weak/70 hover:bg-surface-raised-base hover:text-text-base [&_svg]:size-3.5"
      : "size-9 border border-border-base/70 bg-background-base/88 text-text-weak shadow-[0_12px_32px_rgba(0,0,0,0.24)] backdrop-blur-xl hover:bg-surface-raised-base hover:text-text-base [&_svg]:size-4",
  )
}

export function MediaActionBar(props: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">{props.children}</div>
    </TooltipProvider>
  )
}

export const MediaActionButton = memo(function MediaActionButton(props: {
  label: string
  onClick: () => void
  icon: ReactNode
  disabled?: boolean
  dataAction?: string
  minimal?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        {...(props.dataAction ? { "data-action": props.dataAction } : {})}
        disabled={props.disabled}
        aria-label={props.label}
        onClick={(event) => {
          event.stopPropagation()
          props.onClick()
        }}
        onMouseDown={(event) => event.preventDefault()}
        className={mediaActionButtonClassName(props.minimal)}
      >
        {props.icon}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        <p>{props.label}</p>
      </TooltipContent>
    </Tooltip>
  )
})

export function MediaActionValue(props: { children: ReactNode; minimal?: boolean }) {
  return (
    <div
      className={cn(
        "min-w-[2.75rem] px-1 text-center font-medium text-text-weak",
        props.minimal ? "text-[10px]" : "text-[11px]",
      )}
    >
      {props.children}
    </div>
  )
}

export function MediaActionSeparator() {
  return <div className="mx-1 h-4 w-px bg-border-base/50" />
}

function MediaMenu(props: { action: Extract<MediaAction, { kind: "menu" }>; minimal?: boolean }) {
  const Icon = props.action.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        disabled={props.action.disabled}
        aria-label={props.action.label}
        title={props.action.label}
        className={mediaActionButtonClassName(props.minimal)}
        onClick={(event) => event.stopPropagation()}
      >
        <Icon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {props.action.items.map((item) => {
            if (item.kind === "separator") {
              return <DropdownMenuSeparator key={item.id} />
            }
            const ItemIcon = item.icon
            return (
              <DropdownMenuItem key={item.id} disabled={item.disabled} onSelect={item.onSelect}>
                {ItemIcon ? (
                  <ItemIcon className={item.loading ? "animate-spin" : undefined} aria-hidden />
                ) : null}
                {item.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MediaActions(props: { actions: MediaAction[]; minimal?: boolean }) {
  return (
    <MediaActionBar>
      {props.actions.map((action) => {
        if (action.kind === "menu") {
          return <MediaMenu key={action.id} action={action} minimal={props.minimal} />
        }
        const Icon = action.icon
        return (
          <MediaActionButton
            key={action.id}
            label={action.label}
            disabled={action.disabled}
            onClick={action.onSelect}
            icon={<Icon className={action.loading ? "animate-spin" : undefined} aria-hidden />}
            minimal={props.minimal}
          />
        )
      })}
    </MediaActionBar>
  )
}
