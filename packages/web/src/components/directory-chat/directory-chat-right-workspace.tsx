import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
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
  readBenchOpenPolicyStateFromLocation,
  useOpenBench,
} from "@/lib/bench-navigation"
import { guardBenchLeaveBeforeNavigation } from "@/lib/bench-leave-guard"
import { encodeDirectory } from "@/lib/directory-token"
import { ensureNotebookAgentsMd } from "@/lib/ensure-notebook-agents-md"
import {
  RIGHT_WORKSPACE_RAIL_WIDTH_PX,
  resolveRightWorkspaceSelectorDrawerWidth,
} from "@/lib/directory-chat/right-sidebar-layout"
import { useChatStore } from "@/state/chat-store"
import type { MessageWithParts } from "@/state/chat-types"
import type { ResourceOpenOptions } from "@/state/resources-query"
import { useUiPreferences, type RightWorkspaceSelector } from "@/state/ui-preferences"
import { useQueryClient } from "@tanstack/react-query"
import type { BenchOpenDecision } from "@/lib/bench-open-policy-core"

type DirectoryChatRightWorkspaceProps = {
  directory: string
  messages: MessageWithParts[]
  sessionID?: string
  workspaceWidth: number
  lastSelector: RightWorkspaceSelector | undefined
  onLastSelectorChange: (selector: RightWorkspaceSelector) => void
  onOpenResource: (
    directory: string,
    resource: LibraryPanelResourceTarget,
    options?: ResourceOpenOptions,
  ) => Promise<BenchOpenDecision> | void
  bench?: ReactNode
  workspaceOpen: boolean
}

type RightWorkspaceRailItem = {
  id: string
  label: string
  icon: ReactNode
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

function libraryOutcome(decision: BenchOpenDecision | void): LibraryOpenOutcome {
  if (!decision) return "failed"
  if (decision.action === "open") return "opened"
  if (decision.policyID === "already-open") return "focused"
  if (decision.policyID === "leave-guard-blocked") return "blocked"
  return "failed"
}

function benchPolicyTargetKey(state: ReturnType<typeof readBenchOpenPolicyStateFromLocation>) {
  if (state.status === "closed") return "closed"
  const target = state.target
  if (target.type === "workspace-file") {
    return `${state.directory}:file:${target.viewer}:${target.path}`
  }
  return [
    state.directory,
    "object",
    target.ref.kind,
    target.ref.objectID,
    target.ref.revisionID ?? "",
    target.ref.itemID ?? "",
    target.viewID,
  ].join(":")
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

export function DirectoryChatRightWorkspace(props: DirectoryChatRightWorkspaceProps) {
  const [activeSelector, setActiveSelector] = useState<RightWorkspaceSelector | undefined>()
  const [fallbackSelectorSuppressed, setFallbackSelectorSuppressed] = useState(false)
  const [openingInstructions, setOpeningInstructions] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const openBenchRoute = useOpenBench()
  const setRightSidebarOpen = useUiPreferences((state) => state.setRightSidebarOpen)
  const lastOpenedReadingResource = useChatStore(
    (state) => state.lastOpenedReadingResourceByDirectory[props.directory],
  )

  const benchPolicyState = readBenchOpenPolicyStateFromLocation({
    directory: props.directory,
    pathname: location.pathname,
    search: location.search,
  })
  const benchTargetKey = benchPolicyTargetKey(benchPolicyState)
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
  const hasVisibleBench = props.bench !== undefined && props.workspaceOpen
  const fallbackSelector = props.lastSelector ?? "explorer"
  const resolvedSelector = hasVisibleBench
    ? activeSelector
    : (activeSelector ?? (fallbackSelectorSuppressed ? undefined : fallbackSelector))
  const selectorDrawerWidth =
    resolvedSelector === undefined
      ? 0
      : resolveRightWorkspaceSelectorDrawerWidth({
          selector: resolvedSelector,
          workspaceWidthPx: props.workspaceWidth,
        })

  useEffect(() => {
    if (props.workspaceOpen) return
    setActiveSelector(undefined)
    setFallbackSelectorSuppressed(false)
  }, [props.workspaceOpen])

  useEffect(() => {
    if (benchPolicyState.status !== "open") return
    setActiveSelector(undefined)
  }, [benchPolicyState.status, benchTargetKey])

  function closeSelector() {
    setActiveSelector(undefined)
    setFallbackSelectorSuppressed(true)
  }

  function restoreExplorerSelector() {
    setFallbackSelectorSuppressed(false)
    setActiveSelector("explorer")
  }

  function openSelector(selector: RightWorkspaceSelector) {
    props.onLastSelectorChange(selector)
    setFallbackSelectorSuppressed(false)
    setActiveSelector((current) => (hasVisibleBench && current === selector ? undefined : selector))
  }

  const openLibraryRequest = useCallback(async (request: LibraryOpenRequest): Promise<LibraryOpenOutcome> => {
    try {
      if (request.type === "resource") {
        const outcome = libraryOutcome(
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
      const outcome = libraryOutcome(
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
  }, [benchPolicyState, openBenchRoute, props])

  async function openInstructions() {
    if (openingInstructions) return
    setOpeningInstructions(true)
    try {
      await ensureNotebookAgentsMd(props.directory)
      const outcome = libraryOutcome(
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

  async function closeBenchRoute() {
    if (benchPolicyState.status === "open") {
      const guardResult = await guardBenchLeaveBeforeNavigation({
        directory: props.directory,
        intent: "close",
        origin: "user",
        current: benchPolicyState.target,
        next: null,
      })
      if (guardResult.status === "block") return
    }

    await navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(props.directory) },
      replace: true,
    })
    setRightSidebarOpen(false)
  }

  function openReading() {
    if (isResourceObjectRoute) {
      void closeBenchRoute()
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
      void closeBenchRoute()
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
    if (!resolvedSelector) return null

    if (resolvedSelector === "library") {
      return (
        <div
          data-library-scroll-container
          className="scrollbar-hover h-full min-h-0 overflow-y-auto p-3"
        >
          <LibraryPanel
            directories={[props.directory]}
            onOpen={openLibraryRequest}
          />
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
            const outcome = libraryOutcome(decision)
            if (outcome === "opened" || outcome === "focused") {
              closeSelector()
            }
            return decision
          })
        }}
      />
    )
  }, [openLibraryRequest, props, resolvedSelector])

  const railItems: RightWorkspaceRailItem[] = [
    {
      id: "reading",
      label: READING_SHORTCUT_LABEL,
      icon: <BookOpenIcon />,
      active: isResourceObjectRoute,
      disabled: !showReadingAction,
      onClick: openReading,
    },
    {
      id: "whiteboard",
      label: WHITEBOARD_SHORTCUT_LABEL,
      icon: <PresentationIcon />,
      active: isWhiteboardObjectRoute,
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
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {props.bench ? (
          <div className="min-h-0 min-w-0 flex-1">
            <BenchContent bordered={false}>{props.bench}</BenchContent>
          </div>
        ) : (
          <div
            data-component="right-workspace-empty-bench-surface"
            className="min-h-0 min-w-0 flex-1 bg-background-base"
          />
        )}

        {selectorContent ? (
          <aside
            data-component="right-workspace-selector-drawer"
            className="absolute inset-y-0 right-0 h-full min-h-0 max-w-full border-l border-border-weaker-base bg-background-base shadow-xl animate-in fade-in slide-in-from-right-3 duration-150"
            style={{ width: selectorDrawerWidth }}
          >
            {selectorContent}
          </aside>
        ) : null}
      </div>

      <RightWorkspaceRail items={railItems} />
    </section>
  )
}

const WHITEBOARD_SHORTCUT_LABEL = "Toggle whiteboard view"
const READING_SHORTCUT_LABEL = "Toggle reading view"
