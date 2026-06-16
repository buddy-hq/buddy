import {
  BENCH_LAYOUT_PROFILE_BALANCED,
  BENCH_LAYOUT_PROFILE_BENCH_FIRST,
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

const BENCH_LAYOUT_PROFILE_SPECS = {
  [BENCH_LAYOUT_PROFILE_BALANCED]: {
    dockedChatWidthPx: 480,
    dockedChatMinWidthPx: 320,
    dockedChatMaxViewportRatio: 0.55,
    benchMinWidthPx: 320,
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
  [BENCH_LAYOUT_PROFILE_BENCH_FIRST]: {
    dockedChatWidthPx: 380,
    dockedChatMinWidthPx: 320,
    dockedChatMaxViewportRatio: 0.42,
    benchMinWidthPx: 480,
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

function clampNumber(input: {
  value: number
  min: number
  max: number
}): number {
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

export { resolveBenchLayoutDefaults }
export type { BenchRect, BenchViewport, ResolvedBenchLayoutDefaults }
