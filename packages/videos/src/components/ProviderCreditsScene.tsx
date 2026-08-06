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
import { PROVIDER_NAMES } from "../providerCatalog"

/**
 * One continuous credit roll, not three cut scenes.
 *
 * The hero, its companions, the whole catalog and the count all live in a
 * single track; the scene simply moves that track. So the reveal is the camera
 * discovering how far the list goes, rather than a montage cutting to a longer
 * list — which is the difference between "here are some more" and "this keeps
 * going". The roll accelerates out of the hero and decelerates onto the count,
 * so the frame both starts and ends parked on something centred.
 */

const FIRST_FRAME = 0
const SANS =
  "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif"

const CENTER_DIVISOR = 2

const HERO = LAUNCH_COPY.providerWall.hero
const COMPANIONS = LAUNCH_COPY.providerWall.companions
const CLOSING = LAUNCH_COPY.providerWall.closing

/**
 * The roll is laid out column-major so each column reads alphabetically. Five
 * columns rather than four because the roll's speed is its travel over its
 * duration: a taller list at the same duration is a faster strobe, and past a
 * point the names stop being names.
 */
const COLUMN_COUNT = 5
const NAME_COLUMN_WIDTH = 320
const NAME_COLUMN_GAP = 36
const NAME_ROW_HEIGHT = 68
const LIST_WIDTH =
  COLUMN_COUNT * NAME_COLUMN_WIDTH + (COLUMN_COUNT - 1) * NAME_COLUMN_GAP
const ROWS_PER_COLUMN = Math.ceil(PROVIDER_NAMES.length / COLUMN_COUNT)
const LIST_HEIGHT = ROWS_PER_COLUMN * NAME_ROW_HEIGHT

/**
 * Split so no column is more than a row longer than another. Slicing at a flat
 * ROWS_PER_COLUMN would dump the remainder on the last column, and a roll whose
 * right edge runs out three rows early looks like a missing chunk.
 */
const columnStart = (columnIndex: number) =>
  Math.floor((columnIndex * PROVIDER_NAMES.length) / COLUMN_COUNT)

const NAME_COLUMNS: readonly (readonly string[])[] = Array.from(
  { length: COLUMN_COUNT },
  (_column, columnIndex) =>
    PROVIDER_NAMES.slice(columnStart(columnIndex), columnStart(columnIndex + 1)),
)

/**
 * The hero is a fixed-height box with its type centred inside, not a stack of
 * measured lines, so the roll's travel stays exact no matter what the font
 * metrics do to the copy.
 */
const HERO_BLOCK_HEIGHT = 260
const HERO_NAME_SIZE_PX = 112
const HERO_NAME_TO_COMPANIONS_GAP = 46
const COMPANION_SIZE_PX = 40
const COMPANION_GAP = 26

/**
 * A row or two of the list sits inside the bottom edge while the hero is
 * parked — the promise that the frame goes somewhere — but far enough down
 * that the hero still owns the middle of the frame. Only the far end clears
 * itself, so the count never shares the frame with a stray tail.
 */
const COMPANIONS_TO_LIST_GAP = 280
const LIST_TO_CLOSING_GAP = 500
const CLOSING_BLOCK_HEIGHT = 140
/**
 * Matched to the transition cards in SceneTransition — this line does their job
 * now, so it should be set in their type rather than in the roll's own.
 */
const CLOSING_HEADLINE_SIZE_PX = 92

const HERO_BLOCK_CENTER = HERO_BLOCK_HEIGHT / CENTER_DIVISOR
const CLOSING_BLOCK_TOP =
  HERO_BLOCK_HEIGHT + COMPANIONS_TO_LIST_GAP + LIST_HEIGHT + LIST_TO_CLOSING_GAP
const CLOSING_BLOCK_CENTER =
  CLOSING_BLOCK_TOP + CLOSING_BLOCK_HEIGHT / CENTER_DIVISOR

const HERO_ENTRY_FRAMES = 14
const COMPANION_DELAY_FRAMES = 14
const COMPANION_STAGGER_FRAMES = 5
const COMPANION_ENTRY_FRAMES = 12
const ROLL_START_FRAME = 54
const ROLL_FRAMES = 186
const CLOSING_HOLD_FRAMES = 36
const ROLL_END_FRAME = ROLL_START_FRAME + ROLL_FRAMES

export const PROVIDER_CREDITS_DURATION_FRAMES =
  ROLL_END_FRAME + CLOSING_HOLD_FRAMES

/** Slow out of the hero, quick through the middle, park on the count. */
const ROLL_EASING = Easing.bezier(0.5, 0, 0.25, 1)
const ENTRY_EASING = Easing.bezier(0.16, 1, 0.3, 1)
const HERO_SPRING = { damping: 16, mass: 0.6, stiffness: 180 }
const ENTRY_RISE_PX = 26

/**
 * Ink only — no cards, no borders, no shadows. The opening and the ending are
 * white type on black, and a scene that puts chrome around its subject in the
 * middle of that reads as a different film.
 */
const ROW_RULE = "1px solid rgba(255,255,255,0.05)"
const NAME_INK = "rgba(255,255,255,0.72)"
const COMPANION_INK = "rgba(255,255,255,0.78)"
const SEPARATOR_INK = "rgba(255,255,255,0.28)"
const SEPARATOR = "·"

/**
 * Names dissolve at the frame edges instead of clipping, which is what makes a
 * roll read as a roll. The hero sits centred, so it never touches the fade.
 */
const TRACK_MASK =
  "linear-gradient(180deg, transparent 0%, black 15%, black 85%, transparent 100%)"

const Hero = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrySpring = spring({ config: HERO_SPRING, fps, frame })
  const entryOpacity = interpolate(
    frame,
    [FIRST_FRAME, HERO_ENTRY_FRAMES],
    [0, 1],
    {
      easing: ENTRY_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        height: HERO_BLOCK_HEIGHT,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          color: "#ffffff",
          fontFamily: SANS,
          fontSize: HERO_NAME_SIZE_PX,
          fontWeight: 700,
          letterSpacing: "-0.045em",
          lineHeight: 1,
          opacity: entryOpacity,
          transform: `translateY(${(1 - entrySpring) * ENTRY_RISE_PX}px)`,
        }}
      >
        {HERO.name}
      </div>

      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: COMPANION_GAP,
          marginTop: HERO_NAME_TO_COMPANIONS_GAP,
        }}
      >
        {COMPANIONS.map((name, index) => (
          <Companion key={name} index={index} name={name} />
        ))}
      </div>
    </div>
  )
}

type CompanionProps = {
  readonly index: number
  readonly name: string
}

/** The companions arrive one at a time, which is what says "and these too". */
const Companion = ({ index, name }: CompanionProps) => {
  const frame = useCurrentFrame()
  const entryFrame =
    frame - COMPANION_DELAY_FRAMES - index * COMPANION_STAGGER_FRAMES
  const entry = interpolate(
    entryFrame,
    [FIRST_FRAME, COMPANION_ENTRY_FRAMES],
    [0, 1],
    {
      easing: ENTRY_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        fontFamily: SANS,
        fontSize: COMPANION_SIZE_PX,
        fontWeight: 450,
        gap: COMPANION_GAP,
        letterSpacing: "-0.015em",
        lineHeight: 1,
        opacity: entry,
      }}
    >
      {index > 0 ? <span style={{ color: SEPARATOR_INK }}>{SEPARATOR}</span> : null}
      <span style={{ color: COMPANION_INK }}>{name}</span>
    </div>
  )
}

type NameColumnProps = {
  readonly names: readonly string[]
}

const NameColumn = ({ names }: NameColumnProps) => {
  return (
    <div style={{ width: NAME_COLUMN_WIDTH }}>
      {names.map((name) => (
        <div
          key={name}
          style={{
            alignItems: "center",
            borderBottom: ROW_RULE,
            boxSizing: "border-box",
            color: NAME_INK,
            display: "flex",
            fontFamily: SANS,
            fontSize: 26,
            fontWeight: 450,
            height: NAME_ROW_HEIGHT,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
      ))}
    </div>
  )
}

export const ProviderCreditsScene = () => {
  const frame = useCurrentFrame()
  const { height } = useVideoConfig()

  const frameCenter = height / CENTER_DIVISOR
  const heroOffset = frameCenter - HERO_BLOCK_CENTER
  const closingOffset = frameCenter - CLOSING_BLOCK_CENTER

  const rollOffset = interpolate(
    frame,
    [ROLL_START_FRAME, ROLL_END_FRAME],
    [heroOffset, closingOffset],
    {
      easing: ROLL_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )


  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          alignItems: "center",
          maskImage: TRACK_MASK,
          WebkitMaskImage: TRACK_MASK,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            transform: `translateY(${rollOffset}px)`,
            width: LIST_WIDTH,
          }}
        >
          <Hero />

          <div
            style={{
              display: "flex",
              gap: NAME_COLUMN_GAP,
              marginTop: COMPANIONS_TO_LIST_GAP,
            }}
          >
            {NAME_COLUMNS.map((names) => (
              <NameColumn key={names[0]} names={names} />
            ))}
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "column",
              height: CLOSING_BLOCK_HEIGHT,
              justifyContent: "center",
              marginTop: LIST_TO_CLOSING_GAP,
            }}
          >
            <div
              style={{
                color: "#ffffff",
                fontFamily: SANS,
                fontSize: CLOSING_HEADLINE_SIZE_PX,
                fontWeight: 700,
                letterSpacing: "-0.045em",
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {CLOSING.headline}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          backgroundImage: GRAIN_IMAGE,
          backgroundSize: `${GRAIN_SIZE}px ${GRAIN_SIZE}px`,
          opacity: GRAIN_OPACITY,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  )
}
