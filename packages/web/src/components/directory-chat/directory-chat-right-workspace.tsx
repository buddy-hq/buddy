import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
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
  FolderTreeIcon,
  LibraryIcon,
  PresentationIcon,
  ScrollTextIcon,
} from "lucide-react"
import { BenchContent } from "@/components/directory-chat/directory-chat-bench-page-layout"
import {
  LibraryPanel,
  type LibraryOpenOutcome,
  type LibraryOpenRequest,
  type LibraryPanelResourceTarget,
} from "@/components/layout/chat-left-sidebar/library-panel"
import { ProjectFileExplorerPanel } from "@/components/project-explorer/project-file-explorer-panel"
import { hasWhiteboardCreate } from "@/components/whiteboard/whiteboard-progressive"
import { whiteboardSessionQueryOptions } from "@/components/whiteboard/whiteboard-query"
import { language } from "@/context/language"
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
import { useChatStore } from "@/state/chat-store"
import type { MessageWithParts } from "@/state/chat-types"
import type { ResourceOpenOptions } from "@/state/resources-query"
import { useQueryClient } from "@tanstack/react-query"
import { BENCH_ROUTE_STATUS_OPEN, type DrawerKind } from "@/state/directory-workspace-store"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import type { WorkspacePresentation } from "@/lib/directory-chat/workspace-presentation"

type DirectoryChatRightWorkspaceProps = {
  directory: string
  messages: MessageWithParts[]
  sessionID?: string
  workspaceWidth: number
  onOpenResource: (
    directory: string,
    resource: LibraryPanelResourceTarget,
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
  onClick: () => void
}

type LibraryOpenResolution =
  | Pick<Extract<OpenBenchResult, { outcome: "committed" }>, "outcome" | "decision">
  | Pick<Exclude<OpenBenchResult, { outcome: "committed" }>, "outcome">

const CLOSED_BENCH_POLICY_STATE = {
  status: "closed",
} satisfies BenchOpenPolicyState

export function resolveLibraryOpenOutcome(
  openResult: LibraryOpenResolution | void,
): LibraryOpenOutcome {
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
          title={props.label}
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
  const actionItems = props.items.slice(0, 2)
  const selectorItems = props.items.slice(2)

  return (
    <TooltipProvider delayDuration={350}>
      <div
        data-component="right-workspace-rail"
        className="flex h-full shrink-0 flex-col items-center gap-1 border-l border-border-weaker-base bg-background-base px-1 py-2"
        style={{ width: RIGHT_WORKSPACE_RAIL_WIDTH_PX }}
      >
        {actionItems.map((item) => (
          <RightWorkspaceRailButton key={item.id} {...item} />
        ))}
        <Separator className="my-1 w-5" />
        {selectorItems.map((item) => (
          <RightWorkspaceRailButton key={item.id} {...item} />
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
  const queryClient = useQueryClient()
  const openBenchRoute = useOpenBench()
  const workspace = useDirectoryWorkspace()
  const lastOpenedReadingResource = useChatStore(
    (state) => state.lastOpenedReadingResourceByDirectory[props.directory],
  )
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
  const isResourceObjectRoute =
    benchPolicyState.status === "open" &&
    benchPolicyState.target.type === "object" &&
    benchPolicyState.target.ref.kind === "resource"
  const isWhiteboardObjectRoute =
    benchPolicyState.status === "open" &&
    benchPolicyState.target.type === "object" &&
    benchPolicyState.target.ref.kind === "whiteboard"
  const showWhiteboardAction = isWhiteboardObjectRoute || hasWhiteboardCreate(props.messages)
  const showReadingAction = isResourceObjectRoute || !!lastOpenedReadingResource
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

  const restoreExplorerSelector = useCallback(() => {
    logBenchToggleStep("directory-chat-right-workspace-restore-explorer-selector", {
      directory: props.directory,
      resolvedSelector,
      workspaceOpen: props.presentation.workspaceOpen,
    })
    void workspace.controller.execute({ type: "open-drawer", drawer: "explorer" })
  }, [props.directory, props.presentation.workspaceOpen, resolvedSelector, workspace.controller])

  function openSelector(selector: DrawerKind) {
    logBenchToggleStep("directory-chat-right-workspace-open-selector", {
      directory: props.directory,
      selector,
      resolvedSelector,
      hasVisibleBench,
      workspaceOpen: props.presentation.workspaceOpen,
    })
    if (hasVisibleBench && resolvedSelector === selector) {
      void workspace.controller.execute({ type: "close-drawer" })
      return
    }
    void workspace.controller.execute({ type: "open-drawer", drawer: selector })
  }

  const openLibraryRequest = useCallback(
    async (request: LibraryOpenRequest): Promise<LibraryOpenOutcome> => {
      try {
        if (request.type === "resource") {
          const outcome = resolveLibraryOpenOutcome(
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
        const outcome = resolveLibraryOpenOutcome(
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
      const outcome = resolveLibraryOpenOutcome(
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

  function focusCurrentBenchShortcut(shortcut: "reading" | "whiteboard") {
    logBenchToggleStep("directory-chat-right-workspace-focus-current-shortcut", {
      directory: props.directory,
      shortcut,
      resolvedSelector,
      benchVisible: props.presentation.benchVisible,
      workspaceOpen: props.presentation.workspaceOpen,
      presentationKind: props.presentation.kind,
    })

    if (resolvedSelector !== null) {
      void workspace.controller.execute({ type: "close-drawer" })
      return
    }

    if (props.presentation.retainedBenchTarget && !props.presentation.benchVisible) {
      void workspace.controller.execute({ type: "reveal" })
    }
  }

  function openReading() {
    if (isResourceObjectRoute) {
      focusCurrentBenchShortcut("reading")
      return
    }

    if (!lastOpenedReadingResource) return

    void openBenchRoute({
      directory: props.directory,
      target: lastOpenedReadingResource.objectID
        ? {
            type: "object",
            ref: {
              kind: "resource",
              objectID: lastOpenedReadingResource.objectID,
              revisionID: null,
              itemID: null,
            },
            viewID: "reader",
          }
        : {
            type: "workspace-file",
            path: lastOpenedReadingResource.path,
            viewer: "file",
          },
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      autoOpen: null,
    })
  }

  function openWhiteboard() {
    if (isWhiteboardObjectRoute) {
      focusCurrentBenchShortcut("whiteboard")
      return
    }

    const sessionID = props.sessionID
    if (!sessionID) return

    void (async () => {
      const session = await queryClient.fetchQuery(
        whiteboardSessionQueryOptions(props.directory, sessionID),
      )
      if (!session.objectID) return

      await openBenchRoute({
        directory: props.directory,
        target: {
          type: "object",
          ref: {
            kind: "whiteboard",
            objectID: session.objectID,
            revisionID: null,
            itemID: null,
          },
          viewID: "current",
        },
        mode: BENCH_CHAT_LAYOUT_DOCKED,
        autoOpen: null,
      })
    })()
  }

  const selectorContent = useMemo(() => {
    if (!selectorAccessEnabled || !resolvedSelector) return null

    if (resolvedSelector === "library") {
      return (
        <div
          data-library-scroll-container
          className="scrollbar-hover h-full min-h-0 overflow-y-auto p-3"
        >
          <LibraryPanel directories={[props.directory]} onOpen={openLibraryRequest} />
        </div>
      )
    }

    return (
      <ProjectFileExplorerPanel
        directory={props.directory}
        mode="selector"
        benchMode={BENCH_CHAT_LAYOUT_DOCKED}
        className="h-full min-h-0"
        onFileOpenBlocked={restoreExplorerSelector}
        onSelectFile={closeSelector}
        onOpenResource={(directory, resource, options) => {
          const pendingDecision = props.onOpenResource(directory, resource, options)
          if (!pendingDecision) return
          return pendingDecision.then((decision) => {
            const outcome = resolveLibraryOpenOutcome(decision)
            if (outcome === "opened" || outcome === "focused") {
              closeSelector()
            }
            return decision
          })
        }}
      />
    )
  }, [
    closeSelector,
    openLibraryRequest,
    props,
    resolvedSelector,
    restoreExplorerSelector,
    selectorAccessEnabled,
  ])

  const railItems: RightWorkspaceRailItem[] = [
    {
      id: "reading",
      label: READING_SHORTCUT_LABEL,
      icon: <BookOpenIcon />,
      active: isResourceObjectRoute && resolvedSelector === null,
      disabled: !showReadingAction,
      onClick: openReading,
    },
    {
      id: "whiteboard",
      label: WHITEBOARD_SHORTCUT_LABEL,
      icon: <PresentationIcon />,
      active: isWhiteboardObjectRoute && resolvedSelector === null,
      disabled: !showWhiteboardAction,
      onClick: openWhiteboard,
    },
    {
      id: "explorer",
      label: language.t("projectExplorer.explorer"),
      icon: <FolderTreeIcon />,
      active: resolvedSelector === "explorer",
      onClick: () => openSelector("explorer"),
    },
    {
      id: "library",
      label: language.t("sidebar.library"),
      icon: <LibraryIcon />,
      active: resolvedSelector === "library",
      onClick: () => openSelector("library"),
    },
    {
      id: "instructions",
      label: language.t("sidebar.mainPane.instructions"),
      icon: <ScrollTextIcon />,
      disabled: openingInstructions,
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

const WHITEBOARD_SHORTCUT_LABEL = "Show whiteboard"
const READING_SHORTCUT_LABEL = "Show reading"
