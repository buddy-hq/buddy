import { useId, useLayoutEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"
import { cn } from "@buddy/ui"
import { seedPhase } from "./seed-phase"

/**
 * Conway's Game of Life glider on a 5×5 torus, used as a working indicator.
 *
 * A glider translates one cell diagonally every four generations, so on a 5×5
 * torus it returns to its starting position after exactly twenty — the loop is
 * seamless by construction rather than by a fade. Cells inherit `currentColor`,
 * so the host sets the colour the same way it would for an icon.
 *
 * Generations are precomputed once at module load. Running instances share one
 * clock and update their cells directly, so transcript React trees do not
 * rerender on every generation.
 */

const GRID = 5
const GENERATIONS = 20
/**
 * One generation per step; the transition runs the full step, so the board
 * morphs rather than blinks. 190ms puts a full 20-generation lap at 3.8s.
 */
const STEP_MS = 190

/*
 * Cell geometry, all proportional so the figure reads identically at 16px or
 * 48px.
 *
 * The grid is 5×5 and cannot go lower: that is the smallest torus a glider
 * survives on — on 4×4 it wraps into its own tail within a couple of
 * generations and collapses into a still life.
 *
 * The dim dead cells are load-bearing, twice over. They are the board the
 * pattern lives on — without them the live cells read as five unrelated dots
 * drifting in space — and they are the indicator's bounding shape. Siblings run
 * on different seeded phases, so the live cells sit in a different corner on
 * every card; the board is what keeps the glyph column from reading ragged down
 * a stack, which is the job a box or a backing surface would otherwise do. It
 * has to be faint enough to stay quiet and solid enough to hold that footprint.
 *
 * A dead cell is both dimmed and shrunk; the shrink is what gives the live
 * cells their definition, since fading alone turns the board to mush.
 */
const CELL_SPAN = 100 / GRID
const CELL_FILL = CELL_SPAN * 0.78
const CELL_INSET = (CELL_SPAN - CELL_FILL) / 2
const DEAD_OPACITY = 0.14
const DEAD_SCALE = 0.545

/** Standard glider, seeded in the top-left corner. Translates, never settles. */
const GLIDER_SEED: [number, number][] = [
  [1, 0],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
]

/**
 * The tub — a still life, and the terminal state of the indicator.
 *
 *     . X .
 *     X . X
 *     . X .
 *
 * Each live cell has exactly two live neighbours so it survives; the hole in
 * the middle has four, and four is not three, so nothing is ever born there.
 * It holds forever.
 *
 * The obvious choice is the block, Life's most famous still life, but a 2×2
 * cannot centre on a 5×5 board — it lands a half-cell up and left, and a
 * terminal state that looks nudged into a corner reads as a mistake. The tub is
 * 3×3 with four-fold symmetry, so it sits dead centre and is symmetric about
 * both axes.
 */
const TUB_SEED: [number, number][] = [
  [2, 1],
  [1, 2],
  [3, 2],
  [2, 3],
]

const CELLS = Array.from({ length: GRID * GRID }, (_, index) => ({
  id: `cell-${index}`,
  index,
  x: index % GRID,
  y: Math.floor(index / GRID),
}))

function seedGrid(seed: [number, number][]): boolean[] {
  const cells = Array.from({ length: GRID * GRID }, () => false)
  for (const [x, y] of seed) cells[y * GRID + x] = true
  return cells
}

/** Life on a torus: every cell has eight neighbours, edges wrap. */
function nextGeneration(cells: boolean[]): boolean[] {
  return cells.map((alive, index) => {
    const x = index % GRID
    const y = Math.floor(index / GRID)
    let neighbours = 0

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nx = (x + dx + GRID) % GRID
        const ny = (y + dy + GRID) % GRID
        if (cells[ny * GRID + nx]) neighbours += 1
      }
    }

    return neighbours === 3 || (alive && neighbours === 2)
  })
}

const GLIDER_FRAMES: boolean[][] = (() => {
  const frames = [seedGrid(GLIDER_SEED)]
  for (let generation = 1; generation < GENERATIONS; generation += 1) {
    frames.push(nextGeneration(frames[generation - 1]))
  }
  return frames
})()

const STILL_FRAME = seedGrid(TUB_SEED)

type GliderClockListener = (tick: number, offset: number) => void

const gliderClockListeners = new Map<GliderClockListener, number>()
let gliderClockTimer: ReturnType<typeof setInterval> | undefined
let gliderClockTick = 0

function reserveGliderOffset(preferredOffset: number): number {
  const reservedOffsets = new Set(gliderClockListeners.values())
  for (let distance = 0; distance < GENERATIONS; distance += 1) {
    const candidate = (preferredOffset + distance) % GENERATIONS
    if (!reservedOffsets.has(candidate)) return candidate
  }
  return preferredOffset
}

function subscribeToGliderClock(
  preferredOffset: number,
  listener: GliderClockListener,
): () => void {
  if (gliderClockListeners.size === 0) {
    gliderClockTick = 0
  }
  const offset = reserveGliderOffset(preferredOffset)
  gliderClockListeners.set(listener, offset)
  listener(gliderClockTick, offset)

  gliderClockTimer ??= setInterval(() => {
    gliderClockTick = (gliderClockTick + 1) % GENERATIONS
    for (const [currentListener, currentOffset] of gliderClockListeners) {
      currentListener(gliderClockTick, currentOffset)
    }
  }, STEP_MS)

  return () => {
    gliderClockListeners.delete(listener)
    if (gliderClockListeners.size > 0 || gliderClockTimer === undefined) return
    clearInterval(gliderClockTimer)
    gliderClockTimer = undefined
  }
}

function drawFrame(nodes: Array<HTMLSpanElement | null>, frame: boolean[]): void {
  for (const cell of CELLS) {
    const node = nodes[cell.index]
    if (!node) continue
    const alive = frame[cell.index]
    node.style.opacity = String(alive ? 1 : DEAD_OPACITY)
    node.style.transform = `scale(${alive ? 1 : DEAD_SCALE})`
  }
}

export type ConwayPattern = "glider" | "still"

type ConwayGliderProps = {
  className?: string
  /** Stable start phase, so siblings in a fan-out never march in lockstep. */
  seed?: string
  /** `glider` runs; `still` is the settled tub and never ticks. */
  pattern?: ConwayPattern
}

export function ConwayGlider({ className, seed, pattern = "glider" }: ConwayGliderProps) {
  const reduced = useReducedMotion() === true
  const settled = pattern === "still"
  const frozen = settled || reduced
  const instanceSeed = useId()
  const cellNodesRef = useRef<Array<HTMLSpanElement | null>>([])

  /*
   * The shared clock only supplies time. Each instance keeps its own seed-based
   * offset, so fan-out siblings begin on different generations without owning
   * separate timers. Callers may replace a placeholder seed after mount, so the
   * offset is derived on every render instead of captured once.
   */
  const offset = seedPhase(seed ?? instanceSeed, GENERATIONS)
  const initialFrame = settled ? STILL_FRAME : GLIDER_FRAMES[offset]

  useLayoutEffect(() => {
    if (frozen) {
      drawFrame(cellNodesRef.current, initialFrame)
      return
    }
    return subscribeToGliderClock(offset, (tick, reservedOffset) => {
      drawFrame(cellNodesRef.current, GLIDER_FRAMES[(tick + reservedOffset) % GENERATIONS])
    })
  }, [frozen, initialFrame, offset])

  return (
    <span
      data-component="conway-glider"
      className={cn("relative inline-block shrink-0", className)}
      aria-hidden="true"
    >
      {CELLS.map((cell) => {
        const alive = initialFrame[cell.index]
        return (
          <span
            key={cell.id}
            ref={(node) => {
              cellNodesRef.current[cell.index] = node
            }}
            className="absolute bg-current"
            style={{
              left: `${cell.x * CELL_SPAN + CELL_INSET}%`,
              top: `${cell.y * CELL_SPAN + CELL_INSET}%`,
              width: `${CELL_FILL}%`,
              height: `${CELL_FILL}%`,
              borderRadius: "22%",
              opacity: alive ? 1 : DEAD_OPACITY,
              transform: `scale(${alive ? 1 : DEAD_SCALE})`,
              transition: `opacity ${STEP_MS}ms ease-in-out, transform ${STEP_MS}ms ease-in-out`,
            }}
          />
        )
      })}
    </span>
  )
}
