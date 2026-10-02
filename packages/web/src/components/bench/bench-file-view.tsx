import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ResizeHandle,
  cn,
} from "@buddy/ui"
import "@/components/prompt/composer-surfaces.css"
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import {
  BookOpenIcon,
  ChevronRightIcon,
  Folder03Icon,
  FolderIcon,
  NotesIcon,
  PresentationIcon,
  StudyLampIcon,
} from "@/icons/app-icons"
import { BenchCollectionChromeContext } from "./bench-collection-chrome"

import * as AppIcons from "@/icons/app-icons"

const CreationIcon = AppIcons["ShapesIcon"]

import { BenchFileBreadcrumbs } from "./bench-file-breadcrumbs"
import type { RightWorkspaceOpenOutcome } from "@/components/directory-chat/right-workspace-open"

type BenchFileTreeControl =
  | { treeOpen: boolean; onTreeOpenChange: (open: boolean) => void; initialTreeOpen?: never }
  | { treeOpen?: never; onTreeOpenChange?: never; initialTreeOpen?: boolean }

/** An in-flow workspace list and preview that retains the mounted Bench surface. */
export type BenchFileViewProps = BenchFileTreeControl & {
  kind?: keyof typeof LIST_PRESENTATION
  directory: string
  path?: string
  /** Display title for a board or resource breadcrumb. */
  title?: string
  drawer: ReactNode
  children?: ReactNode
  toolbar?: ReactNode
  /** Open a notebook-relative file from a breadcrumb folder menu. */
  onOpenFile?: (path: string) => Promise<RightWorkspaceOpenOutcome>
  /** Keep the same content mounted when switching away from the Files view. */
  active?: boolean
  /** Hide the mounted content and show the file selection prompt. */
  showEmpty?: boolean
  suppressLayoutMotion?: boolean
}

// T3's 540px preview panel can devote 256px to its tree. Bench keeps a narrower list
// so the document has most of the available width, including in a compact workspace.
const TREE_DEFAULT_WIDTH = 240
const TREE_PREFERRED_MIN_WIDTH = 160
const TREE_MAX_WIDTH = 320
const TREE_MAX_FRACTION = 0.35
const TREE_KEYBOARD_STEP = 24

const LIST_PRESENTATION = {
  file: {
    icon: FolderIcon,
    openIcon: Folder03Icon,
    rootLabel: "",
    listLabel: "Workspace files",
    toggleLabel: "file tree",
    pathLabel: "File path",
    resizeLabel: "Resize file tree",
    emptyTitle: "Open file",
    emptyDescription: "Select a file from the workspace tree.",
  },
  note: {
    icon: NotesIcon,
    rootLabel: "Notes",
    listLabel: "Notes",
    toggleLabel: "notes",
    pathLabel: "Note path",
    resizeLabel: "Resize notes list",
    emptyTitle: "Open note",
    emptyDescription: "Select a note from the list.",
  },
  board: {
    icon: PresentationIcon,
    rootLabel: "Boards",
    listLabel: "Boards",
    toggleLabel: "boards",
    pathLabel: "Board path",
    resizeLabel: "Resize boards list",
    emptyTitle: "Open board",
    emptyDescription: "Select a board from the list.",
  },
  resource: {
    icon: BookOpenIcon,
    rootLabel: "Resources",
    listLabel: "Resources",
    toggleLabel: "resources",
    pathLabel: "Resource path",
    resizeLabel: "Resize resources list",
    emptyTitle: "Open resource",
    emptyDescription: "Select a resource from the list.",
  },
  practice: {
    icon: StudyLampIcon,
    rootLabel: "Practice",
    listLabel: "Practice",
    toggleLabel: "practice",
    pathLabel: "Exercise path",
    resizeLabel: "Resize practice list",
    emptyTitle: "Open exercise",
    emptyDescription: "Select an exercise from the list.",
  },
  creation: {
    icon: CreationIcon,
    rootLabel: "Creations",
    listLabel: "Creations",
    toggleLabel: "creations",
    pathLabel: "Creation path",
    resizeLabel: "Resize creations list",
    emptyTitle: "Open creation",
    emptyDescription: "Select a creation from the list.",
  },
}

function fileBreadcrumbs(directory: string, path: string | undefined) {
  const root = directory.replace(/\\/g, "/").replace(/\/$/, "")
  const normalizedPath = path?.replace(/\\/g, "/") ?? ""
  const relativePath = normalizedPath.startsWith(`${root}/`)
    ? normalizedPath.slice(root.length + 1)
    : normalizedPath
  return {
    rootName: root.split("/").findLast(Boolean) ?? directory,
    segments: relativePath.split("/").filter(Boolean),
  }
}

/** Displays workspace list controls without remounting its preview when the view changes. */
export function BenchFileView(props: BenchFileViewProps) {
  const presentation = LIST_PRESENTATION[props.kind ?? "file"]
  const ListIcon = presentation.icon
  const active = props.active ?? true
  const showEmpty = props.showEmpty ?? props.children == null
  const [localTreeOpen, setLocalTreeOpen] = useState(props.initialTreeOpen ?? true)
  const treeOpen = active && (props.treeOpen ?? localTreeOpen)
  const toggleLabel = `${treeOpen ? "Hide" : "Show"} ${presentation.toggleLabel}`
  const ToggleIcon = treeOpen && "openIcon" in presentation ? presentation.openIcon : ListIcon
  const [preferredTreeWidth, setPreferredTreeWidth] = useState(TREE_DEFAULT_WIDTH)
  const [containerWidth, setContainerWidth] = useState(0)
  const [resizing, setResizing] = useState(false)
  const [keyboardMotion, setKeyboardMotion] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const wasTreeOpenRef = useRef(treeOpen)
  const treeID = useId()
  const breadcrumbs = fileBreadcrumbs(props.directory, props.path)
  const breadcrumbSegments = props.title ? [props.title] : breadcrumbs.segments
  const maxTreeWidth = Math.min(TREE_MAX_WIDTH, containerWidth * TREE_MAX_FRACTION)
  const minTreeWidth = Math.min(TREE_PREFERRED_MIN_WIDTH, maxTreeWidth)
  const treeWidth = Math.max(minTreeWidth, Math.min(preferredTreeWidth, maxTreeWidth))

  function changeTreeOpen(open: boolean) {
    if (props.onTreeOpenChange) {
      props.onTreeOpenChange(open)
    } else {
      setLocalTreeOpen(open)
    }
  }

  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    const measure = () => setContainerWidth(row.clientWidth)
    measure()
    const SizeObserver = globalThis.ResizeObserver
    if (!SizeObserver) return
    const observer = new SizeObserver(measure)
    observer.observe(row)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const wasOpen = wasTreeOpenRef.current
    wasTreeOpenRef.current = treeOpen
    if (treeOpen && !wasOpen) {
      treeRef.current?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus()
    }
    if (!treeOpen && wasOpen && treeRef.current?.contains(document.activeElement)) {
      toggleRef.current?.focus()
    }
  }, [treeOpen])

  useEffect(() => {
    if (!resizing) return
    const finishResize = () => setResizing(false)
    window.addEventListener("pointerup", finishResize)
    window.addEventListener("pointercancel", finishResize)
    window.addEventListener("blur", finishResize)
    return () => {
      window.removeEventListener("pointerup", finishResize)
      window.removeEventListener("pointercancel", finishResize)
      window.removeEventListener("blur", finishResize)
    }
  }, [resizing])

  return (
    <div
      data-component="bench-file-view"
      className="flex h-full min-h-0 min-w-0 flex-col bg-background-base"
    >
      <div
        hidden={!active}
        className={cn(
          "h-10 shrink-0 items-center gap-2 border-b border-border-weaker-base pr-1.5 pl-3",
          active && "flex",
        )}
      >
        {(props.kind ?? "file") === "file" ? (
          <BenchFileBreadcrumbs
            key={`${props.directory}:${props.path}:${active}`}
            directory={props.directory}
            path={props.path}
            onOpenFile={props.onOpenFile}
          />
        ) : (
          <nav aria-label={presentation.pathLabel} className="min-w-0 flex-1 overflow-hidden">
            <ol className="flex min-w-0 items-center text-xs text-text-weak">
              <li className="max-w-40 shrink-0 truncate rounded-sm px-0.5" title={props.directory}>
                {presentation.rootLabel || breadcrumbs.rootName}
              </li>
              {breadcrumbSegments.map((segment, index) => (
                <li
                  key={breadcrumbSegments.slice(0, index + 1).join("/")}
                  className={cn(
                    "flex min-w-0 items-center",
                    index === breadcrumbSegments.length - 1 && "font-medium text-text-base",
                  )}
                  aria-current={index === breadcrumbSegments.length - 1 ? "page" : undefined}
                >
                  <ChevronRightIcon
                    aria-hidden
                    className="mx-1 size-3.5 shrink-0 text-text-weaker"
                  />
                  <span className="max-w-40 truncate rounded-sm px-0.5" title={segment}>
                    {segment}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <Button
          ref={toggleRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            "composer-grain relative size-7 border border-border-weak-base bg-surface-raised-base-hover text-icon-base shadow-sm hover:border-border-base hover:text-text-strong",
            treeOpen && "border-border-base text-text-strong",
          )}
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={treeOpen}
          aria-controls={treeID}
          onClick={(event) => {
            setKeyboardMotion(event.detail === 0)
            changeTreeOpen(!treeOpen)
          }}
        >
          <ToggleIcon aria-hidden className="size-3.5" />
        </Button>
        {props.toolbar}
      </div>
      <div ref={rowRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            hidden={active && showEmpty}
            className={cn("h-full min-h-0 min-w-0 flex-1", active && showEmpty && "hidden")}
          >
            {/* Always rendered: toggling a wrapper would remount the Bench host and every retained surface. */}
            <BenchCollectionChromeContext.Provider value={active}>
              {props.children}
            </BenchCollectionChromeContext.Provider>
          </div>
          {active && showEmpty && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <ListIcon aria-hidden className="size-8 text-icon-weak-base" />
                </EmptyMedia>
                <EmptyTitle>{presentation.emptyTitle}</EmptyTitle>
                <EmptyDescription>{presentation.emptyDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
        <aside
          ref={treeRef}
          id={treeID}
          aria-label={presentation.listLabel}
          aria-hidden={!treeOpen}
          {...(!treeOpen ? { inert: "" } : {})}
          className={cn(
            "relative flex h-full min-h-0 min-w-0 shrink-0 flex-col",
            treeOpen && "border-l border-border-weaker-base",
            !resizing &&
              !keyboardMotion &&
              !props.suppressLayoutMotion &&
              "transition-[width] duration-150 ease-out motion-reduce:transition-none",
          )}
          style={{ width: treeOpen ? treeWidth : 0, maxWidth: "35%" }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || event.defaultPrevented) return
            event.preventDefault()
            event.stopPropagation()
            setKeyboardMotion(true)
            toggleRef.current?.focus()
            changeTreeOpen(false)
          }}
        >
          {treeOpen && (
            <ResizeHandle
              direction="horizontal"
              edge="start"
              size={treeWidth}
              min={minTreeWidth}
              max={maxTreeWidth}
              onResize={setPreferredTreeWidth}
              onPointerDown={(event) => {
                if (event.button === 0) setResizing(true)
              }}
              onLostPointerCapture={() => setResizing(false)}
              role="separator"
              tabIndex={0}
              aria-label={presentation.resizeLabel}
              aria-orientation="vertical"
              aria-valuemin={Math.round(minTreeWidth)}
              aria-valuemax={Math.round(maxTreeWidth)}
              aria-valuenow={Math.round(treeWidth)}
              aria-controls={treeID}
              onKeyDown={(event) => {
                let nextWidth: number
                if (event.key === "ArrowLeft") nextWidth = treeWidth + TREE_KEYBOARD_STEP
                else if (event.key === "ArrowRight") nextWidth = treeWidth - TREE_KEYBOARD_STEP
                else if (event.key === "Home") nextWidth = minTreeWidth
                else if (event.key === "End") nextWidth = maxTreeWidth
                else return
                event.preventDefault()
                setKeyboardMotion(true)
                setPreferredTreeWidth(Math.max(minTreeWidth, Math.min(nextWidth, maxTreeWidth)))
              }}
            />
          )}
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">{props.drawer}</div>
        </aside>
      </div>
    </div>
  )
}
