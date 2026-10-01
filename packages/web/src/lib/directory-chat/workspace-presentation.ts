import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  resolveDockedBenchShellLayout,
  type BenchChatLayoutMode,
  type BenchLayoutProfileID,
  type BenchTabTarget,
  type BenchViewport,
} from "@/lib/bench-navigation"
import {
  RIGHT_WORKSPACE_DEFAULT_MIN_WIDTH_PX,
  RIGHT_WORKSPACE_DEFAULT_WIDTH_PX,
  RIGHT_WORKSPACE_RAIL_WIDTH_PX,
  resolveRightWorkspaceMaxWidth,
} from "@/lib/directory-chat/right-workspace-layout"
import {
  isImmersiveEmptyWorkspaceState,
  type DrawerKind,
  type EffectiveWorkspaceProjection,
} from "@/state/directory-workspace-store"

const WORKSPACE_PRESENTATION_CHAT_MIN_WIDTH_PX = 320
const COLLECTION_PREVIEW_DEFAULT_WIDTH_PX = 540
const COLLECTION_PREVIEW_MIN_WIDTH_PX = 360
const COLLECTION_CHAT_MIN_WIDTH_PX = 360

export type WorkspaceCollection =
  | "files"
  | "notes"
  | "sources"
  | "boards"
  | "practice"
  | "creations"

export function workspaceCollectionForDrawer(
  drawer: DrawerKind | null,
): WorkspaceCollection | null {
  return drawer === "files" ||
    drawer === "notes" ||
    drawer === "sources" ||
    drawer === "boards" ||
    drawer === "practice" ||
    drawer === "creations"
    ? drawer
    : null
}

export function workspaceCollectionForTarget(
  target: BenchTabTarget | null,
): WorkspaceCollection | null {
  if (target?.type === "workspace-file") return target.root === "notes" ? "notes" : "files"
  if (target?.type !== "object") return null
  switch (target.ref.kind) {
    case "resource":
      return "sources"
    case "whiteboard":
      return "boards"
    case "flashcard-deck":
    case "question-set":
      return "practice"
    default:
      return "creations"
  }
}

// T3's preview shell starts at 540px, has a 360px floor, caps at 70vw,
// and reserves 360px for chat. Buddy carries a separate 44px rail.
function collectionWorkspaceLayout(input: {
  viewport: BenchViewport
  requestedWidthPx: number | null
  leftSidebarVisible: boolean
  leftSidebarWidthPx: number
}) {
  const shellWidth = Math.max(
    0,
    input.viewport.widthPx - (input.leftSidebarVisible ? input.leftSidebarWidthPx : 0),
  )
  const maxWidthPx = Math.max(
    0,
    Math.min(
      resolveRightWorkspaceMaxWidth(input.viewport.widthPx),
      shellWidth - COLLECTION_CHAT_MIN_WIDTH_PX,
    ),
  )
  const minWidthPx = Math.min(
    COLLECTION_PREVIEW_MIN_WIDTH_PX + RIGHT_WORKSPACE_RAIL_WIDTH_PX,
    maxWidthPx,
  )
  return {
    widthPx: clampNumber({
      value:
        input.requestedWidthPx ??
        COLLECTION_PREVIEW_DEFAULT_WIDTH_PX + RIGHT_WORKSPACE_RAIL_WIDTH_PX,
      min: minWidthPx,
      max: maxWidthPx,
    }),
    minWidthPx,
    maxWidthPx,
    chatMinWidthPx: COLLECTION_CHAT_MIN_WIDTH_PX,
  }
}

export type WorkspacePresentationKind =
  | "chat"
  | "hydrating"
  | "transition"
  | "parked-bench"
  | "selector"
  | "docked-bench"
  | "floating-bench"

export type WorkspacePresentation = {
  kind: WorkspacePresentationKind
  mode: BenchChatLayoutMode
  benchTarget: BenchTabTarget | null
  retainedBenchTarget: boolean
  benchVisible: boolean
  dockedBenchVisible: boolean
  workspaceOpen: boolean
  transitioning: boolean
  selector: DrawerKind | null
  leftSidebar: {
    visible: boolean
    managedByWorkspace: boolean
    overlayEnabled: boolean
  }
  workspace: {
    widthPx: number
    minWidthPx: number
    maxWidthPx: number
    chatMinWidthPx: number
  }
  controls: {
    showThreadBrowserInTitlebar: boolean
    showThreadBrowserInPane: boolean
    showSidebarThreadControls: boolean
    showFloatChat: boolean
  }
}

function clampNumber(input: { value: number; min: number; max: number }): number {
  if (input.max < input.min) return input.min
  return Math.min(input.max, Math.max(input.min, input.value))
}

function selectorWorkspaceLayout(input: {
  viewport: BenchViewport
  requestedWorkspaceWidthPx: number | null
  leftSidebarVisible: boolean
  leftSidebarWidthPx: number
}) {
  const shellWidthPx = Math.max(
    0,
    input.viewport.widthPx - (input.leftSidebarVisible ? input.leftSidebarWidthPx : 0),
  )
  const maxWidthPx = Math.max(
    0,
    Math.min(
      resolveRightWorkspaceMaxWidth(input.viewport.widthPx),
      shellWidthPx - WORKSPACE_PRESENTATION_CHAT_MIN_WIDTH_PX,
    ),
  )
  const minWidthPx = Math.min(RIGHT_WORKSPACE_DEFAULT_MIN_WIDTH_PX, maxWidthPx)

  return {
    widthPx: clampNumber({
      value: input.requestedWorkspaceWidthPx ?? RIGHT_WORKSPACE_DEFAULT_WIDTH_PX,
      min: minWidthPx,
      max: maxWidthPx,
    }),
    minWidthPx,
    maxWidthPx,
    chatMinWidthPx: WORKSPACE_PRESENTATION_CHAT_MIN_WIDTH_PX,
  }
}

export function resolveWorkspacePresentation(input: {
  projection: EffectiveWorkspaceProjection
  hydrated: boolean
  layoutProfile: BenchLayoutProfileID
  viewport: BenchViewport
  requestedWorkspaceWidthPx: number | null
  requestedBenchWidthPx: number | null
  leftSidebarPreferredOpen: boolean
  leftSidebarWidthPx: number
}): WorkspacePresentation {
  const transitionFrame =
    input.hydrated &&
    (input.projection.pending.status === "chat-transition" ||
      input.projection.pending.status === "retained-previous")
      ? input.projection.pending.transitionFrame
      : undefined
  const transitioning = transitionFrame !== undefined
  const transitionDockedBenchOpen = transitionFrame?.kind === "docked-bench"
  const transitionFloatingBenchOpen = transitionFrame?.kind === "floating-bench"
  const transitionSelectorOpen = transitionFrame?.kind === "selector"
  const floatingBenchVisible =
    input.hydrated &&
    input.projection.bench.visibility === "visible" &&
    input.projection.bench.mode === BENCH_CHAT_LAYOUT_FLOATING
  const dockedBenchVisible =
    input.hydrated &&
    input.projection.bench.visibility === "visible" &&
    input.projection.bench.mode === BENCH_CHAT_LAYOUT_DOCKED
  const emptyWorkspaceVisible =
    input.hydrated &&
    input.projection.dockedState.visibility === "expanded" &&
    input.projection.bench.visibility === "closed" &&
    input.projection.drawer === null
  const immersiveEmptyVisible =
    emptyWorkspaceVisible && isImmersiveEmptyWorkspaceState(input.projection.dockedState)
  const dockedEmptyVisible = emptyWorkspaceVisible && !immersiveEmptyVisible
  const floatingVisible = floatingBenchVisible || immersiveEmptyVisible
  const selectorVisible =
    input.hydrated &&
    input.projection.dockedState.visibility === "expanded" &&
    input.projection.drawer !== null
  const retainedBenchTarget = input.hydrated && input.projection.bench.visibility !== "closed"

  const kind: WorkspacePresentationKind = !input.hydrated
    ? "hydrating"
    : transitioning
      ? "transition"
      : floatingVisible
        ? "floating-bench"
        : dockedBenchVisible
          ? "docked-bench"
          : input.projection.bench.visibility === "parked"
            ? "parked-bench"
            : selectorVisible || dockedEmptyVisible
              ? "selector"
              : "chat"

  const mode =
    floatingVisible || transitionFloatingBenchOpen
      ? BENCH_CHAT_LAYOUT_FLOATING
      : BENCH_CHAT_LAYOUT_DOCKED
  const dockedFrameOpen = dockedBenchVisible || transitionDockedBenchOpen
  const collectionVisible =
    dockedEmptyVisible ||
    workspaceCollectionForDrawer(input.projection.drawer) !== null ||
    (dockedFrameOpen && workspaceCollectionForTarget(input.projection.bench.target) !== null)
  const leftSidebarManagedByWorkspace =
    dockedFrameOpen || (collectionVisible && !floatingVisible && !transitionFloatingBenchOpen)
  const dockedShellLayout =
    dockedFrameOpen && !collectionVisible
      ? resolveDockedBenchShellLayout({
          profile: input.layoutProfile,
          viewport: input.viewport,
          workspaceChromeWidthPx: RIGHT_WORKSPACE_RAIL_WIDTH_PX,
          requestedWorkspaceWidthPx: input.requestedBenchWidthPx,
          leftSidebarPreferredOpen: input.leftSidebarPreferredOpen,
          leftSidebarWidthPx: input.leftSidebarWidthPx,
        })
      : null
  const leftSidebarVisible =
    floatingVisible || transitionFloatingBenchOpen
      ? false
      : collectionVisible
        ? input.leftSidebarPreferredOpen &&
          input.viewport.widthPx >=
            input.leftSidebarWidthPx +
              COLLECTION_CHAT_MIN_WIDTH_PX +
              COLLECTION_PREVIEW_MIN_WIDTH_PX +
              RIGHT_WORKSPACE_RAIL_WIDTH_PX
        : dockedShellLayout
          ? dockedShellLayout.leftSidebarVisible
          : input.leftSidebarPreferredOpen
  const selectorLayout = selectorWorkspaceLayout({
    viewport: input.viewport,
    requestedWorkspaceWidthPx: input.requestedWorkspaceWidthPx,
    leftSidebarVisible,
    leftSidebarWidthPx: input.leftSidebarWidthPx,
  })
  const workspaceLayout = collectionVisible
    ? collectionWorkspaceLayout({
        viewport: input.viewport,
        requestedWidthPx: input.requestedBenchWidthPx,
        leftSidebarVisible,
        leftSidebarWidthPx: input.leftSidebarWidthPx,
      })
    : dockedShellLayout
      ? {
          widthPx: dockedShellLayout.workspaceWidthPx,
          minWidthPx: dockedShellLayout.rightWorkspace.workspaceMinWidthPx,
          maxWidthPx: dockedShellLayout.rightWorkspace.workspaceMaxWidthPx,
          chatMinWidthPx: dockedShellLayout.rightWorkspace.chatMinWidthPx,
        }
      : selectorLayout
  const workspaceOpen =
    floatingBenchVisible ||
    dockedBenchVisible ||
    selectorVisible ||
    emptyWorkspaceVisible ||
    transitionDockedBenchOpen ||
    transitionFloatingBenchOpen ||
    transitionSelectorOpen

  return {
    kind,
    mode,
    benchTarget: retainedBenchTarget ? input.projection.bench.target : null,
    retainedBenchTarget,
    benchVisible: floatingBenchVisible || dockedBenchVisible,
    dockedBenchVisible: dockedFrameOpen,
    workspaceOpen,
    transitioning,
    selector: input.hydrated ? input.projection.drawer : null,
    leftSidebar: {
      visible: leftSidebarVisible,
      managedByWorkspace: leftSidebarManagedByWorkspace,
      overlayEnabled: leftSidebarManagedByWorkspace && !leftSidebarVisible,
    },
    workspace: workspaceLayout,
    controls: {
      showThreadBrowserInTitlebar: dockedFrameOpen && !leftSidebarVisible,
      showThreadBrowserInPane: floatingVisible || transitionFloatingBenchOpen,
      showSidebarThreadControls: dockedFrameOpen && leftSidebarVisible,
      showFloatChat: dockedFrameOpen,
    },
  }
}
