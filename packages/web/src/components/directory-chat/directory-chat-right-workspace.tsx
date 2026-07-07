import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Button,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  toast,
} from "@buddy/ui"
import {
  BookOpenIcon,
  BrainIcon,
  FolderIcon,
  PresentationIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  SearchIcon,
  ShapesIcon,
} from "lucide-react"
import type { SessionInfo } from "@/state/chat-types"
import { BenchContent } from "@/components/directory-chat/directory-chat-bench-page-layout"
import {
  type RightWorkspaceOpenOutcome,
  type RightWorkspaceOpenRequest,
  type RightWorkspaceResourceTarget,
} from "./right-workspace-open"
import { ProjectFileExplorerPanel } from "@/components/project-explorer/project-file-explorer-panel"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
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
import type { ResourceOpenOptions } from "@/state/resources-query"
import { BENCH_ROUTE_STATUS_OPEN, type DrawerKind } from "@/state/directory-workspace-store"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import type { WorkspacePresentation } from "@/lib/directory-chat/workspace-presentation"
import { CreationsDrawer, PracticeDrawer, SourcesDrawer } from "./right-workspace-catalog-drawers"
import { RightWorkspaceBoardsDrawer } from "./right-workspace-boards-drawer"
import { RightWorkspaceDrawerShell } from "./right-workspace-drawer-ui"
import { RightWorkspaceSearchDrawer } from "./right-workspace-search-drawer"

type DirectoryChatRightWorkspaceProps = {
  directory: string
  sessionID?: string
  sessions: SessionInfo[]
  workspaceWidth: number
  onCreateBoard: () => void
  onCreateCreation: () => void
  onOpenThread: (sessionID: string) => Promise<boolean>
  onOpenResource: (
    directory: string,
    resource: RightWorkspaceResourceTarget,
    options?: ResourceOpenOptions,
  ) => Promise<OpenBenchResult> | void
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

type RightWorkspaceOpenResolution =
  | Pick<Extract<OpenBenchResult, { outcome: "committed" }>, "outcome" | "decision">
  | Pick<Exclude<OpenBenchResult, { outcome: "committed" }>, "outcome">

const CLOSED_BENCH_POLICY_STATE = {
  status: "closed",
} satisfies BenchOpenPolicyState

export function resolveRightWorkspaceOpenOutcome(
  openResult: RightWorkspaceOpenResolution | void,
): RightWorkspaceOpenOutcome {
  if (!openResult) return "failed"
  if (openResult.outcome === "blocked") return "blocked"
  if (openResult.outcome !== "committed") return "failed"
  if (openResult.decision.action === "ignore" && openResult.decision.policyID === "already-open") {
    return "focused"
  }
  return "opened"
}

function RightWorkspaceRailButton(props: RightWorkspaceRailItem) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={props.label}
          aria-pressed={props.active}
          disabled={props.disabled}
          className={cn(
            "rounded-lg text-icon-base hover:bg-surface-base-hover hover:text-text-base",
            props.active ? "bg-surface-raised-base text-text-base" : undefined,
          )}
          onClick={props.onClick}
        >
          {props.icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={8}>
        <p>{props.label}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function RightWorkspaceRail(props: { items: RightWorkspaceRailItem[] }) {
  return (
    <TooltipProvider delayDuration={350}>
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
    </TooltipProvider>
  )
}

export function DirectoryChatRightWorkspaceContent(props: {
  hasBenchTarget: boolean
  bench?: ReactNode
  selectorContent: ReactNode
  selectorDrawerWidth: number
}) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {props.hasBenchTarget && props.bench ? (
        <div className="min-h-0 min-w-0 flex-1">
          <BenchContent bordered={false}>{props.bench}</BenchContent>
        </div>
      ) : props.selectorContent ? (
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
          className="absolute inset-y-0 right-0 h-full min-h-0 max-w-full border-l border-border-weaker-base bg-background-base shadow-xl animate-in fade-in slide-in-from-right-3 duration-150"
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
  const workspace = useDirectoryWorkspace()
  const selectorAccessEnabled = props.presentation.mode !== BENCH_CHAT_LAYOUT_FLOATING

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
      try {
        if (request.type === "resource") {
          const outcome = resolveRightWorkspaceOpenOutcome(
            await props.onOpenResource(request.directory, request.resource, request.options),
          )
          if (outcome === "opened" || outcome === "focused") closeSelector()
          return outcome
        }

        const currentTarget =
          benchPolicyState.status === "open" &&
          benchPolicyState.target.type === "object" &&
          request.target.type === "object" &&
          benchPolicyState.target.ref.objectID === request.target.ref.objectID
            ? benchPolicyState.target
            : request.target
        const outcome = resolveRightWorkspaceOpenOutcome(
          await openBenchRoute({
            directory: request.directory,
            target: currentTarget,
            mode: BENCH_CHAT_LAYOUT_DOCKED,
            autoOpen: null,
          }),
        )
        if (outcome === "opened" || outcome === "focused") closeSelector()
        return outcome
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
        return "failed"
      }
    },
    [benchPolicyState, closeSelector, openBenchRoute, props],
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
      return (
        <SourcesDrawer
          directory={props.directory}
          onClose={closeSelector}
          onOpen={openWorkspaceRequest}
        />
      )
    }
    if (resolvedSelector === "practice") {
      return (
        <PracticeDrawer
          directory={props.directory}
          onClose={closeSelector}
          onOpen={openWorkspaceRequest}
        />
      )
    }
    if (resolvedSelector === "creations") {
      return (
        <CreationsDrawer
          directory={props.directory}
          onClose={closeSelector}
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
        <RightWorkspaceBoardsDrawer
          directory={props.directory}
          sessionID={props.sessionID}
          onClose={closeSelector}
          onCreateBoard={() => {
            closeSelector()
            props.onCreateBoard()
          }}
          onOpen={openWorkspaceRequest}
        />
      )
    }
    return (
      <RightWorkspaceDrawerShell
        title="Files"
        searchLabel="Search files…"
        searchValue={fileSearch}
        action={{
          label: "Refresh files",
          icon: RefreshCwIcon,
          onClick: () => setFileRefreshRequest((current) => current + 1),
        }}
        bodyClassName="overflow-hidden p-0"
        onSearchValueChange={setFileSearch}
        onClose={closeSelector}
      >
        <ProjectFileExplorerPanel
          directory={props.directory}
          mode="selector"
          benchMode={BENCH_CHAT_LAYOUT_DOCKED}
          className="h-full min-h-0"
          searchValue={fileSearch}
          showHeader={false}
          refreshRequest={fileRefreshRequest}
          onFileOpenBlocked={restoreFilesSelector}
          onSelectFile={closeSelector}
          onOpenResource={(directory, resource, options) => {
            const pendingDecision = props.onOpenResource(directory, resource, options)
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
      icon: <BookOpenIcon />,
      active: resolvedSelector === "sources",
      onClick: () => openSelector("sources"),
    },
    {
      id: "practice",
      label: "Practice",
      icon: <BrainIcon />,
      active: resolvedSelector === "practice",
      onClick: () => openSelector("practice"),
    },
    {
      id: "creations",
      label: "Creations",
      icon: <ShapesIcon />,
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
      icon: <FolderIcon />,
      active: resolvedSelector === "files",
      onClick: () => openSelector("files"),
    },
    {
      id: "instructions",
      label: "Notebook Instructions",
      icon: <ScrollTextIcon />,
      active: isInstructionsRoute && resolvedSelector === null,
      disabled: openingInstructions,
      separatorBefore: true,
      onClick: () => void openInstructions(),
    },
  ]

  return (
    <section
      data-component="directory-chat-right-workspace"
      data-selector={resolvedSelector ?? "none"}
      data-bench-visible={hasVisibleBench ? "true" : "false"}
      className="flex h-full min-h-0 w-full overflow-hidden bg-background-base"
    >
      <DirectoryChatRightWorkspaceContent
        hasBenchTarget={hasBenchTarget}
        bench={props.bench}
        selectorContent={selectorContent}
        selectorDrawerWidth={selectorDrawerWidth}
      />

      {selectorAccessEnabled ? <RightWorkspaceRail items={railItems} /> : null}
    </section>
  )
}
