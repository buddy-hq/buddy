import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ScrollArea,
  cn,
  // Icons from @buddy/ui
  BookOpenIcon,
  PinIcon,
  SettingsIcon,
} from "@buddy/ui"
import { MapIcon, SearchIcon, PencilLineIcon, InfoIcon } from "lucide-react"
import {
  DEFAULT_AUTHOR,
  DEFAULT_TITLE,
  SIDEBAR_CONTENTS,
  SIDEBAR_SEARCH,
  SIDEBAR_BOOKMARKS,
  SIDEBAR_ANNOTATIONS,
  SIDEBAR_DETAILS,
  SIDEBAR_PREFERENCES,
} from "../foliate-reader-constants"
import { toPercentLabel } from "../utils/foliate-formatters"
import type {
  FoliateReaderLocation,
  FoliateReaderSnapshot,
  FoliateReaderSource,
} from "../foliate-reader-types"
import { getSourceName } from "../utils/foliate-helpers"
import { FoliateTocTree } from "./foliate-toc-tree"
import { FoliateMetadataPanel } from "./foliate-metadata-panel"
import { FoliateSearchPanel } from "./foliate-search-panel"
import { FoliateBookmarksPanel } from "./foliate-bookmarks-panel"
import { FoliateAnnotationsPanel } from "./foliate-annotations-panel"
import { FoliatePreferencesPanel } from "./foliate-preferences-panel"
import { isFoliateSidebarTab } from "../utils/foliate-helpers"

export interface FoliateSidebarProps {
  sidebarOpen: boolean
  sidebarTab: string
  setSidebarTab: (tab: string) => void
  snapshot: FoliateReaderSnapshot | null
  location: FoliateReaderLocation
  source: FoliateReaderSource | null
  // Search panel props
  searchState: any
  onQueryChange: (query: string) => void
  onRunSearch: () => void
  onCycleResults: (direction: 1 | -1) => void
  onScopeChange: (scope: string) => void
  onMatchCaseChange: (matchCase: boolean) => void
  onMatchWholeWordsChange: (matchWholeWords: boolean) => void
  onMatchDiacriticsChange: (matchDiacritics: boolean) => void
  onShowResult: (cfi: string) => void
  searchInputRef: React.RefObject<HTMLInputElement>
  searchViewportRef: React.RefObject<HTMLDivElement>
  status: "idle" | "loading" | "ready" | "error"
  // Bookmarks panel props
  bookmarks: any[]
  currentBookmark: any
  onToggleBookmark: () => void
  onGoToBookmark: (value: string) => void
  onDeleteBookmark: (value: string) => void
  bookmarkViewportRef: React.RefObject<HTMLDivElement>
  // Annotations panel props
  annotations: any[]
  onShowAnnotation: (annotation: any) => void
  onOpenAnnotationDialog: (annotation: any) => void
  onDeleteAnnotation: (value: string) => void
  annotationViewportRef: React.RefObject<HTMLDivElement>
  // Preferences panel props
  preferences: any
  setPreferences: any
  canChangeFlow: boolean
  onGoToTocItem: (href: string) => void
  isReaderSearchScope: (value: string) => value is any
}

export function FoliateSidebar({
  sidebarOpen,
  sidebarTab,
  setSidebarTab,
  snapshot,
  location,
  source,
  searchState,
  onQueryChange,
  onRunSearch,
  onCycleResults,
  onScopeChange,
  onMatchCaseChange,
  onMatchWholeWordsChange,
  onMatchDiacriticsChange,
  onShowResult,
  searchInputRef,
  searchViewportRef,
  status,
  bookmarks,
  currentBookmark,
  onToggleBookmark,
  onGoToBookmark,
  onDeleteBookmark,
  bookmarkViewportRef,
  annotations,
  onShowAnnotation,
  onOpenAnnotationDialog,
  onDeleteAnnotation,
  annotationViewportRef,
  preferences,
  setPreferences,
  canChangeFlow,
  onGoToTocItem,
  isReaderSearchScope,
}: FoliateSidebarProps) {
  if (!sidebarOpen) return null

  const title = snapshot?.title ?? (source ? getSourceName(source) : undefined) ?? DEFAULT_TITLE
  const author = snapshot?.author ?? DEFAULT_AUTHOR
  const progress = toPercentLabel(location.fraction) ?? "0%"

  const tabs = [
    { value: SIDEBAR_CONTENTS, label: "Contents", icon: MapIcon },
    { value: SIDEBAR_SEARCH, label: "Search", icon: SearchIcon },
    { value: SIDEBAR_BOOKMARKS, label: "Bookmarks", icon: PinIcon },
    { value: SIDEBAR_ANNOTATIONS, label: "Notes", icon: PencilLineIcon },
    { value: SIDEBAR_DETAILS, label: "Details", icon: InfoIcon },
    { value: SIDEBAR_PREFERENCES, label: "Preferences", icon: SettingsIcon },
  ]

  return (
    <aside className="flex min-h-0 flex-col border-b border-border-base/50 bg-surface-base lg:border-b-0 lg:border-r">
      <Tabs
        value={sidebarTab}
        onValueChange={(nextValue) => {
          if (isFoliateSidebarTab(nextValue)) setSidebarTab(nextValue)
        }}
        className="flex h-full min-h-0 flex-col"
      >
        {/* Book identity block */}
        <div className="border-b border-border-base/40 px-4 py-4">
          <div className="flex items-center gap-3">
            {snapshot?.coverUrl ? (
              <img
                src={snapshot.coverUrl}
                alt={`${title} cover`}
                className="h-14 w-10 shrink-0 rounded-sm object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-sm border border-border-base/50 bg-surface-weak/50 text-text-weaker">
                <BookOpenIcon className="size-3.5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold leading-snug text-text-strong">
                {title}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-text-weaker">{author}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-0.5 flex-1 rounded-full bg-border-base/40">
                  <div
                    className="h-full rounded-full bg-text-interactive-base/70 transition-[width] duration-500"
                    style={{ width: progress }}
                  />
                </div>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-weaker">
                  {progress}
                </span>
              </div>
            </div>
          </div>

          {location.tocLabel ? (
            <div className="mt-3 truncate text-[11px] text-text-weaker">
              <span className="text-text-weaker/60">Now reading</span>{" "}
              <span className="text-text-weak">{location.tocLabel}</span>
            </div>
          ) : null}
        </div>

        {/* Tab strip — horizontal icon+label */}
        <TabsList className="grid h-auto w-full shrink-0 grid-cols-6 gap-0 rounded-none border-b border-border-base/40 bg-transparent p-0">
          {tabs.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "flex h-10 flex-col items-center justify-center gap-0.5 rounded-none border-b-2 border-transparent py-1 text-[10px] text-text-weaker transition-colors",
                "data-[state=active]:border-text-interactive-base data-[state=active]:bg-transparent data-[state=active]:text-text-interactive-base",
                "hover:bg-surface-weak/50 hover:text-text-weak",
              )}
            >
              <Icon className="size-3.5" />
              <span className="leading-none">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab content panels */}
        <TabsContent value={SIDEBAR_CONTENTS} className="min-h-0 flex-1">
          <ScrollArea className="h-full px-3 py-3">
            {snapshot?.toc?.length ? (
              <FoliateTocTree
                items={snapshot.toc}
                activeLabel={location.tocLabel}
                onSelect={onGoToTocItem}
              />
            ) : (
              <p className="px-1 py-4 text-[12px] text-text-weaker">
                This publication does not expose a table of contents.
              </p>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value={SIDEBAR_SEARCH} className="min-h-0 flex-1">
          <FoliateSearchPanel
            searchState={searchState}
            onQueryChange={onQueryChange}
            onRunSearch={onRunSearch}
            onCycleResults={onCycleResults}
            onScopeChange={onScopeChange}
            onMatchCaseChange={onMatchCaseChange}
            onMatchWholeWordsChange={onMatchWholeWordsChange}
            onMatchDiacriticsChange={onMatchDiacriticsChange}
            onShowResult={onShowResult}
            searchInputRef={searchInputRef}
            searchViewportRef={searchViewportRef}
            status={status}
            isReaderSearchScope={isReaderSearchScope}
          />
        </TabsContent>

        <TabsContent value={SIDEBAR_BOOKMARKS} className="min-h-0 flex-1">
          <FoliateBookmarksPanel
            bookmarks={bookmarks}
            currentBookmark={currentBookmark}
            onToggleBookmark={onToggleBookmark}
            onGoToBookmark={onGoToBookmark}
            onDeleteBookmark={onDeleteBookmark}
            bookmarkViewportRef={bookmarkViewportRef}
          />
        </TabsContent>

        <TabsContent value={SIDEBAR_ANNOTATIONS} className="min-h-0 flex-1">
          <FoliateAnnotationsPanel
            annotations={annotations}
            onShowAnnotation={onShowAnnotation}
            onOpenAnnotationDialog={onOpenAnnotationDialog}
            onDeleteAnnotation={onDeleteAnnotation}
            annotationViewportRef={annotationViewportRef}
          />
        </TabsContent>

        <TabsContent value={SIDEBAR_DETAILS} className="min-h-0 flex-1">
          <ScrollArea className="h-full px-3 py-4">
            <FoliateMetadataPanel snapshot={snapshot} />
          </ScrollArea>
        </TabsContent>

        <TabsContent value={SIDEBAR_PREFERENCES} className="min-h-0 flex-1">
          <FoliatePreferencesPanel
            preferences={preferences}
            setPreferences={setPreferences}
            canChangeFlow={canChangeFlow}
          />
        </TabsContent>
      </Tabs>
    </aside>
  )
}
