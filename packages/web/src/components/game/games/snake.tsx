import { useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@buddy/ui"
import { useGameStore } from "@/state/game-store"
import type { GameStatus } from "../game-dock"

type Point = { x: number; y: number }
type Level = 1 | 2 | 3

type SnakeProps = {
  onStatusChange: (status: GameStatus) => void
}

const GRID_SIZE = 20
const INITIAL_SNAKE: Point[] = [{ x: 10, y: 10 }]
const INITIAL_DIRECTION: Point = { x: 0, y: -1 }
const INITIAL_FOOD: Point = { x: 5, y: 5 }
const GRID_CELLS = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({
  x: index % GRID_SIZE,
  y: Math.floor(index / GRID_SIZE),
}))
const GRID_LINE_INDICES = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => index)

const SPEED_BY_LEVEL = {
  1: 170, // Slow
  2: 120, // Medium
  3: 75, // Fast
} satisfies Record<Level, number>

function isSamePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function createFood(blockedSegments: Point[]): Point {
  const availableCells = GRID_CELLS.filter(
    (cell) => !blockedSegments.some((segment) => isSamePoint(segment, cell)),
  )
  return availableCells[Math.floor(Math.random() * availableCells.length)] ?? INITIAL_FOOD
}

export function Snake({ onStatusChange }: SnakeProps) {
  const updateHighScore = useGameStore((state) => state.updateHighScore)
  const isPaused = useGameStore((state) => state.isPaused)
  const setPaused = useGameStore((state) => state.setPaused)
  const [level, setLevel] = useState<Level>(2)
  const [snake, setSnake] = useState<Point[]>(INITIAL_SNAKE)
  const [food, setFood] = useState<Point>(INITIAL_FOOD)
  const [gameOver, setGameOver] = useState(false)
  const [score, setScore] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)
  const directionRef = useRef<Point>(INITIAL_DIRECTION)
  const foodRef = useRef<Point>(INITIAL_FOOD)
  const scoreRef = useRef(0)
  const hasStartedRef = useRef(false)

  const moveSnake = useCallback(() => {
    if (gameOver || isPaused || !hasStarted) return

    setSnake((prevSnake) => {
      const head = prevSnake[0]
      if (!head) return prevSnake
      const direction = directionRef.current
      const currentFood = foodRef.current
      const newHead = {
        x: (head.x + direction.x + GRID_SIZE) % GRID_SIZE,
        y: (head.y + direction.y + GRID_SIZE) % GRID_SIZE,
      }

      const isGrowing = isSamePoint(newHead, currentFood)
      const collisionSegments = isGrowing ? prevSnake : prevSnake.slice(0, -1)
      if (collisionSegments.some((segment) => isSamePoint(segment, newHead))) {
        setGameOver(true)
        updateHighScore("snake", scoreRef.current)
        return prevSnake
      }

      const newSnake = isGrowing ? [newHead, ...prevSnake] : [newHead, ...prevSnake.slice(0, -1)]

      if (isGrowing) {
        const nextScore = scoreRef.current + 1
        const nextFood = createFood(newSnake)
        scoreRef.current = nextScore
        foodRef.current = nextFood
        setScore(nextScore)
        setFood(nextFood)
      }

      return newSnake
    })
  }, [gameOver, isPaused, updateHighScore, hasStarted])

  const resetGame = useCallback(() => {
    const nextFood = createFood(INITIAL_SNAKE)
    directionRef.current = INITIAL_DIRECTION
    foodRef.current = nextFood
    scoreRef.current = 0
    hasStartedRef.current = false
    setSnake(INITIAL_SNAKE)
    setFood(nextFood)
    setGameOver(false)
    setScore(0)
    setPaused(false)
    setHasStarted(false)
  }, [setPaused])

  useEffect(() => {
    if (!hasStarted || isPaused || gameOver) return
    const interval = window.setInterval(moveSnake, SPEED_BY_LEVEL[level])
    return () => {
      window.clearInterval(interval)
    }
  }, [gameOver, isPaused, level, moveSnake, hasStarted])

  const setDirectionIfAllowed = useCallback((nextDirection: Point) => {
    const currentDirection = directionRef.current
    const started = hasStartedRef.current
    const isSameAxis =
      (nextDirection.x !== 0 && currentDirection.x !== 0) ||
      (nextDirection.y !== 0 && currentDirection.y !== 0)
    if (started && isSameAxis) return

    directionRef.current = nextDirection
    hasStartedRef.current = true
    setHasStarted(true)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.stopPropagation()
        e.preventDefault()
      }

      switch (e.key) {
        case "ArrowUp":
          setDirectionIfAllowed({ x: 0, y: -1 })
          break
        case "ArrowDown":
          setDirectionIfAllowed({ x: 0, y: 1 })
          break
        case "ArrowLeft":
          setDirectionIfAllowed({ x: -1, y: 0 })
          break
        case "ArrowRight":
          setDirectionIfAllowed({ x: 1, y: 0 })
          break
        case " ":
          if (hasStarted) {
            setPaused(!isPaused)
          }
          break
      }
    }
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [isPaused, setPaused, hasStarted, setDirectionIfAllowed])

  // Report status updates to GameDock footer
  useEffect(() => {
    onStatusChange({
      scoreLabel: "Score",
      scoreValue: score,
      actionLabel: gameOver ? "Retry" : "Reset",
      onAction: resetGame,
      extraControls: (
        <div className="flex items-center gap-0.5 bg-surface-weak p-0.5 rounded-lg border border-border-weak-base">
          {([1, 2, 3] as Level[]).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevel(lvl)}
              disabled={gameOver || hasStarted}
              className={cn(
                "size-5 rounded text-[9px] font-bold transition-all select-none cursor-pointer flex items-center justify-center",
                level === lvl
                  ? "bg-surface-base text-text-base shadow-sm font-black"
                  : "text-text-weak hover:text-text-base hover:bg-surface-base-hover disabled:hover:bg-transparent disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              L{lvl}
            </button>
          ))}
        </div>
      ),
    })
  }, [score, gameOver, level, hasStarted, resetGame, onStatusChange])

  return (
    <div className="flex flex-col items-center w-full h-full min-h-0 justify-center">
      <div
        className="relative aspect-square h-full max-h-[280px] bg-surface-inset-base rounded-xl border border-border-weak-base overflow-hidden shadow-inner flex-1 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
        }}
      >
        {/* Subtle grid lines */}
        <div className="absolute inset-0 grid grid-cols-20 grid-rows-20 pointer-events-none opacity-[0.05]">
          {GRID_LINE_INDICES.map((i) => (
            <div key={i} className="border-[0.5px] border-border-base" />
          ))}
        </div>

        {snake.map((segment, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={`${segment.x}-${segment.y}-${i}`}
            className={cn(
              "absolute w-[5%] h-[5%] rounded-[3px] transition-all duration-150",
              i === 0 ? "bg-text-interactive-base shadow-lg z-10" : "bg-text-interactive-base/40",
            )}
            style={{
              left: `${(segment.x / GRID_SIZE) * 100}%`,
              top: `${(segment.y / GRID_SIZE) * 100}%`,
            }}
          >
            {i === 0 && (
              <div className="absolute top-1 left-1 size-1 bg-background-base rounded-full opacity-50" />
            )}
          </div>
        ))}

        <div
          className="absolute w-[5%] h-[5%] rounded-full bg-surface-critical-strong shadow-lg animate-pulse"
          style={{
            left: `${(food.x / GRID_SIZE) * 100}%`,
            top: `${(food.y / GRID_SIZE) * 100}%`,
          }}
        >
          <div className="absolute top-0.5 left-0.5 size-1 bg-background-base rounded-full opacity-40" />
        </div>

        {/* Start Game Helper Overlay */}
        {!hasStarted && !gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background-base/30 backdrop-blur-[2px] z-20 pointer-events-none">
            <p className="text-[10px] text-text-base bg-surface-base px-2.5 py-1 rounded-full border border-border-weak-base shadow-sm font-bold animate-pulse">
              Press any arrow key to play
            </p>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background-base/80 backdrop-blur-sm z-30">
            <h4 className="text-xl font-black text-text-base mb-1 uppercase tracking-tighter">
              Ouch!
            </h4>
            <p className="text-xs text-text-weak mb-4 font-medium">Final Score: {score}</p>
            <button
              onClick={resetGame}
              className="px-6 py-2 rounded-xl bg-surface-interactive-base text-text-on-interactive-base text-xs font-black hover:scale-105 transition-transform cursor-pointer"
            >
              PLAY AGAIN
            </button>
          </div>
        )}

        {/* Local Pause Overlay */}
        <AnimatePresence>
          {isPaused && hasStarted && !gameOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPaused(false)}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface-raised-base/85 backdrop-blur-[6px] cursor-pointer select-none"
            >
              <div className="flex flex-col items-center gap-1 text-center animate-in fade-in zoom-in-95 duration-200">
                <span className="text-[10px] tracking-[0.2em] font-extrabold text-text-weak uppercase">
                  Paused
                </span>
                <p className="text-xs font-medium text-text-base opacity-60">
                  Click anywhere or press Space to resume
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
