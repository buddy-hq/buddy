import { MapIcon, Redo2Icon, Undo2Icon } from "@/icons/app-icons"
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@buddy/ui"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@buddy/ui/components/ui/input-group"
import type { ReaderPositionAnchor } from "../reader-types"
import { ReaderPanelBody, ReaderPanelHeader, ReaderPanelLabel } from "./reader-panel"

export type ReaderRecentLocation = {
  id: string
  label: string
  position: string
  anchor: ReaderPositionAnchor
}

type ReaderLocationPopoverProps = {
  section: string
  position: string
  targetLabel: string
  target: string
  onTargetChange: (value: string) => void
  onSubmitTarget: () => void
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
  recent: ReaderRecentLocation[]
  onSelectRecent: (anchor: ReaderPositionAnchor) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReaderLocationPopover({
  section,
  position,
  targetLabel,
  target,
  onTargetChange,
  onSubmitTarget,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  recent,
  onSelectRecent,
  open,
  onOpenChange,
}: ReaderLocationPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <div className="flex h-7 shrink-0 items-center justify-center px-2">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${section} · ${position} — jump to a location`}
            title={`${section} · ${position} — jump to a location`}
            className={cn(
              "flex min-w-0 max-w-full items-baseline gap-1.5 overflow-hidden rounded px-2 py-0.5 text-[11px] text-text-weaker hover:bg-surface-raised-base hover:text-text-weak",
              open && "bg-surface-raised-base text-text-weak",
            )}
          >
            <span className="min-w-0 shrink truncate">{section}</span>
            <span aria-hidden className="shrink-0 opacity-50">
              ·
            </span>
            <span className="shrink-0 font-mono tabular-nums">{position}</span>
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={4}
        className="flex w-[300px] flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha p-0 shadow-xl"
      >
        <ReaderPanelHeader title="Go to" onClose={() => onOpenChange(false)} />
        <ReaderPanelBody>
          <div className="mb-3 flex items-center gap-1.5">
            <InputGroup className="min-w-0 flex-1 rounded-md bg-background-base">
              <InputGroupAddon>
                <MapIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={target}
                onChange={(event) => onTargetChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  onSubmitTarget()
                }}
                aria-label={targetLabel}
                placeholder={targetLabel}
                className="text-xs"
              />
            </InputGroup>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Back"
              title="Back  ⌘["
              disabled={!canGoBack}
              onClick={onGoBack}
            >
              <Undo2Icon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Forward"
              title="Forward  ⌘]"
              disabled={!canGoForward}
              onClick={onGoForward}
            >
              <Redo2Icon />
            </Button>
          </div>

          {recent.length > 0 ? (
            <>
              <ReaderPanelLabel>Recent</ReaderPanelLabel>
              <div className="flex flex-col">
                {recent.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onSelectRecent(entry.anchor)}
                    className={cn(
                      "flex items-baseline justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface-base-hover",
                      index === recent.length - 1 &&
                        "bg-surface-raised-strong text-text-strong hover:bg-surface-raised-strong",
                    )}
                  >
                    <span className="truncate text-text-base">{entry.label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-text-weaker">
                      {entry.position}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </ReaderPanelBody>
      </PopoverContent>
    </Popover>
  )
}
