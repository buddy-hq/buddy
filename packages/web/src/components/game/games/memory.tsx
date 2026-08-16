import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@buddy/ui"
import { useGameStore } from "@/state/game-store"
import type { GameStatus } from "../game-dock"

type MemoryGameProps = {
  onStatusChange: (status: GameStatus) => void
}

const SYMBOLS = ["🍎", "🍌", "🍇", "🍓", "🍒", "🍑", "🍍", "🥑"]
const MATCH_REVEAL_DELAY_MS = 600
const MISMATCH_REVEAL_DELAY_MS = 1000

type Card = {
  id: number
  symbol: string
  flipped: boolean
  matched: boolean
}

export function MemoryGame({ onStatusChange }: MemoryGameProps) {
  const updateHighScore = useGameStore((state) => state.updateHighScore)
  const isPaused = useGameStore((state) => state.isPaused)
  const setPaused = useGameStore((state) => state.setPaused)
  const [cards, setCards] = useState<Card[]>([])
  const [flippedCards, setFlippedCards] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const timeoutIdsRef = useRef<number[]>([])

  const clearPendingTimeouts = useCallback(() => {
    for (const timeoutID of timeoutIdsRef.current) {
      window.clearTimeout(timeoutID)
    }
    timeoutIdsRef.current = []
  }, [])

  const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
    const timeoutID = window.setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutID)
      callback()
    }, delay)
    timeoutIdsRef.current = [...timeoutIdsRef.current, timeoutID]
  }, [])

  const initGame = useCallback(() => {
    clearPendingTimeouts()
    const duplicated = [...SYMBOLS, ...SYMBOLS]
    const shuffled = duplicated
      .toSorted(() => Math.random() - 0.5)
      .map((symbol, id) => ({ id, symbol, flipped: false, matched: false }))
    setCards(shuffled)
    setFlippedCards([])
    setMoves(0)
    setPaused(false)
  }, [clearPendingTimeouts, setPaused])

  useEffect(() => {
    initGame()
  }, [initGame])

  useEffect(() => clearPendingTimeouts, [clearPendingTimeouts])

  const handleCardClick = (id: number) => {
    if (isPaused) return
    const card = cards.find((c) => c.id === id)
    if (!card || card.flipped || card.matched || flippedCards.length >= 2) return

    const newCards = cards.map((c) => (c.id === id ? { ...c, flipped: true } : c))
    setCards(newCards)

    const newFlipped = [...flippedCards, id]
    setFlippedCards(newFlipped)

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1)
      const [firstId, secondId] = newFlipped
      const firstCard = cards.find((c) => c.id === firstId)
      const secondCard = cards.find((c) => c.id === secondId)

      if (firstCard && secondCard && firstCard.symbol === secondCard.symbol) {
        // Match found
        scheduleTimeout(() => {
          setCards((prev) =>
            prev.map((c) => (c.id === firstId || c.id === secondId ? { ...c, matched: true } : c)),
          )
          setFlippedCards([])

          // Check if game won
          setCards((currentCards) => {
            const allMatched = currentCards.every(
              (c) => c.matched || c.id === firstId || c.id === secondId,
            )
            if (allMatched) {
              updateHighScore("memory", moves + 1)
            }
            return currentCards
          })
        }, MATCH_REVEAL_DELAY_MS)
      } else {
        // No match
        scheduleTimeout(() => {
          setCards((prev) =>
            prev.map((c) => (c.id === firstId || c.id === secondId ? { ...c, flipped: false } : c)),
          )
          setFlippedCards([])
        }, MISMATCH_REVEAL_DELAY_MS)
      }
    }
  }

  // Keyboard support: Space to pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable)
      ) {
        return
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.stopPropagation()
        e.preventDefault()
      }
      if (e.key === " ") {
        if (moves > 0) {
          setPaused(!isPaused)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [isPaused, setPaused, moves])

  // Report moves and reset trigger to GameDock footer
  useEffect(() => {
    onStatusChange({
      scoreLabel: "Moves",
      scoreValue: moves,
      actionLabel: "Reset",
      onAction: initGame,
    })
  }, [moves, initGame, onStatusChange])

  const isGameWon = cards.length > 0 && cards.every((c) => c.matched)

  return (
    <div className="flex flex-col items-center w-full h-full min-h-0 justify-center">
      <div className="relative grid grid-cols-4 grid-rows-4 gap-2.5 bg-surface-inset-base p-2.5 rounded-2xl border border-border-weak-base shadow-inner aspect-square flex-1 min-h-0 max-h-[280px]">
        {cards.map((card) => (
          <motion.div
            key={card.id}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleCardClick(card.id)}
            className={cn(
              "relative w-full h-full aspect-square cursor-pointer flex items-center justify-center rounded-xl border text-xl sm:text-2xl transition-all duration-300 select-none overflow-hidden",
              card.flipped || card.matched
                ? "bg-surface-base border-border-base shadow-lg"
                : "bg-surface-weak border-border-weak-base hover:border-border-base hover:bg-surface-base-hover",
            )}
          >
            <AnimatePresence mode="wait">
              {card.flipped || card.matched ? (
                <motion.span
                  key="front"
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: -90, opacity: 0 }}
                  className={cn(card.matched && "opacity-40 grayscale-[0.5]")}
                >
                  {card.symbol}
                </motion.span>
              ) : (
                <motion.div
                  key="back"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="size-1.5 rounded-full bg-icon-weak-base"
                />
              )}
            </AnimatePresence>
          </motion.div>
        ))}

        {isGameWon && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background-base/80 backdrop-blur-sm z-30 rounded-2xl">
            <h4 className="text-xl font-black text-text-base mb-1 uppercase tracking-tighter">
              Nice!
            </h4>
            <p className="text-xs text-text-weak mb-4 font-medium">Completed in {moves} moves</p>
            <button
              onClick={initGame}
              className="px-6 py-2 rounded-xl bg-surface-interactive-base text-text-on-interactive-base text-xs font-black hover:scale-105 transition-transform cursor-pointer"
            >
              PLAY AGAIN
            </button>
          </div>
        )}

        {/* Local Pause Overlay */}
        <AnimatePresence>
          {isPaused && moves > 0 && !isGameWon && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPaused(false)}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface-raised-base/85 backdrop-blur-[6px] cursor-pointer select-none rounded-2xl"
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
