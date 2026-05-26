import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Undo2Icon,
  Redo2Icon,
  EllipsisIcon,
  PinIcon,
  SearchIcon,
  MapIcon,
  SettingsIcon,
  CircleQuestionMarkIcon,
} from "lucide-react"
import {
  Button,
  Separator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@buddy/ui"
import {
  DEFAULT_PROGRESS_STEPS,
  DEFAULT_TITLE,
  READER_THEMES,
  FLOW_PAGINATED,
  FLOW_SCROLLED,
} from "../foliate-reader-constants"
import { toPercentLabel, renderMetadataSummary } from "../utils/foliate-formatters"
import type { FoliateReaderLocation, FoliateReaderSnapshot } from "../foliate-reader-types"
import type { ReaderBookmark } from "../foliate-reader-types"
import { LayoutPanelLeftIcon, ScrollTextIcon } from "lucide-react"

export interface FoliateToolbarProps {
  showToolbar: boolean
  showSidebar: boolean
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  status: "idle" | "loading" | "ready" | "error"
  historyState: { canGoBack: boolean; canGoForward: boolean }
  locationState: FoliateReaderLocation
  snapshot: FoliateReaderSnapshot | null
  currentBookmark: ReaderBookmark | undefined
  preferences: { themeId: string; flow: string }
  canChangeFlow: boolean
  sectionFractions: number[]
  sliderListId: string
  progressDraft: number | null
  setProgressDraft: (draft: number | null) => void
  onGoLeft: () => void
  onGoRight: () => void
  onHistoryBack: () => void
  onHistoryForward: () => void
  onToggleBookmark: () => void
  onOpenLocationDialog: () => void
  onOpenSearch: (query: string) => void
  onSetSidebarTab: (tab: string) => void
  onSetSidebarOpen: (open: boolean) => void
  isFoliateReaderThemeId: (value: string) => value is any
  onGoToFraction: (fraction: number) => void
}

export function FoliateToolbar({
  showToolbar,
  showSidebar,
  sidebarOpen,
  setSidebarOpen,
  status,
  historyState,
  locationState,
  snapshot,
  currentBookmark,
  preferences,
  canChangeFlow,
  sectionFractions,
  sliderListId,
  progressDraft,
  setProgressDraft,
  onGoLeft,
  onGoRight,
  onHistoryBack,
  onHistoryForward,
  onToggleBookmark,
  onOpenLocationDialog,
  onOpenSearch,
  onSetSidebarTab,
  onSetSidebarOpen,
  isFoliateReaderThemeId,
  onGoToFraction,
}: FoliateToolbarProps) {
  if (!showToolbar) return null

  const progressSummary = renderMetadataSummary(locationState)

  return (
    <header className="space-y-3 border-b border-border-base/70 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-raised-base)_94%,transparent)_0%,color-mix(in_oklab,var(--surface-base)_97%,transparent)_100%)] px-4 py-3 backdrop-blur">
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex items-center gap-2">
          {showSidebar ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarOpen ? <></> : <></>}
            </Button>
          ) : null}

          <div className="flex items-center gap-1 rounded-full border border-border-base/70 bg-surface-raised-base/70 p-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Previous page"
              onClick={onGoLeft}
              disabled={status !== "ready"}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="History back"
              onClick={onHistoryBack}
              disabled={!historyState.canGoBack}
            >
              <Undo2Icon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="History forward"
              onClick={onHistoryForward}
              disabled={!historyState.canGoForward}
            >
              <Redo2Icon className="size-4" />
            </Button>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Next page"
              onClick={onGoRight}
              disabled={status !== "ready"}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenLocationDialog}
          className="min-w-0 rounded-[1.15rem] border border-border-base/70 bg-surface-raised-base/62 px-3 py-2.5 text-left shadow-[inset_0_1px_0_color-mix(in_oklab,var(--surface-raised-stronger)_14%,transparent)] transition hover:border-border-strong-base hover:bg-surface-raised-base/78"
          aria-label="Open location and jumps"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                <MapIcon className="size-3.5" />
                Location
              </div>
              <div className="mt-1 truncate text-sm font-medium text-text-strong">
                {locationState.tocLabel ?? snapshot?.title ?? DEFAULT_TITLE}
              </div>
              <div className="truncate text-xs text-text-weak">
                {locationState.pageLabel ??
                  locationState.locationLabel ??
                  snapshot?.author ??
                  progressSummary}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                Progress
              </div>
              <div className="mt-1 text-sm font-semibold text-text-strong">
                {toPercentLabel(locationState.fraction) ?? "0%"}
              </div>
            </div>
          </div>
        </button>

        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant={currentBookmark ? "secondary" : "outline"}
            onClick={onToggleBookmark}
            className="rounded-full"
          >
            <PinIcon className="size-4" />
            {currentBookmark ? "Saved" : "Bookmark"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Reader actions">
                <EllipsisIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => onOpenSearch("")}>
                <SearchIcon className="mr-2 size-4" />
                Find in book
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenLocationDialog}>
                <MapIcon className="mr-2 size-4" />
                Location and jumps
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onSetSidebarOpen(true)
                  onSetSidebarTab("preferences")
                }}
              >
                <SettingsIcon className="mr-2 size-4" />
                Reader preferences
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {}}>
                <CircleQuestionMarkIcon className="mr-2 size-4" />
                Keyboard shortcuts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border-base/60 pt-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="space-y-2 rounded-[1.1rem] border border-border-base/60 bg-surface-weak/15 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3 text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
            <span>Progress</span>
            <span>{toPercentLabel(locationState.fraction) ?? "0%"}</span>
          </div>
          <input
            type="range"
            min="0"
            max={String(DEFAULT_PROGRESS_STEPS)}
            step="1"
            list={sliderListId}
            value={
              progressDraft ?? Math.round((locationState.fraction ?? 0) * DEFAULT_PROGRESS_STEPS)
            }
            onChange={(event) => {
              setProgressDraft(Number(event.target.value))
            }}
            onMouseUp={() => {
              if (progressDraft === null) return
              onGoToFraction(progressDraft / DEFAULT_PROGRESS_STEPS)
              setProgressDraft(null)
            }}
            onTouchEnd={() => {
              if (progressDraft === null) return
              onGoToFraction(progressDraft / DEFAULT_PROGRESS_STEPS)
              setProgressDraft(null)
            }}
            className="w-full accent-[var(--text-interactive-base)]"
          />
          <datalist id={sliderListId}>
            {sectionFractions.map((fraction) => (
              <option key={fraction} value={Math.round(fraction * DEFAULT_PROGRESS_STEPS)} />
            ))}
          </datalist>
        </div>

        <Select
          value={preferences.themeId}
          onValueChange={(value) => {
            if (isFoliateReaderThemeId(value)) {
              // setPreferences((current) => ({ ...current, themeId: value }))
            }
          }}
        >
          <SelectTrigger className="min-w-[10rem] rounded-full bg-surface-raised-base/70">
            <SelectValue placeholder="Theme" />
          </SelectTrigger>
          <SelectContent>
            {READER_THEMES.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canChangeFlow ? (
          <div className="flex items-center gap-1 rounded-full border border-border-base/60 bg-surface-raised-base/70 p-1">
            <Button
              type="button"
              variant={preferences.flow === FLOW_PAGINATED ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                // setPreferences((current) => ({ ...current, flow: FLOW_PAGINATED }))
              }}
            >
              <LayoutPanelLeftIcon className="size-4" />
              Paginated
            </Button>
            <Button
              type="button"
              variant={preferences.flow === FLOW_SCROLLED ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                // setPreferences((current) => ({ ...current, flow: FLOW_SCROLLED }))
              }}
            >
              <ScrollTextIcon className="size-4" />
              Vertical scroll
            </Button>
          </div>
        ) : (
          <div className="flex items-center rounded-full border border-border-base/70 bg-surface-raised-base/80 px-3 text-xs text-text-weak">
            Fixed layout
          </div>
        )}
      </div>
    </header>
  )
}
