import {
  BENCH_LAYOUT_PROFILE_CODE,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  BENCH_LAYOUT_PROFILE_PRACTICE,
  BENCH_LAYOUT_PROFILE_READING,
  BENCH_LAYOUT_PROFILE_VISUAL,
  type BenchLayoutProfileID,
} from "./bench-targets"

type BenchViewport = {
  widthPx: number
  heightPx: number
  safeTopPx: number
}

type BenchRect = {
  x: number
  y: number
  width: number
  height: number
}

type ResolvedBenchLayoutDefaults = {
  dockedChatMinWidthPx: number
  benchMinWidthPx: number
  floatingRect: BenchRect
  floatingMinWidthPx: number
  floatingMinHeightPx: number
  floatingMarginPx: number
}

type ResolvedDockedBenchRightWorkspaceLayout = {
  chatMinWidthPx: number
  workspaceMinWidthPx: number
  workspaceMaxWidthPx: number
}

type ResolvedDockedBenchShellLayout = {
  leftSidebarVisible: boolean
  leftSidebarSuppressed: boolean
  availableShellWidthPx: number
  rightWorkspace: ResolvedDockedBenchRightWorkspaceLayout
}

type DockedBenchResizeIntentDecision = "clamp" | "suppress-left-sidebar" | "float"

type BenchLayoutProfileSpec = {
  dockedChatMinWidthPx: number
  benchMinWidthPx: number
  floatingWidthRatio: number
  floatingHeightRatio: number
  floatingPreferredMinWidthPx: number
  floatingPreferredMaxWidthPx: number
  floatingPreferredMinHeightPx: number
  floatingPreferredMaxHeightPx: number
  floatingMinWidthPx: number
  floatingMinHeightPx: number
  floatingNarrowMinWidthPx: number
  floatingNarrowMinHeightPx: number
}

const BENCH_FLOATING_MARGIN_PX = 16
const DOCKED_BENCH_AUTO_FLOAT_OVERDRAG_PX = 24

// Docked Bench is now sized by the kind of work the surface supports, not by a generic
// "balanced" switch. Reading and prose can live near a single comfortable column; code and visual
// canvases need enough horizontal room to avoid turning the surface into a preview thumbnail.
// Floating chat is a compact overlay panel, not a second half of the window.
// Reading/document/practice: slightly roomier for multi-turn coaching.
// Code/visual: tighter so the surface stays primary.
const BENCH_LAYOUT_PROFILE_SPECS = {
  // Readers need one comfortable book column, so chat can remain comparatively generous.
  [BENCH_LAYOUT_PROFILE_READING]: {
    dockedChatMinWidthPx: 380,
    benchMinWidthPx: 560,
    floatingWidthRatio: 0.3,
    floatingHeightRatio: 0.5,
    floatingPreferredMinWidthPx: 380,
    floatingPreferredMaxWidthPx: 460,
    floatingPreferredMinHeightPx: 420,
    floatingPreferredMaxHeightPx: 520,
    floatingMinWidthPx: 340,
    floatingMinHeightPx: 380,
    floatingNarrowMinWidthPx: 300,
    floatingNarrowMinHeightPx: 340,
  },
  // Markdown and general documents need slightly more surface room than a book without crowding chat.
  [BENCH_LAYOUT_PROFILE_DOCUMENT]: {
    dockedChatMinWidthPx: 380,
    benchMinWidthPx: 600,
    floatingWidthRatio: 0.3,
    floatingHeightRatio: 0.5,
    floatingPreferredMinWidthPx: 380,
    floatingPreferredMaxWidthPx: 460,
    floatingPreferredMinHeightPx: 420,
    floatingPreferredMaxHeightPx: 520,
    floatingMinWidthPx: 340,
    floatingMinHeightPx: 380,
    floatingNarrowMinWidthPx: 300,
    floatingNarrowMinHeightPx: 340,
  },
  // Practice surfaces balance prompt/review controls with an active coaching conversation.
  [BENCH_LAYOUT_PROFILE_PRACTICE]: {
    dockedChatMinWidthPx: 380,
    benchMinWidthPx: 600,
    floatingWidthRatio: 0.3,
    floatingHeightRatio: 0.5,
    floatingPreferredMinWidthPx: 380,
    floatingPreferredMaxWidthPx: 460,
    floatingPreferredMinHeightPx: 420,
    floatingPreferredMaxHeightPx: 520,
    floatingMinWidthPx: 340,
    floatingMinHeightPx: 380,
    floatingNarrowMinWidthPx: 300,
    floatingNarrowMinHeightPx: 340,
  },
  // Editors protect a wider working area for code structure, diagnostics, and horizontal scanning.
  [BENCH_LAYOUT_PROFILE_CODE]: {
    dockedChatMinWidthPx: 360,
    benchMinWidthPx: 720,
    floatingWidthRatio: 0.28,
    floatingHeightRatio: 0.48,
    floatingPreferredMinWidthPx: 360,
    floatingPreferredMaxWidthPx: 420,
    floatingPreferredMinHeightPx: 400,
    floatingPreferredMaxHeightPx: 480,
    floatingMinWidthPx: 320,
    floatingMinHeightPx: 360,
    floatingNarrowMinWidthPx: 280,
    floatingNarrowMinHeightPx: 320,
  },
  // Canvases and media protect the largest surface; chat stays useful but intentionally compact.
  [BENCH_LAYOUT_PROFILE_VISUAL]: {
    dockedChatMinWidthPx: 360,
    benchMinWidthPx: 780,
    floatingWidthRatio: 0.28,
    floatingHeightRatio: 0.48,
    floatingPreferredMinWidthPx: 360,
    floatingPreferredMaxWidthPx: 420,
    floatingPreferredMinHeightPx: 400,
    floatingPreferredMaxHeightPx: 480,
    floatingMinWidthPx: 320,
    floatingMinHeightPx: 360,
    floatingNarrowMinWidthPx: 280,
    floatingNarrowMinHeightPx: 320,
  },
} satisfies Record<BenchLayoutProfileID, BenchLayoutProfileSpec>

function clampNumber(input: { value: number; min: number; max: number }): number {
  if (input.max < input.min) {
    return input.min
  }

  return Math.min(input.max, Math.max(input.min, input.value))
}

function resolvePreferredFloatingDimension(input: {
  availablePx: number
  ratio: number
  preferredMinPx: number
  preferredMaxPx: number
}): number {
  if (input.availablePx <= 0) {
    return 0
  }

  const preferred = clampNumber({
    value: input.availablePx * input.ratio,
    min: input.preferredMinPx,
    max: input.preferredMaxPx,
  })
  return Math.min(preferred, input.availablePx)
}

function resolveFloatingMinimum(input: {
  availablePx: number
  regularMinPx: number
  narrowMinPx: number
}): number {
  return input.availablePx >= input.regularMinPx
    ? input.regularMinPx
    : Math.min(input.narrowMinPx, input.availablePx)
}

function resolveBenchLayoutDefaults(input: {
  profile: BenchLayoutProfileID
  viewport: BenchViewport
}): ResolvedBenchLayoutDefaults {
  const spec = BENCH_LAYOUT_PROFILE_SPECS[input.profile]
  const availableFloatingWidth = Math.max(0, input.viewport.widthPx - BENCH_FLOATING_MARGIN_PX * 2)
  const availableFloatingHeight = Math.max(
    0,
    input.viewport.heightPx - input.viewport.safeTopPx - BENCH_FLOATING_MARGIN_PX,
  )
  const floatingMinWidthPx = resolveFloatingMinimum({
    availablePx: availableFloatingWidth,
    regularMinPx: spec.floatingMinWidthPx,
    narrowMinPx: spec.floatingNarrowMinWidthPx,
  })
  const floatingMinHeightPx = resolveFloatingMinimum({
    availablePx: availableFloatingHeight,
    regularMinPx: spec.floatingMinHeightPx,
    narrowMinPx: spec.floatingNarrowMinHeightPx,
  })
  const floatingWidth = Math.max(
    floatingMinWidthPx,
    resolvePreferredFloatingDimension({
      availablePx: availableFloatingWidth,
      ratio: spec.floatingWidthRatio,
      preferredMinPx: spec.floatingPreferredMinWidthPx,
      preferredMaxPx: spec.floatingPreferredMaxWidthPx,
    }),
  )
  const floatingHeight = Math.max(
    floatingMinHeightPx,
    resolvePreferredFloatingDimension({
      availablePx: availableFloatingHeight,
      ratio: spec.floatingHeightRatio,
      preferredMinPx: spec.floatingPreferredMinHeightPx,
      preferredMaxPx: spec.floatingPreferredMaxHeightPx,
    }),
  )
  const maxFloatingX = Math.max(
    BENCH_FLOATING_MARGIN_PX,
    input.viewport.widthPx - floatingWidth - BENCH_FLOATING_MARGIN_PX,
  )
  const maxFloatingY = Math.max(
    input.viewport.safeTopPx,
    input.viewport.heightPx - floatingHeight - BENCH_FLOATING_MARGIN_PX,
  )

  return {
    dockedChatMinWidthPx: spec.dockedChatMinWidthPx,
    benchMinWidthPx: spec.benchMinWidthPx,
    floatingRect: {
      x: maxFloatingX,
      y: maxFloatingY,
      width: floatingWidth,
      height: floatingHeight,
    },
    floatingMinWidthPx,
    floatingMinHeightPx,
    floatingMarginPx: BENCH_FLOATING_MARGIN_PX,
  }
}

function resolveDockedBenchRightWorkspaceLayout(input: {
  profile: BenchLayoutProfileID
  viewport: BenchViewport
  workspaceChromeWidthPx: number
}): ResolvedDockedBenchRightWorkspaceLayout {
  const defaults = resolveBenchLayoutDefaults({
    profile: input.profile,
    viewport: input.viewport,
  })
  const availableWidthPx = Math.max(0, input.viewport.widthPx)
  const preferredWorkspaceMinWidthPx = defaults.benchMinWidthPx + input.workspaceChromeWidthPx
  const workspaceMinWidthPx = Math.min(
    preferredWorkspaceMinWidthPx,
    Math.max(input.workspaceChromeWidthPx, availableWidthPx - defaults.dockedChatMinWidthPx),
  )
  const workspaceMaxWidthPx = Math.max(
    workspaceMinWidthPx,
    availableWidthPx - defaults.dockedChatMinWidthPx,
  )

  return {
    chatMinWidthPx: defaults.dockedChatMinWidthPx,
    workspaceMinWidthPx,
    workspaceMaxWidthPx,
  }
}

function resolveDockedBenchShellLayout(input: {
  profile: BenchLayoutProfileID
  viewport: BenchViewport
  workspaceChromeWidthPx: number
  requestedWorkspaceWidthPx: number
  leftSidebarPreferredOpen: boolean
  leftSidebarWidthPx: number
}): ResolvedDockedBenchShellLayout {
  const defaults = resolveBenchLayoutDefaults({
    profile: input.profile,
    viewport: input.viewport,
  })
  const requestedWorkspaceWidthPx = Math.max(
    defaults.benchMinWidthPx + input.workspaceChromeWidthPx,
    input.requestedWorkspaceWidthPx,
  )
  const leftSidebarFits =
    input.leftSidebarPreferredOpen &&
    input.viewport.widthPx >=
      input.leftSidebarWidthPx + defaults.dockedChatMinWidthPx + requestedWorkspaceWidthPx
  const leftSidebarVisible = input.leftSidebarPreferredOpen && leftSidebarFits
  const availableShellWidthPx = Math.max(
    0,
    input.viewport.widthPx - (leftSidebarVisible ? input.leftSidebarWidthPx : 0),
  )

  return {
    leftSidebarVisible,
    leftSidebarSuppressed: input.leftSidebarPreferredOpen && !leftSidebarVisible,
    availableShellWidthPx,
    rightWorkspace: resolveDockedBenchRightWorkspaceLayout({
      profile: input.profile,
      viewport: {
        ...input.viewport,
        widthPx: availableShellWidthPx,
      },
      workspaceChromeWidthPx: input.workspaceChromeWidthPx,
    }),
  }
}

function resolveDockedBenchResizeIntent(input: {
  rawWorkspaceWidthPx: number
  maxWorkspaceWidthPx: number
  hasVisibleBenchTarget: boolean
  leftSidebarVisible: boolean
}): DockedBenchResizeIntentDecision {
  const overdragPx = input.rawWorkspaceWidthPx - input.maxWorkspaceWidthPx
  if (overdragPx < DOCKED_BENCH_AUTO_FLOAT_OVERDRAG_PX) {
    return "clamp"
  }
  // Over-drag first buys space by suppressing the pinned thread sidebar. Floating is reserved for
  // a continued drag after chat has reached its protected minimum.
  if (input.leftSidebarVisible) {
    return "suppress-left-sidebar"
  }
  return input.hasVisibleBenchTarget ? "float" : "clamp"
}

export {
  DOCKED_BENCH_AUTO_FLOAT_OVERDRAG_PX,
  resolveBenchLayoutDefaults,
  resolveDockedBenchResizeIntent,
  resolveDockedBenchRightWorkspaceLayout,
  resolveDockedBenchShellLayout,
}
export type {
  BenchRect,
  BenchViewport,
  DockedBenchResizeIntentDecision,
  ResolvedBenchLayoutDefaults,
  ResolvedDockedBenchRightWorkspaceLayout,
  ResolvedDockedBenchShellLayout,
}
