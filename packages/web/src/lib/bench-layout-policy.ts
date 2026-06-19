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
  dockedChatWidthPx: number
  dockedChatMinWidthPx: number
  dockedChatMaxWidthPx: number
  benchMinWidthPx: number
  floatingRect: BenchRect
  floatingMinWidthPx: number
  floatingMinHeightPx: number
  floatingMarginPx: number
}

type ResolvedDockedBenchRightWorkspaceLayout = {
  chatWidthPx: number
  chatMinWidthPx: number
  chatMaxWidthPx: number
  workspaceWidthPx: number
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
  dockedChatWidthPx: number
  dockedChatMinWidthPx: number
  dockedChatMaxViewportRatio: number
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

const BENCH_FLOATING_MARGIN_PX = 24
const DOCKED_BENCH_AUTO_FLOAT_OVERDRAG_PX = 24

// Docked Bench is now sized by the kind of work the surface supports, not by a generic
// "balanced" switch. Reading and prose can live near a single comfortable column; code and visual
// canvases need enough horizontal room to avoid turning the surface into a preview thumbnail.
const BENCH_LAYOUT_PROFILE_SPECS = {
  // Readers need one comfortable book column, so chat can remain comparatively generous.
  [BENCH_LAYOUT_PROFILE_READING]: {
    dockedChatWidthPx: 520,
    dockedChatMinWidthPx: 380,
    dockedChatMaxViewportRatio: 0.5,
    benchMinWidthPx: 560,
    floatingWidthRatio: 0.42,
    floatingHeightRatio: 0.62,
    floatingPreferredMinWidthPx: 560,
    floatingPreferredMaxWidthPx: 700,
    floatingPreferredMinHeightPx: 560,
    floatingPreferredMaxHeightPx: 720,
    floatingMinWidthPx: 440,
    floatingMinHeightPx: 460,
    floatingNarrowMinWidthPx: 320,
    floatingNarrowMinHeightPx: 360,
  },
  // Markdown and general documents need slightly more surface room than a book without crowding chat.
  [BENCH_LAYOUT_PROFILE_DOCUMENT]: {
    dockedChatWidthPx: 500,
    dockedChatMinWidthPx: 380,
    dockedChatMaxViewportRatio: 0.48,
    benchMinWidthPx: 600,
    floatingWidthRatio: 0.42,
    floatingHeightRatio: 0.62,
    floatingPreferredMinWidthPx: 560,
    floatingPreferredMaxWidthPx: 700,
    floatingPreferredMinHeightPx: 560,
    floatingPreferredMaxHeightPx: 720,
    floatingMinWidthPx: 440,
    floatingMinHeightPx: 460,
    floatingNarrowMinWidthPx: 320,
    floatingNarrowMinHeightPx: 360,
  },
  // Practice surfaces balance prompt/review controls with an active coaching conversation.
  [BENCH_LAYOUT_PROFILE_PRACTICE]: {
    dockedChatWidthPx: 500,
    dockedChatMinWidthPx: 380,
    dockedChatMaxViewportRatio: 0.48,
    benchMinWidthPx: 600,
    floatingWidthRatio: 0.42,
    floatingHeightRatio: 0.62,
    floatingPreferredMinWidthPx: 560,
    floatingPreferredMaxWidthPx: 700,
    floatingPreferredMinHeightPx: 560,
    floatingPreferredMaxHeightPx: 720,
    floatingMinWidthPx: 440,
    floatingMinHeightPx: 460,
    floatingNarrowMinWidthPx: 320,
    floatingNarrowMinHeightPx: 360,
  },
  // Editors protect a wider working area for code structure, diagnostics, and horizontal scanning.
  [BENCH_LAYOUT_PROFILE_CODE]: {
    dockedChatWidthPx: 440,
    dockedChatMinWidthPx: 360,
    dockedChatMaxViewportRatio: 0.42,
    benchMinWidthPx: 720,
    floatingWidthRatio: 0.34,
    floatingHeightRatio: 0.54,
    floatingPreferredMinWidthPx: 440,
    floatingPreferredMaxWidthPx: 560,
    floatingPreferredMinHeightPx: 460,
    floatingPreferredMaxHeightPx: 620,
    floatingMinWidthPx: 360,
    floatingMinHeightPx: 380,
    floatingNarrowMinWidthPx: 300,
    floatingNarrowMinHeightPx: 320,
  },
  // Canvases and media protect the largest surface; chat stays useful but intentionally compact.
  [BENCH_LAYOUT_PROFILE_VISUAL]: {
    dockedChatWidthPx: 380,
    dockedChatMinWidthPx: 360,
    dockedChatMaxViewportRatio: 0.36,
    benchMinWidthPx: 780,
    floatingWidthRatio: 0.34,
    floatingHeightRatio: 0.54,
    floatingPreferredMinWidthPx: 440,
    floatingPreferredMaxWidthPx: 560,
    floatingPreferredMinHeightPx: 460,
    floatingPreferredMaxHeightPx: 620,
    floatingMinWidthPx: 360,
    floatingMinHeightPx: 380,
    floatingNarrowMinWidthPx: 300,
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
  const dockedChatMaxWidthPx = Math.max(
    spec.dockedChatMinWidthPx,
    input.viewport.widthPx * spec.dockedChatMaxViewportRatio,
  )
  const dockedChatWidthPx = clampNumber({
    value: spec.dockedChatWidthPx,
    min: spec.dockedChatMinWidthPx,
    max: dockedChatMaxWidthPx,
  })
  const maxFloatingX = Math.max(
    BENCH_FLOATING_MARGIN_PX,
    input.viewport.widthPx - floatingWidth - BENCH_FLOATING_MARGIN_PX,
  )
  const maxFloatingY = Math.max(
    input.viewport.safeTopPx,
    input.viewport.heightPx - floatingHeight - BENCH_FLOATING_MARGIN_PX,
  )

  return {
    dockedChatWidthPx,
    dockedChatMinWidthPx: spec.dockedChatMinWidthPx,
    dockedChatMaxWidthPx,
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
  const chatMaxWidthPx = Math.min(
    defaults.dockedChatMaxWidthPx,
    Math.max(defaults.dockedChatMinWidthPx, availableWidthPx - workspaceMinWidthPx),
  )
  const chatWidthPx = clampNumber({
    value: defaults.dockedChatWidthPx,
    min: defaults.dockedChatMinWidthPx,
    max: chatMaxWidthPx,
  })
  const workspaceMaxWidthPx = Math.max(
    workspaceMinWidthPx,
    availableWidthPx - defaults.dockedChatMinWidthPx,
  )
  const workspaceWidthPx = clampNumber({
    value: availableWidthPx - chatWidthPx,
    min: workspaceMinWidthPx,
    max: workspaceMaxWidthPx,
  })

  return {
    chatWidthPx,
    chatMinWidthPx: defaults.dockedChatMinWidthPx,
    chatMaxWidthPx,
    workspaceWidthPx,
    workspaceMinWidthPx,
    workspaceMaxWidthPx,
  }
}

function resolveDockedBenchShellLayout(input: {
  profile: BenchLayoutProfileID
  viewport: BenchViewport
  workspaceChromeWidthPx: number
  leftSidebarPreferredOpen: boolean
  leftSidebarWidthPx: number
}): ResolvedDockedBenchShellLayout {
  const defaults = resolveBenchLayoutDefaults({
    profile: input.profile,
    viewport: input.viewport,
  })
  // The stored sidebar preference is not layout state. A docked Bench may suppress the pinned
  // sidebar when the semantic defaults do not fit, then restore it automatically when they do.
  const leftSidebarFits =
    input.leftSidebarPreferredOpen &&
    input.viewport.widthPx >=
      input.leftSidebarWidthPx +
        defaults.dockedChatWidthPx +
        defaults.benchMinWidthPx +
        input.workspaceChromeWidthPx
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
