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
  RIGHT_WORKSPACE_RAIL_WIDTH_PX,
  resolveRightWorkspaceMaxWidth,
} from "@/lib/directory-chat/right-workspace-layout"
import type { DrawerKind, EffectiveWorkspaceProjection } from "@/state/directory-workspace-store"

const WORKSPACE_PRESENTATION_CHAT_MIN_WIDTH_PX = 320

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
  requestedWorkspaceWidthPx: number
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
      value: input.requestedWorkspaceWidthPx,
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
  requestedWorkspaceWidthPx: number
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
  const selectorVisible =
    input.hydrated &&
    input.projection.dockedState.visibility === "expanded" &&
    input.projection.drawer !== null
  const retainedBenchTarget = input.hydrated && input.projection.bench.visibility !== "closed"

  const kind: WorkspacePresentationKind = !input.hydrated
    ? "hydrating"
    : transitioning
      ? "transition"
      : floatingBenchVisible
        ? "floating-bench"
        : dockedBenchVisible
          ? "docked-bench"
          : input.projection.bench.visibility === "parked"
            ? "parked-bench"
            : selectorVisible
              ? "selector"
              : "chat"

  const mode =
    floatingBenchVisible || transitionFloatingBenchOpen
      ? BENCH_CHAT_LAYOUT_FLOATING
      : BENCH_CHAT_LAYOUT_DOCKED
  const dockedFrameOpen = dockedBenchVisible || transitionDockedBenchOpen
  const dockedShellLayout = dockedFrameOpen
    ? resolveDockedBenchShellLayout({
        profile: input.layoutProfile,
        viewport: input.viewport,
        workspaceChromeWidthPx: RIGHT_WORKSPACE_RAIL_WIDTH_PX,
        requestedWorkspaceWidthPx: input.requestedWorkspaceWidthPx,
        leftSidebarPreferredOpen: input.leftSidebarPreferredOpen,
        leftSidebarWidthPx: input.leftSidebarWidthPx,
      })
    : null
  const leftSidebarVisible =
    floatingBenchVisible || transitionFloatingBenchOpen
      ? false
      : dockedShellLayout
        ? dockedShellLayout.leftSidebarVisible
        : input.leftSidebarPreferredOpen
  const dockedLayout = dockedShellLayout?.rightWorkspace ?? null
  const selectorLayout = selectorWorkspaceLayout({
    viewport: input.viewport,
    requestedWorkspaceWidthPx: input.requestedWorkspaceWidthPx,
    leftSidebarVisible,
    leftSidebarWidthPx: input.leftSidebarWidthPx,
  })
  const workspaceLayout = dockedLayout
    ? {
        widthPx: clampNumber({
          value: input.requestedWorkspaceWidthPx,
          min: dockedLayout.workspaceMinWidthPx,
          max: dockedLayout.workspaceMaxWidthPx,
        }),
        minWidthPx: dockedLayout.workspaceMinWidthPx,
        maxWidthPx: dockedLayout.workspaceMaxWidthPx,
        chatMinWidthPx: dockedLayout.chatMinWidthPx,
      }
    : selectorLayout
  const workspaceOpen =
    floatingBenchVisible ||
    dockedBenchVisible ||
    selectorVisible ||
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
      overlayEnabled: dockedFrameOpen && !leftSidebarVisible,
    },
    workspace: workspaceLayout,
    controls: {
      showThreadBrowserInTitlebar: dockedFrameOpen && !leftSidebarVisible,
      showThreadBrowserInPane: floatingBenchVisible || transitionFloatingBenchOpen,
      showSidebarThreadControls: dockedFrameOpen && leftSidebarVisible,
      showFloatChat: dockedFrameOpen,
    },
  }
}
