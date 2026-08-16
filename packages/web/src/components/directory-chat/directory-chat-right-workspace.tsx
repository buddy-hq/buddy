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
import { Button, Separator, cn, toast } from "@buddy/ui"
import {
  Books02Icon,
  BoxesIcon,
  FolderIcon,
  PresentationIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  SearchIcon,
  StudyLampIcon,
} from "@/icons/app-icons"
import * as AppIcons from "@/icons/app-icons"
import obsidianIconUrl from "@/assets/obsidian-icon.svg"
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
  WORKSPACE_DRAWER_NONE,
  type DrawerKind,
} from "@/state/directory-workspace-store"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import type { WorkspacePresentation } from "@/lib/directory-chat/workspace-presentation"
import { CreationsDrawer, PracticeDrawer, SourcesDrawer } from "./right-workspace-catalog-drawers"
import { RightWorkspaceBoardsDrawer } from "./right-workspace-boards-drawer"
import { RightWorkspaceDrawerShell } from "./right-workspace-drawer-ui"
import { RightWorkspaceSearchDrawer } from "./right-workspace-search-drawer"
import { RightWorkspaceSkillsDrawer } from "./right-workspace-skills-drawer"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { obsidianVaultProfileQueryOptions } from "@/state/obsidian-vault-query"
import { BenchTabs } from "@/components/bench/bench-tabs"
import type { BenchTab } from "@/lib/bench-tabs"

const FigureGlyph = AppIcons["ShapesIcon"]

type DirectoryChatRightWorkspaceProps = {
  directory: string
  sessionID?: string
  sessions: SessionInfo[]
  workspaceWidth: number
  suppressDrawerMotion?: boolean
  onCreateCreation: () => void
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
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      className={cn(
        "rounded-lg text-icon-base hover:bg-surface-base-hover hover:text-icon-base",
        props.active ? "bg-surface-raised-base text-icon-base" : undefined,
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
      className="flex h-full shrink-0 flex-col items-center gap-1 border-l border-border-weaker-base bg-background-base px-1 py-2"
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
  selectorDrawerWidth: number
  suppressDrawerMotion?: boolean
}) {
  // The Bench container is always rendered in the same position and hidden when there is no target.
  // Moving it into a conditional branch unmounts BenchSurfaceHost — and every surface it is keeping
  // alive — on every chat transition, because the projection reports a closed Bench mid-switch.
  const benchVisible = props.hasBenchTarget && Boolean(props.bench)

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        data-component="right-workspace-bench-target"
        data-bench-visible={benchVisible ? "true" : "false"}
        data-bench-tab-key={props.activeTabKey ?? undefined}
        data-bench-target-key={props.activeTargetKey ?? undefined}
        className={cn(
          "isolate h-full min-h-0 min-w-0 flex-1 bg-background-base",
          !benchVisible && "hidden",
        )}
      >
        {props.bench}
      </div>
      {benchVisible ? null : props.selectorContent ? (
        <div data-component="right-workspace-selector-content" className="min-h-0 min-w-0 flex-1">
          {props.selectorContent}
        </div>
      ) : (
        <div
          data-component="right-workspace-empty-bench-surface"
          className="min-h-0 min-w-0 flex-1 bg-background-base"
        />
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
  const openBenchRoute = useOpenBench()
  const openWorkspaceTarget = useRightWorkspaceOpen()
  const workspace = useDirectoryWorkspace()
  const selectorAccessEnabled = props.presentation.mode !== BENCH_CHAT_LAYOUT_FLOATING
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
    if (resolvedSelector === selector) {
      void workspace.controller.execute({ type: "close-drawer" })
      return
    }
    void workspace.controller.execute({ type: "open-drawer", drawer: selector })
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

  async function openInstructions() {
    if (openingInstructions) return
    setOpeningInstructions(true)
    try {
      await ensureNotebookAgentsMd(props.directory)
      const outcome = resolveRightWorkspaceOpenOutcome(
        await openBenchRoute({
          directory: props.directory,
          target: { type: "workspace-file", path: "AGENTS.md", viewer: "markdown" },
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

  const selectorContent = useMemo(() => {
    if (!selectorAccessEnabled || !resolvedSelector) return null

    if (resolvedSelector === "search") {
      return (
        <RightWorkspaceSearchDrawer
          directory={props.directory}
          sessionID={props.sessionID}
          sessions={props.sessions}
          onClose={closeSelector}
          onOpen={openWorkspaceRequest}
          onOpenThread={props.onOpenThread}
        />
      )
    }
    if (resolvedSelector === "sources") {
      return <SourcesDrawer directory={props.directory} onOpen={openWorkspaceRequest} />
    }
    if (resolvedSelector === "practice") {
      return <PracticeDrawer directory={props.directory} onOpen={openWorkspaceRequest} />
    }
    if (resolvedSelector === "creations") {
      return (
        <CreationsDrawer
          directory={props.directory}
          onOpen={openWorkspaceRequest}
          onCreate={() => {
            closeSelector()
            props.onCreateCreation()
          }}
        />
      )
    }
    if (resolvedSelector === "boards") {
      return (
        <RightWorkspaceBoardsDrawer directory={props.directory} onOpen={openWorkspaceRequest} />
      )
    }
    if (resolvedSelector === "skills") {
      return <RightWorkspaceSkillsDrawer directory={props.directory} />
    }
    return (
      <RightWorkspaceDrawerShell
        title={filesPresentation.title}
        searchLabel="Search files…"
        searchValue={fileSearch}
        action={{
          label: "Refresh files",
          icon: RefreshCwIcon,
          onClick: () => setFileRefreshRequest((current) => current + 1),
        }}
        bodyClassName="overflow-hidden p-0"
        onSearchValueChange={setFileSearch}
      >
        <ProjectFileExplorerPanel
          directory={props.directory}
          mode="selector"
          benchMode={BENCH_CHAT_LAYOUT_DOCKED}
          className="h-full min-h-0"
          searchValue={fileSearch}
          showHeader={false}
          refreshRequest={fileRefreshRequest}
          variant={filesPresentation.variant}
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
      </RightWorkspaceDrawerShell>
    )
  }, [
    closeSelector,
    openWorkspaceRequest,
    props,
    resolvedSelector,
    fileRefreshRequest,
    fileSearch,
    filesPresentation.title,
    filesPresentation.variant,
    restoreFilesSelector,
    selectorAccessEnabled,
  ])

  const railItems: RightWorkspaceRailItem[] = [
    {
      id: "search",
      label: "Search",
      icon: <SearchIcon />,
      active: resolvedSelector === "search",
      onClick: () => openSelector("search"),
    },
    {
      id: "sources",
      label: "Sources",
      icon: <Books02Icon />,
      active: resolvedSelector === "sources",
      onClick: () => openSelector("sources"),
    },
    {
      id: "practice",
      label: "Practice",
      icon: <StudyLampIcon />,
      active: resolvedSelector === "practice",
      onClick: () => openSelector("practice"),
    },
    {
      id: "creations",
      label: "Creations",
      icon: <FigureGlyph />,
      active: resolvedSelector === "creations",
      onClick: () => openSelector("creations"),
    },
    {
      id: "boards",
      label: "Boards",
      icon: <PresentationIcon />,
      active: resolvedSelector === "boards",
      onClick: () => openSelector("boards"),
    },
    {
      id: "files",
      label: "Files",
      icon: obsidianConnected ? <ObsidianRailIcon /> : <FolderIcon />,
      active: resolvedSelector === "files",
      onClick: () => openSelector("files"),
    },
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
      className="flex h-full min-h-0 w-full overflow-hidden bg-background-base"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          selectorDrawerWidth={selectorDrawerWidth}
          suppressDrawerMotion={props.suppressDrawerMotion}
        />
      </div>

      {selectorAccessEnabled ? <RightWorkspaceRail items={railItems} /> : null}
    </section>
  )
}
