import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
  // Icons from @buddy/ui
  CopyIcon,
} from "@buddy/ui"
import type {
  FoliateReaderLocation,
  FoliateReaderSnapshot,
  FoliateReaderLandmark,
} from "../foliate-reader-types"
import { toPercentLabel } from "../utils/foliate-formatters"
import { copyText } from "../utils/foliate-helpers"
import { ArrowRightIcon } from "lucide-react"

export interface FoliateLocationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  location: FoliateReaderLocation
  snapshot: FoliateReaderSnapshot | null
  locationDraft: string
  setLocationDraft: (draft: string) => void
  flattenedToc: Array<{ href: string; label: string; depth: number }>
  readerLandmarks: FoliateReaderLandmark[]
  onGoToLocation: (target: string) => void
}

export function FoliateLocationDialog({
  open,
  onOpenChange,
  location,
  snapshot,
  locationDraft,
  setLocationDraft,
  flattenedToc,
  readerLandmarks,
  onGoToLocation,
}: FoliateLocationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Location &amp; navigation</DialogTitle>
        </DialogHeader>

        {/* Current position summary */}
        <div className="grid grid-cols-3 divide-x divide-border-base/40 rounded border border-border-base/40 bg-surface-weak/20">
          {[
            { label: "Chapter", value: location.tocLabel ?? "—" },
            { label: "Page", value: location.pageLabel ?? "—" },
            {
              label: "Progress",
              value: location.locationLabel ?? toPercentLabel(location.fraction) ?? "—",
            },
          ].map(({ label, value }) => (
            <div key={label} className="px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">{label}</div>
              <div className="mt-0.5 truncate text-[12px] font-medium text-text-base">{value}</div>
            </div>
          ))}
        </div>

        {/* CFI jump */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">Jump to CFI</div>
          <div className="flex items-center gap-1.5">
            <Input
              value={locationDraft}
              onChange={(e) => setLocationDraft(e.target.value)}
              placeholder="Paste a CFI target…"
              className="h-8 flex-1 font-mono text-[11px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && locationDraft.trim()) {
                  onGoToLocation(locationDraft)
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void copyText((locationDraft.trim() || location.cfi || "").trim())}
              disabled={!locationDraft.trim() && !location.cfi}
              aria-label="Copy CFI"
              className="h-8 w-8 shrink-0"
            >
              <CopyIcon className="size-3.5" />
            </Button>
            <Button
              size="sm"
              className="h-8 shrink-0"
              onClick={() => onGoToLocation(locationDraft)}
              disabled={!locationDraft.trim()}
            >
              Go
            </Button>
          </div>
        </div>

        {/* Chapter + page jump */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">Chapter</div>
            <Select
              value=""
              onValueChange={(value) => {
                if (value) onGoToLocation(value)
              }}
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue placeholder="Jump to…" />
              </SelectTrigger>
              <SelectContent>
                {flattenedToc.map((item) => (
                  <SelectItem key={item.href} value={item.href}>
                    <span style={{ paddingLeft: `${item.depth * 12}px` }}>{item.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">Page</div>
            <Select
              value=""
              onValueChange={(value) => {
                if (value) onGoToLocation(value)
              }}
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue placeholder="Jump to…" />
              </SelectTrigger>
              <SelectContent>
                {(snapshot?.pageList ?? []).map((item) => (
                  <SelectItem key={item.href} value={item.href}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Landmarks */}
        {readerLandmarks.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">
                Landmarks
              </div>
              <span className="font-mono text-[10px] text-text-weaker">
                {readerLandmarks.length}
              </span>
            </div>
            <ScrollArea className="max-h-48 rounded border border-border-base/40">
              <div className="py-1">
                {readerLandmarks.map((landmark) => (
                  <button
                    key={`${landmark.href}:${landmark.label}`}
                    type="button"
                    onClick={() => onGoToLocation(landmark.href)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-weak/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12px] text-text-base">{landmark.label}</div>
                      {landmark.typeLabel ? (
                        <div className="truncate text-[10px] text-text-weaker">
                          {landmark.typeLabel}
                        </div>
                      ) : null}
                    </div>
                    <ArrowRightIcon className="size-3.5 shrink-0 text-text-weaker" />
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
