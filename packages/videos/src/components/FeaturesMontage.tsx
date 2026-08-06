import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import { GRAIN_IMAGE, GRAIN_OPACITY, GRAIN_SIZE } from "../grain"
import { LAUNCH_COPY } from "../launchCopy"
import type { LaunchFeatureCopy } from "../launchCopy"
import { AuroraBackdrop } from "./AuroraBackdrop"

const FIRST_FRAME = 0

/**
 * The scene's job is accumulation: tiles land one at a time until the wall is
 * full, then the camera dollies through it. The dolly is a scale about the
 * frame centre — an outward radial burst was tried first and always collapsed
 * into four arms, because a short wide grid puts nearly every tile's
 * centre-vector on one of the two axes.
 */
/**
 * Tiles land on an accelerando: the gap between them shrinks from
 * TILE_STAGGER_START_FRAMES to TILE_STAGGER_END_FRAMES, so the wall builds
 * deliberately and then piles up into the push.
 */
const TILE_STAGGER_START_FRAMES = 15
const TILE_STAGGER_END_FRAMES = 6
const TILE_ENTRY_FRAMES = 16
const PUSH_FRAMES = 54

const FEATURES = LAUNCH_COPY.featureMontage.features

const COLUMNS = 4
const ROWS_PER_COLUMN = FEATURES.length / COLUMNS
const COLUMN_WIDTH = 400
const COLUMN_GAP = 26
const TILE_GAP = 26
const WALL_WIDTH = COLUMNS * COLUMN_WIDTH + (COLUMNS - 1) * COLUMN_GAP
const COLUMN_CENTER_INDEX = (COLUMNS - 1) / 2

/**
 * Column heights stay equal while no row repeats a height, so the wall has
 * rhythm without banding. Each tone has to own one tall and one short step, or
 * the alternating tones would drag the sizes into a pattern with them — with a
 * tall/short/tall/short cycle every dark tile ends up big and every light one
 * small.
 */
const TILE_HEIGHT_CYCLE = [232, 180, 196, 264] as const

/** Paired to the height cycle, so a bigger tile reads as a louder one. */
const HEADING_SIZE_CYCLE = [46, 38, 40, 52] as const

/** Static offsets that stop tile edges from lining up into readable rows. */
const COLUMN_PHASE_OFFSETS = [30, -26, 18, -34] as const

const columnOf = (index: number) => Math.floor(index / ROWS_PER_COLUMN)
const rowOf = (index: number) => index % ROWS_PER_COLUMN

/** Every column runs the whole cycle, rotated by its own index. */
const cycleStep = (index: number) =>
  (columnOf(index) + rowOf(index)) % TILE_HEIGHT_CYCLE.length

const tileHeight = (index: number) => TILE_HEIGHT_CYCLE[cycleStep(index)]
const headingSize = (index: number) => HEADING_SIZE_CYCLE[cycleStep(index)]

/**
 * Tone is positional, not authored: every column alternates and each column
 * starts on the opposite tone to its neighbour, so reordering the copy can
 * never break the rhythm.
 */
const TONE_PARITY = 2
const isLightTile = (index: number) =>
  (columnOf(index) + rowOf(index)) % TONE_PARITY !== 0

/**
 * Non-integer so no two tiles share a band, which keeps the sweep landing one
 * tile at a time instead of in pairs.
 */
const DIAGONAL_ROW_WEIGHT = 1.15

/** Diagonal band a tile sits in, used to order the landings. */
const diagonalBand = (index: number) =>
  columnOf(index) + rowOf(index) * DIAGONAL_ROW_WEIGHT

/**
 * Tiles sweep in diagonally from the top-left. Two orders were tried and
 * rejected first: a stride scatter (the eye ping-pongs corner to corner) and a
 * centre-out bloom (its first ring is four tiles around one, which reads as a
 * plus sign — the same shape the old radial burst made).
 */
const LANDING_RANKS: readonly number[] = FEATURES.map((_feature, index) =>
  FEATURES.reduce(
    (rank, _other, otherIndex) =>
      diagonalBand(otherIndex) < diagonalBand(index) ? rank + 1 : rank,
    0,
  ),
)

/** Cumulative landing frame per rank, from the shrinking stagger. */
const LANDING_FRAMES: readonly number[] = FEATURES.reduce<number[]>(
  (frames, _feature, rank) => {
    if (rank === 0) {
      return [0]
    }
    const previousRank = rank - 1
    const stagger = interpolate(
      previousRank,
      [0, FEATURES.length - 1],
      [TILE_STAGGER_START_FRAMES, TILE_STAGGER_END_FRAMES],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    )
    frames.push(frames[previousRank] + Math.round(stagger))
    return frames
  },
  [],
)

const DEPTH_OPACITY_FALLOFF = 0.2
const DEPTH_SCALE_FALLOFF = 0.03

const ENTRY_RISE_PX = 30
const ENTRY_START_SCALE = 0.9

const PUSH_SCALE = 1.7
const PUSH_BLUR_PX = 11

/** The aurora sits behind the wall, so it comes up with it and pushes wider. */
const BACKDROP_START_OPACITY = 0.3
const BACKDROP_PUSH_SCALE_GAIN = 1.3
/** Point in the push where the aurora starts dissolving, as push progress. */
const BACKDROP_PUSH_OUT_START = 0.45

const PARCHMENT_SURFACE = "linear-gradient(180deg, #fbf8f1, #f1ebdd)"
const DARK_SURFACE = "linear-gradient(180deg, #1a1816, #100f0e)"
const INK_ON_PARCHMENT = "#2b2419"
const INK_ON_DARK = "#f7f1e6"

const ENTRY_EASING = Easing.bezier(0.16, 1, 0.3, 1)
const PUSH_EASING = Easing.bezier(0.55, 0, 0.85, 0.35)

/** The montage owns the whole mass-feature slot, so it never falls back to the
 * placeholder card. Kept in frames to stay exact at 30 FPS. */
export const FEATURES_MONTAGE_DURATION_FRAMES = 270

const ACCUMULATE_FRAMES =
  LANDING_FRAMES[FEATURES.length - 1] + TILE_ENTRY_FRAMES
export const FEATURES_MONTAGE_PUSH_START_FRAME =
  FEATURES_MONTAGE_DURATION_FRAMES - PUSH_FRAMES

if (ACCUMULATE_FRAMES > FEATURES_MONTAGE_PUSH_START_FRAME) {
  throw new Error("The feature wall lands slower than the montage is long.")
}

/** 0 at the centre column, 1 at the outermost. */
const columnDepth = (column: number) =>
  Math.abs(column - COLUMN_CENTER_INDEX) / COLUMN_CENTER_INDEX

type TileProps = {
  readonly feature: LaunchFeatureCopy
  readonly index: number
}

const Tile = ({ feature, index }: TileProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entryFrame = frame - LANDING_FRAMES[LANDING_RANKS[index]]
  const entrySpring = spring({
    config: { damping: 17, mass: 0.5, stiffness: 190 },
    fps,
    frame: entryFrame,
  })
  const entryOpacity = interpolate(
    entryFrame,
    [FIRST_FRAME, TILE_ENTRY_FRAMES / 2],
    [0, 1],
    {
      easing: ENTRY_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const entryY = (1 - entrySpring) * ENTRY_RISE_PX
  const entryScale = interpolate(entrySpring, [0, 1], [ENTRY_START_SCALE, 1])

  const isLight = isLightTile(index)

  return (
    <div
      style={{
        background: isLight ? PARCHMENT_SURFACE : DARK_SURFACE,
        borderRadius: 22,
        boxShadow: isLight
          ? "inset 0 1px rgba(255,255,255,0.6), 0 26px 60px -24px rgba(0,0,0,0.9)"
          : "inset 0 1px rgba(255,226,190,0.10), inset 0 0 0 1px rgba(255,224,186,0.08), 0 26px 60px -28px rgba(0,0,0,0.95)",
        display: "flex",
        flexDirection: "column",
        height: tileHeight(index),
        justifyContent: "center",
        opacity: entryOpacity,
        overflow: "hidden",
        padding: "0 36px",
        position: "relative",
        transform: `translateY(${entryY}px) scale(${entryScale})`,
      }}
    >
      <div
        style={{
          backgroundImage: GRAIN_IMAGE,
          backgroundSize: `${GRAIN_SIZE}px ${GRAIN_SIZE}px`,
          inset: 0,
          opacity: GRAIN_OPACITY,
          pointerEvents: "none",
          position: "absolute",
        }}
      />

      <span
        style={{
          color: isLight ? INK_ON_PARCHMENT : INK_ON_DARK,
          fontFamily:
            "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: headingSize(index),
          fontWeight: 700,
          letterSpacing: "-0.035em",
          lineHeight: 1.05,
          position: "relative",
        }}
      >
        {feature.tag}
      </span>
    </div>
  )
}

type ColumnProps = {
  readonly column: number
}

const Column = ({ column }: ColumnProps) => {
  const depth = columnDepth(column)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: TILE_GAP,
        opacity: 1 - depth * DEPTH_OPACITY_FALLOFF,
        transform: `translateY(${COLUMN_PHASE_OFFSETS[column]}px) scale(${
          1 - depth * DEPTH_SCALE_FALLOFF
        })`,
        width: COLUMN_WIDTH,
      }}
    >
      {FEATURES.slice(
        column * ROWS_PER_COLUMN,
        (column + 1) * ROWS_PER_COLUMN,
      ).map((feature, rowIndex) => (
        <Tile
          key={feature.tag}
          feature={feature}
          index={column * ROWS_PER_COLUMN + rowIndex}
        />
      ))}
    </div>
  )
}

export const FeaturesMontage = () => {
  const frame = useCurrentFrame()

  const pushProgress = interpolate(
    frame,
    [FEATURES_MONTAGE_PUSH_START_FRAME, FEATURES_MONTAGE_DURATION_FRAMES],
    [0, 1],
    {
      easing: PUSH_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const wallScale = 1 + pushProgress * (PUSH_SCALE - 1)
  const wallOpacity = interpolate(pushProgress, [0, 0.55, 1], [1, 0.75, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  /**
   * The aurora goes with the wall. Without this the scene holds a lit nebula
   * to its very last frame and hard-cuts, so the ending has nothing to rise
   * out of.
   */
  const backdropPushOut = interpolate(
    pushProgress,
    [BACKDROP_PUSH_OUT_START, 1],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const backdropStrength = interpolate(
    frame,
    [FIRST_FRAME, ACCUMULATE_FRAMES],
    [BACKDROP_START_OPACITY, 1],
    {
      easing: ENTRY_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: "#0a0908",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <AuroraBackdrop
        opacity={backdropStrength * backdropPushOut}
        scale={1 + pushProgress * BACKDROP_PUSH_SCALE_GAIN}
      />

      <div
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          height: "100%",
          maskImage: "radial-gradient(62% 62% at 50% 50%, black, transparent)",
          pointerEvents: "none",
          position: "absolute",
          WebkitMaskImage:
            "radial-gradient(62% 62% at 50% 50%, black, transparent)",
          width: "100%",
        }}
      />

      <div
        style={{
          alignItems: "center",
          display: "flex",
          filter: `blur(${pushProgress * PUSH_BLUR_PX}px)`,
          gap: COLUMN_GAP,
          justifyContent: "center",
          opacity: wallOpacity,
          transform: `scale(${wallScale})`,
          width: WALL_WIDTH,
        }}
      >
        {Array.from({ length: COLUMNS }, (_, column) => (
          <Column key={`column-${column}`} column={column} />
        ))}
      </div>

    </AbsoluteFill>
  )
}
