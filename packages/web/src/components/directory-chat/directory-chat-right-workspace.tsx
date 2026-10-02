import {
  Fragment,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import { useQuery } from "@tanstack/react-query"
import { Button, Input, Separator, cn, toast } from "@buddy/ui"
import { usePlatform } from "@/context/platform"
import {
  Books02Icon,
  BoxesIcon,
  FolderIcon,
  NotesIcon,
  PresentationIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  StudyLampIcon,
} from "@/icons/app-icons"
import * as AppIcons from "@/icons/app-icons"
import obsidianIconUrl from "@/assets/obsidian-icon.svg"
import "@/components/directory-chat/note-capture-signal.css"
import { useNoteCaptureSignal } from "@/features/notes/capture-activity"
import { language } from "@/context/language"
import type { SessionInfo } from "@/state/chat-types"
import {
  resolveRightWorkspaceOpenOutcome,
  rightWorkspaceOpenSettled,
  useRightWorkspaceOpen,
  type RightWorkspaceOpenOutcome,
  type RightWorkspaceOpenRequest,
  type RightWorkspaceResourceTarget,
} from "./right-workspace-open"
import { ProjectFileExplorerPanel } from "@/components/project-explorer/project-file-explorer-panel"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_WORKSPACE_ROOT_NOTEBOOK,
  benchTargetKey,
  resolveBenchSurfaceDefaults,
  useOpenBench,
  type BenchOpenPolicyState,
  type OpenBenchResult,
} from "@/lib/bench-navigation"
import { useDirectoryWorkspace } from "@/components/directory-chat/directory-workspace-context"
import { ensureNotebookAgentsMd } from "@/lib/ensure-notebook-agents-md"
import {
  RIGHT_WORKSPACE_RAIL_WIDTH_PX,
  resolveRightWorkspaceSelectorDrawerWidth,
} from "@/lib/directory-chat/right-workspace-layout"
import {
  BENCH_ROUTE_STATUS_OPEN,
  WORKSPACE_DRAWER_NOTES,
  WORKSPACE_DRAWER_NONE,
  workspacePresentationSlotForChat,
  type DrawerKind,
} from "@/state/directory-workspace-store"
import { useBenchEmptyTabDrafts } from "@/state/bench-empty-tab-drafts"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import {
  workspaceCollectionForDrawer,
  workspaceCollectionForTarget,
  type WorkspaceCollection,
  type WorkspacePresentation,
} from "@/lib/directory-chat/workspace-presentation"
import { showWorkspaceDrawer } from "./show-workspace-drawer"
import { useUiPreferences } from "@/state/ui-preferences"
import { CreationsDrawer, PracticeDrawer, SourcesDrawer } from "./right-workspace-catalog-drawers"
import { RightWorkspaceBoardsDrawer } from "./right-workspace-boards-drawer"
import { RightWorkspaceSkillsDrawer } from "./right-workspace-skills-drawer"
import { NotesDrawer } from "@/features/notes/notes-drawer"
import { notesLibraryQueryOptions } from "@/features/notes/queries"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { stringifyError } from "@/lib/api-client"
import { useWorkspaceFileOpen } from "@/lib/use-workspace-file-open"
import { readWorkspaceFileRawMetadata } from "@/lib/workspace-file-media"
import { absoluteWorkspaceFilePath, fileNameFromPath } from "@/lib/workspace-file-paths"
import { obsidianVaultProfileQueryOptions } from "@/state/obsidian-vault-query"
import { BenchTabs } from "@/components/bench/bench-tabs"
import { BenchEmptyState } from "@/components/bench/bench-empty-state"
import { BenchFileView, type BenchFileViewProps } from "@/components/bench/bench-file-view"
import { WorkspaceFileActionsMenu } from "@/components/files/workspace-file-actions"
import { workspaceObjectsQueryOptions } from "@/state/workspace-objects-query"
import type { BenchTab } from "@/lib/bench-tabs"

const FigureGlyph = AppIcons["ShapesIcon"]

type DirectoryChatRightWorkspaceProps = {
  directory: string
  sessionID?: string
  sessions: SessionInfo[]
  workspaceWidth: number
  suppressDrawerMotion?: boolean
  onCreateCreation: () => void
  onNewBoard: () => Promise<void>
  onNewNote: () => Promise<void>
  onOpenThread: (sessionID: string) => Promise<boolean>
  onOpenResource: (
    directory: string,
    resource: RightWorkspaceResourceTarget,
  ) => Promise<OpenBenchResult> | void
  tabs: readonly BenchTab[]
  activeTabKey: string | null
  onActivateTab: (tabKey: string) => void
  onCloseTab: (tabKey: string) => void
  onCloseOtherTabs: (tabKey: string) => void
  onCloseTabsToRight: (tabKey: string) => void
  onCloseAllTabs: () => void
  onNewTab: () => void
  /** New tabs, shown after the item tabs. */
  emptyTabIDs?: readonly string[]
  /** The New tab the empty page shows. */
  activeEmptyTabID?: string | null
  selectedEmptyTabID?: string | null
  onActivateEmptyTab?: (emptyTabID: string) => void
  onCloseEmptyTab?: (emptyTabID: string) => void
  showTabsInWorkspace?: boolean
  bench?: ReactNode
  presentation: Pick<
    WorkspacePresentation,
    | "benchTarget"
    | "benchVisible"
    | "kind"
    | "mode"
    | "retainedBenchTarget"
    | "selector"
    | "workspaceOpen"
  >
}

type RightWorkspaceRailItem = {
  id: string
  label: string
  icon: ReactNode
  active?: boolean
  disabled?: boolean
  separatorBefore?: boolean
  /** Bumping this flashes the button once: something landed behind it. */
  attention?: number
  onClick: () => void
}

const CLOSED_BENCH_POLICY_STATE = {
  status: "closed",
} satisfies BenchOpenPolicyState

type RightWorkspaceFilesPresentation = {
  title: string
  variant: "default" | "obsidian"
}

export function resolveRightWorkspaceFilesPresentation(input: {
  directory: string
  obsidianConnected: boolean
}): RightWorkspaceFilesPresentation {
  return {
    title: getFilename(input.directory),
    variant: input.obsidianConnected ? "obsidian" : "default",
  }
}

const RIGHT_RAIL_ICON_SIZE_CLASS = "size-3.5 shrink-0"
const RAIL_ATTENTION_DURATION_MS = 700
const BENCH_BODY_CORNER_RADIUS_MACOS_PX = 12
const BENCH_BODY_CORNER_RADIUS_WINDOWS_PX = 6
const BENCH_BODY_CORNER_RADIUS_DEFAULT_PX = 8

function railIcon(icon: ReactElement<{ className?: string }>) {
  return cloneElement(icon, {
    className: cn(RIGHT_RAIL_ICON_SIZE_CLASS, icon.props.className),
  })
}

function ObsidianRailIcon(props: { className?: string }) {
  return (
    <img
      src={obsidianIconUrl}
      alt=""
      aria-hidden
      data-component="right-workspace-obsidian-icon"
      className={cn("object-contain", props.className)}
    />
  )
}

function RightWorkspaceRailButton(props: RightWorkspaceRailItem) {
  const icon = isValidElement<{ className?: string }>(props.icon)
    ? railIcon(props.icon)
    : props.icon
  const attention = props.attention
  const [flashing, setFlashing] = useState(false)

  useEffect(() => {
    if (!attention) return
    setFlashing(true)
    const timeout = window.setTimeout(() => setFlashing(false), RAIL_ATTENTION_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [attention])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      data-attention={flashing ? "true" : undefined}
      className={cn(
        "right-workspace-rail-button relative text-icon-base hover:text-text-strong",
        props.active &&
          "composer-surface-tab composer-grain [--composer-surface-bg:var(--bench-active-bg)] text-text-strong",
      )}
      onClick={props.onClick}
    >
      {icon}
    </Button>
  )
}

/** The rail names its buttons for assistive tech only — no hover tooltips. */
function RightWorkspaceRail(props: { items: RightWorkspaceRailItem[] }) {
  return (
    <div
      data-component="right-workspace-rail"
      className="flex h-full shrink-0 flex-col items-center gap-1 px-1 py-2"
      style={{ width: RIGHT_WORKSPACE_RAIL_WIDTH_PX }}
    >
      {props.items.map((item) => (
        <Fragment key={item.id}>
          {item.separatorBefore ? <Separator className="my-1 w-5" /> : null}
          <RightWorkspaceRailButton {...item} />
        </Fragment>
      ))}
    </div>
  )
}

export function DirectoryChatRightWorkspaceContent(props: {
  hasBenchTarget: boolean
  activeTabKey?: string | null
  activeTargetKey?: string | null
  bench?: ReactNode
  selectorContent: ReactNode
  emptyContent?: ReactNode
  selectorDrawerWidth: number
  suppressDrawerMotion?: boolean
  fileView?: Omit<BenchFileViewProps, "children" | "toolbar">
}) {
  // The Bench container is always rendered in the same position and hidden when there is no target.
  // Moving it into a conditional branch unmounts BenchSurfaceHost — and every surface it is keeping
  // alive — on every chat transition, because the projection reports a closed Bench mid-switch.
  const benchVisible = props.hasBenchTarget && Boolean(props.bench)
  const fileViewVisible = props.fileView?.active === true
  const noteLibrary = useQuery({
    ...notesLibraryQueryOptions(props.fileView?.directory ?? ""),
    enabled: fileViewVisible && props.fileView?.kind === "note" && !!props.fileView.path,
  })
  const noteStorageDirectory =
    props.fileView?.kind === "note" ? noteLibrary.data?.directory : undefined

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        data-component="right-workspace-bench-target"
        data-bench-visible={benchVisible ? "true" : "false"}
        data-bench-tab-key={props.activeTabKey ?? undefined}
        data-bench-target-key={props.activeTargetKey ?? undefined}
        className={cn(
          "isolate h-full min-h-0 min-w-0 flex-1 bg-background-base",
          !benchVisible && !fileViewVisible && "hidden",
        )}
      >
        <BenchFileView
          directory={props.fileView?.directory ?? ""}
          drawer={props.fileView?.drawer ?? null}
          active={fileViewVisible}
          showEmpty={props.fileView?.showEmpty ?? false}
          path={props.fileView?.path}
          kind={props.fileView?.kind}
          title={props.fileView?.title}
          onOpenFile={props.fileView?.onOpenFile}
          treeOpen={props.fileView?.treeOpen ?? false}
          onTreeOpenChange={props.fileView?.onTreeOpenChange ?? (() => undefined)}
          suppressLayoutMotion={props.suppressDrawerMotion}
          toolbar={
            props.fileView?.kind === "file" && props.fileView?.path ? (
              <WorkspaceFileActionsMenu
                directory={props.fileView.directory}
                path={props.fileView.path}
              />
            ) : noteStorageDirectory && props.fileView?.path ? (
              <WorkspaceFileActionsMenu
                directory={noteStorageDirectory}
                path={props.fileView.path}
              />
            ) : null
          }
        >
          {props.bench}
        </BenchFileView>
      </div>
      {benchVisible || fileViewVisible ? null : props.selectorContent ? (
        <div data-component="right-workspace-selector-content" className="min-h-0 min-w-0 flex-1">
          {props.selectorContent}
        </div>
      ) : (
        <div
          data-component="right-workspace-empty-bench-surface"
          className="min-h-0 min-w-0 flex-1 bg-background-base"
        >
          {props.emptyContent}
        </div>
      )}

      {props.hasBenchTarget && props.selectorContent ? (
        <aside
          data-component="right-workspace-selector-drawer"
          className={cn(
            "absolute inset-y-0 right-0 z-10 h-full min-h-0 max-w-full border-l border-border-weaker-base bg-background-base shadow-xl",
            !props.suppressDrawerMotion && "animate-in fade-in slide-in-from-right-3 duration-150",
          )}
          style={{ width: props.selectorDrawerWidth }}
        >
          {props.selectorContent}
        </aside>
      ) : null}
    </div>
  )
}

export function DirectoryChatRightWorkspace(props: DirectoryChatRightWorkspaceProps) {
  const [openingInstructions, setOpeningInstructions] = useState(false)
  const [fileSearch, setFileSearch] = useState("")
  const [fileRefreshRequest, setFileRefreshRequest] = useState(0)
  // Hiding a section's list is a personal preference, so it outlives restarts and is shared by notebooks.
  const collapsedLists = useUiPreferences((state) => state.collapsedWorkspaceLists)
  const setWorkspaceListOpen = useUiPreferences((state) => state.setWorkspaceListOpen)
  const openBenchRoute = useOpenBench()
  // Opens from the empty page and the collection chrome keep the layout they were made in.
  const openWorkspaceTarget = useRightWorkspaceOpen({ mode: props.presentation.mode })
  const platform = usePlatform()
  const { executePrimary: openWorkspaceFile } = useWorkspaceFileOpen(
    props.directory,
    props.onOpenResource,
    { benchMode: props.presentation.mode },
  )
  const workspace = useDirectoryWorkspace()
  const selectorAccessEnabled = props.presentation.mode !== BENCH_CHAT_LAYOUT_FLOATING
  const bodyCornerRadiusPx =
    platform.os === "macos"
      ? BENCH_BODY_CORNER_RADIUS_MACOS_PX
      : platform.os === "windows"
        ? BENCH_BODY_CORNER_RADIUS_WINDOWS_PX
        : BENCH_BODY_CORNER_RADIUS_DEFAULT_PX
  const obsidianProfileQuery = useQuery(obsidianVaultProfileQueryOptions(props.directory))
  const obsidianConnected = obsidianProfileQuery.data?.connected === true
  const filesPresentation = resolveRightWorkspaceFilesPresentation({
    directory: props.directory,
    obsidianConnected,
  })

  const benchPolicyState = useMemo(
    () =>
      props.presentation.benchTarget
        ? {
            status: BENCH_ROUTE_STATUS_OPEN,
            directory: props.directory,
            target: props.presentation.benchTarget,
            mode: props.presentation.mode,
            layoutProfile: resolveBenchSurfaceDefaults(props.presentation.benchTarget)
              .layoutProfile,
          }
        : CLOSED_BENCH_POLICY_STATE,
    [props.directory, props.presentation.benchTarget, props.presentation.mode],
  )
  const isInstructionsRoute =
    benchPolicyState.status === "open" &&
    benchPolicyState.target.type === "workspace-file" &&
    benchPolicyState.target.path === "AGENTS.md"
  const hasBenchTarget = props.presentation.retainedBenchTarget
  const hasVisibleBench = props.presentation.benchVisible && props.presentation.workspaceOpen
  const resolvedSelector = props.presentation.selector
  const fileTarget =
    hasVisibleBench && props.presentation.benchTarget?.type === "workspace-file"
      ? props.presentation.benchTarget
      : undefined
  const visibleTarget = hasVisibleBench ? props.presentation.benchTarget : null
  const targetCollection = workspaceCollectionForTarget(visibleTarget)
  const activeCollection =
    workspaceCollectionForDrawer(resolvedSelector) ?? (resolvedSelector ? null : targetCollection)
  const fileViewKind =
    activeCollection === "notes"
      ? "note"
      : activeCollection === "sources"
        ? "resource"
        : activeCollection === "boards"
          ? "board"
          : activeCollection === "practice"
            ? "practice"
            : activeCollection === "creations"
              ? "creation"
              : "file"
  // Immersive has no rail, but an item still gets the same breadcrumbs, list toggle, and actions.
  const fileViewActive = activeCollection !== null
  const fileViewHasTarget = activeCollection !== null && activeCollection === targetCollection
  const treeOpen = activeCollection !== null && collapsedLists[activeCollection] !== true
  const selectedObjectID =
    fileViewHasTarget && visibleTarget?.type === "object" ? visibleTarget.ref.objectID : undefined
  const objectsQuery = useQuery({
    ...workspaceObjectsQueryOptions(props.directory),
    enabled: selectedObjectID !== undefined,
  })
  const selectedTitle = selectedObjectID
    ? objectsQuery.data?.objects.find((object) => object.objectID === selectedObjectID)?.title
    : undefined
  function setCollectionListOpen(open: boolean) {
    if (!activeCollection) return
    setWorkspaceListOpen(activeCollection, open)
  }
  const selectorDrawerWidth =
    resolvedSelector === null
      ? 0
      : resolveRightWorkspaceSelectorDrawerWidth({
          selector: resolvedSelector,
          workspaceWidthPx: props.workspaceWidth,
        })

  useEffect(() => {
    logBenchToggleStep("directory-chat-right-workspace-state", {
      directory: props.directory,
      sessionID: props.sessionID,
      workspaceOpen: props.presentation.workspaceOpen,
      workspaceWidth: props.workspaceWidth,
      hasBenchTarget,
      hasVisibleBench,
      benchPolicyState,
      resolvedSelector,
      selectorDrawerWidth,
      presentationKind: props.presentation.kind,
    })
  }, [
    benchPolicyState,
    hasBenchTarget,
    hasVisibleBench,
    props.directory,
    props.presentation.kind,
    props.presentation.workspaceOpen,
    props.sessionID,
    props.workspaceWidth,
    resolvedSelector,
    selectorDrawerWidth,
  ])

  const closeSelector = useCallback(() => {
    logBenchToggleStep("directory-chat-right-workspace-close-selector", {
      directory: props.directory,
      resolvedSelector,
      workspaceOpen: props.presentation.workspaceOpen,
    })
    void workspace.controller.execute({ type: "close-drawer" })
  }, [props.directory, props.presentation.workspaceOpen, resolvedSelector, workspace.controller])

  const restoreFilesSelector = useCallback(() => {
    logBenchToggleStep("directory-chat-right-workspace-restore-files-selector", {
      directory: props.directory,
      resolvedSelector,
      workspaceOpen: props.presentation.workspaceOpen,
    })
    void workspace.controller.execute({ type: "open-drawer", drawer: "files" })
  }, [props.directory, props.presentation.workspaceOpen, resolvedSelector, workspace.controller])

  function openSelector(selector: DrawerKind) {
    logBenchToggleStep("directory-chat-right-workspace-open-selector", {
      directory: props.directory,
      selector,
      resolvedSelector,
      hasVisibleBench,
      workspaceOpen: props.presentation.workspaceOpen,
    })
    const collection = workspaceCollectionForDrawer(selector)
    if (collection && collection === activeCollection && fileViewHasTarget) {
      setWorkspaceListOpen(collection, !treeOpen)
      return
    }
    if (collection) {
      if (resolvedSelector === selector) {
        if (collapsedLists[collection] === true) {
          setWorkspaceListOpen(collection, true)
          return
        }
        void workspace.controller.execute({ type: "close-drawer" })
        return
      }
    } else if (resolvedSelector === selector) {
      void workspace.controller.execute({ type: "close-drawer" })
      return
    }
    showWorkspaceDrawer(workspace.controller, selector)
  }

  const openWorkspaceRequest = useCallback(
    async (request: RightWorkspaceOpenRequest): Promise<RightWorkspaceOpenOutcome> => {
      // Reopening the object already on the Bench keeps its current view rather
      // than snapping back to the kind's default one.
      const resolvedRequest =
        request.type === "object" &&
        benchPolicyState.status === "open" &&
        benchPolicyState.target.type === "object" &&
        request.target.type === "object" &&
        benchPolicyState.target.ref.objectID === request.target.ref.objectID
          ? { ...request, target: benchPolicyState.target }
          : request
      const outcome = await openWorkspaceTarget(resolvedRequest)
      if (rightWorkspaceOpenSettled(outcome)) closeSelector()
      return outcome
    },
    [benchPolicyState, closeSelector, openWorkspaceTarget],
  )

  /** An item opened from a New tab takes that tab's place, as in a browser. */
  async function replacingShownEmptyTab<TResult>(open: () => Promise<TResult>): Promise<TResult> {
    const emptyTabID = props.activeEmptyTabID
    const result = await open()
    const state = workspace.store.getState()
    const route = workspacePresentationSlotForChat(state.slots, state.activeChatKey).route
    if (emptyTabID && route.status === BENCH_ROUTE_STATUS_OPEN) {
      state.removeEmptyTab(emptyTabID)
      useBenchEmptyTabDrafts.getState().removeDraft(emptyTabID)
    }
    return result
  }

  const openBreadcrumbFile = useCallback(
    async (path: string): Promise<RightWorkspaceOpenOutcome> => {
      try {
        const metadata = await readWorkspaceFileRawMetadata({ directory: props.directory, path })
        const opened = await openWorkspaceFile({
          path,
          absolutePath: absoluteWorkspaceFilePath({ directory: props.directory, path }),
          name: fileNameFromPath(path),
          available: true,
          canOpenInBuddy: true,
          canOpenDefaultApp: platform.openPath !== undefined,
          canReveal: platform.revealPath !== undefined,
          mimeType: metadata.mimeType,
          sizeBytes: metadata.sizeBytes,
        })
        if (opened) closeSelector()
        return opened ? "opened" : "blocked"
      } catch (error) {
        toast.error(stringifyError(error))
        return "failed"
      }
    },
    [closeSelector, openWorkspaceFile, platform.openPath, platform.revealPath, props.directory],
  )

  async function openInstructions() {
    if (openingInstructions) return
    setOpeningInstructions(true)
    try {
      await ensureNotebookAgentsMd(props.directory)
      const outcome = resolveRightWorkspaceOpenOutcome(
        await openBenchRoute({
          directory: props.directory,
          target: {
            type: "workspace-file",
            root: BENCH_WORKSPACE_ROOT_NOTEBOOK,
            path: "AGENTS.md",
            viewer: "markdown",
          },
          mode: BENCH_CHAT_LAYOUT_DOCKED,
          autoOpen: null,
        }),
      )
      if (outcome === "opened" || outcome === "focused") closeSelector()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setOpeningInstructions(false)
    }
  }

  const selectorContent =
    selectorAccessEnabled && resolvedSelector === "skills" ? (
      <RightWorkspaceSkillsDrawer directory={props.directory} />
    ) : null

  const fileViewDrawer =
    !fileViewActive || !treeOpen ? null : activeCollection === "sources" ? (
      <SourcesDrawer
        compact
        directory={props.directory}
        onOpen={openWorkspaceRequest}
        selectedObjectID={selectedObjectID}
      />
    ) : activeCollection === "boards" ? (
      <RightWorkspaceBoardsDrawer
        compact
        directory={props.directory}
        onOpen={openWorkspaceRequest}
        selectedObjectID={selectedObjectID}
      />
    ) : activeCollection === "practice" ? (
      <PracticeDrawer
        compact
        directory={props.directory}
        onOpen={openWorkspaceRequest}
        selectedObjectID={selectedObjectID}
      />
    ) : activeCollection === "creations" ? (
      <CreationsDrawer
        compact
        directory={props.directory}
        onOpen={openWorkspaceRequest}
        selectedObjectID={selectedObjectID}
        onCreate={props.onCreateCreation}
      />
    ) : fileViewKind === "note" ? (
      <NotesDrawer
        directory={props.directory}
        onOpen={openWorkspaceRequest}
        selectedNote={
          fileViewHasTarget && fileTarget ? { path: fileTarget.path, id: fileTarget.id } : undefined
        }
      />
    ) : (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-1 p-2">
          <Input
            type="search"
            aria-label="Filter files"
            placeholder="Filter files…"
            value={fileSearch}
            onChange={(event) => setFileSearch(event.currentTarget.value)}
            className="h-8"
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh files"
            onClick={() => setFileRefreshRequest((current) => current + 1)}
          >
            <RefreshCwIcon aria-hidden />
          </Button>
        </div>
        <ProjectFileExplorerPanel
          directory={props.directory}
          mode="selector"
          benchMode={BENCH_CHAT_LAYOUT_DOCKED}
          className="h-full min-h-0"
          searchValue={fileSearch}
          showHeader={false}
          refreshRequest={fileRefreshRequest}
          variant={filesPresentation.variant}
          selectedPath={fileViewHasTarget ? fileTarget?.path : undefined}
          onFileOpenBlocked={restoreFilesSelector}
          onSelectFile={closeSelector}
          onOpenResource={(directory, resource) => {
            const pendingDecision = props.onOpenResource(directory, resource)
            if (!pendingDecision) return
            return pendingDecision.then((decision) => {
              const outcome = resolveRightWorkspaceOpenOutcome(decision)
              if (outcome === "opened" || outcome === "focused") {
                closeSelector()
              }
              return decision
            })
          }}
        />
      </div>
    )

  const noteCaptureSignal = useNoteCaptureSignal(props.directory)
  const sectionPanelShowing = treeOpen || !fileViewHasTarget
  const isRailCollectionActive = (collection: WorkspaceCollection) =>
    activeCollection === collection && sectionPanelShowing
  const railItems: RightWorkspaceRailItem[] = [
    {
      id: "sources",
      label: "Sources",
      icon: <Books02Icon />,
      active: isRailCollectionActive("sources"),
      onClick: () => openSelector("sources"),
    },
    {
      id: "practice",
      label: "Practice",
      icon: <StudyLampIcon />,
      active: isRailCollectionActive("practice"),
      onClick: () => openSelector("practice"),
    },
    {
      id: "creations",
      label: "Creations",
      icon: <FigureGlyph />,
      active: isRailCollectionActive("creations"),
      onClick: () => openSelector("creations"),
    },
    {
      id: "boards",
      label: "Boards",
      icon: <PresentationIcon />,
      active: isRailCollectionActive("boards"),
      onClick: () => openSelector("boards"),
    },
    {
      id: "files",
      label: "Files",
      icon: obsidianConnected ? <ObsidianRailIcon /> : <FolderIcon />,
      active: isRailCollectionActive("files"),
      onClick: () => openSelector("files"),
    },
    Object.assign(
      {
        id: WORKSPACE_DRAWER_NOTES,
        label: language.t("notes.library.title"),
        icon: <NotesIcon />,
        active: isRailCollectionActive("notes"),
        onClick: () => openSelector(WORKSPACE_DRAWER_NOTES),
      },
      // The drawer already shows the note landing, and the icon reads as selected
      // while it is open, so a flash there would say nothing.
      noteCaptureSignal && resolvedSelector !== WORKSPACE_DRAWER_NOTES
        ? { attention: noteCaptureSignal.nonce }
        : undefined,
    ),
    {
      id: "skills",
      label: "Skills",
      icon: <BoxesIcon />,
      active: resolvedSelector === "skills",
      separatorBefore: true,
      onClick: () => openSelector("skills"),
    },
    {
      id: "instructions",
      label: "Notebook Instructions",
      icon: <ScrollTextIcon />,
      active: isInstructionsRoute && resolvedSelector === null,
      disabled: openingInstructions,
      onClick: () => void openInstructions(),
    },
  ]

  return (
    <section
      data-component="directory-chat-right-workspace"
      data-selector={resolvedSelector ?? WORKSPACE_DRAWER_NONE}
      data-bench-visible={hasVisibleBench ? "true" : "false"}
      className={cn(
        "flex h-full min-h-0 w-full overflow-hidden",
        selectorAccessEnabled ? "[background:var(--bench-rail-bg)]" : "bg-background-base",
      )}
    >
      <div
        data-component="right-workspace-body"
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background-base",
          selectorAccessEnabled && "border-t border-border-weaker-base",
        )}
        style={selectorAccessEnabled ? { borderTopRightRadius: bodyCornerRadiusPx } : undefined}
      >
        {(props.showTabsInWorkspace ?? true) ? (
          <BenchTabs
            directory={props.directory}
            tabs={props.tabs}
            activeTabKey={props.activeTabKey}
            onActivate={props.onActivateTab}
            onClose={props.onCloseTab}
            onCloseOthers={props.onCloseOtherTabs}
            onCloseToRight={props.onCloseTabsToRight}
            onCloseAll={props.onCloseAllTabs}
            onNewTab={props.onNewTab}
            emptyTabIDs={props.emptyTabIDs}
            activeEmptyTabID={props.selectedEmptyTabID ?? props.activeEmptyTabID}
            onActivateEmptyTab={props.onActivateEmptyTab}
            onCloseEmptyTab={props.onCloseEmptyTab}
          />
        ) : null}
        <DirectoryChatRightWorkspaceContent
          hasBenchTarget={hasBenchTarget}
          activeTabKey={props.activeTabKey}
          activeTargetKey={
            props.presentation.benchTarget ? benchTargetKey(props.presentation.benchTarget) : null
          }
          bench={props.bench}
          selectorContent={selectorContent}
          emptyContent={
            <BenchEmptyState
              key={props.activeEmptyTabID ?? undefined}
              emptyTabID={props.activeEmptyTabID ?? null}
              directory={props.directory}
              sessions={props.sessions}
              onOpen={(request) => replacingShownEmptyTab(() => openWorkspaceRequest(request))}
              onOpenThread={props.onOpenThread}
              onNewBoard={() => void replacingShownEmptyTab(props.onNewBoard)}
              onNewNote={() => void replacingShownEmptyTab(props.onNewNote)}
              onOpenDrawer={openSelector}
            />
          }
          selectorDrawerWidth={selectorDrawerWidth}
          suppressDrawerMotion={props.suppressDrawerMotion}
          fileView={{
            directory: props.directory,
            kind: fileViewKind,
            onOpenFile: openBreadcrumbFile,
            path: fileViewHasTarget ? fileTarget?.path : undefined,
            title: fileViewHasTarget ? selectedTitle : undefined,
            active: fileViewActive,
            showEmpty: !fileViewHasTarget,
            drawer: fileViewDrawer,
            treeOpen,
            onTreeOpenChange: setCollectionListOpen,
          }}
        />
      </div>

      {selectorAccessEnabled ? <RightWorkspaceRail items={railItems} /> : null}
    </section>
  )
}
