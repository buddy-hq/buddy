import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@buddy/ui"
import { useGameStore } from "@/state/game-store"
import type { GameStatus } from "../game-dock"

type ReactionTimeProps = {
  onStatusChange: (status: GameStatus) => void
}

export function ReactionTime({ onStatusChange }: ReactionTimeProps) {
  const updateHighScore = useGameStore((state) => state.updateHighScore)
  const isPaused = useGameStore((state) => state.isPaused)
  const setPaused = useGameStore((state) => state.setPaused)
  const [state, setState] = useState<"idle" | "waiting" | "ready" | "result">("idle")
  const [startTime, setStartTime] = useState(0)
  const [result, setResult] = useState(0)
  const timeoutRef = useRef<number | null>(null)

  const startTest = useCallback(() => {
    if (isPaused) setPaused(false)
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    setState("waiting")
    const delay = 1500 + Math.random() * 3000
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      setState("ready")
      setStartTime(Date.now())
    }, delay)
  }, [isPaused, setPaused])

  const handleClick = useCallback(
    (e?: React.MouseEvent | KeyboardEvent) => {
      if (e) {
        e.stopPropagation()
        if (e instanceof KeyboardEvent && e.key !== " ") return
      }

      if (state === "waiting") {
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        setState("idle")
      } else if (state === "ready") {
        const diff = Date.now() - startTime
        setResult(diff)
        updateHighScore("reaction", diff)
        setState("result")
      } else if (state === "idle" || state === "result") {
        startTest()
      }
    },
    [state, startTime, updateHighScore, startTest],
  )

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return
      }

      if (e.key === " ") {
        e.preventDefault()
        e.stopPropagation()
        if (isPaused) {
          // If we are showing the pause overlay, allow resuming
          if (state === "waiting" || state === "ready") {
            setPaused(false)
          }
        } else {
          handleClick(e)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown, true)
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [isPaused, state, setPaused, handleClick])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  // Report changes to footer
  useEffect(() => {
    let scoreValue: string | number = "-"
    if (state === "waiting") scoreValue = "..."
    else if (state === "ready") scoreValue = "NOW!"
    else if (state === "result") scoreValue = `${result}ms`

    let actionLabel = "Start"
    if (state === "waiting") actionLabel = "Cancel"
    else if (state === "ready") actionLabel = "Tap!"
    else if (state === "result") actionLabel = "Retry"

    onStatusChange({
      scoreLabel: "Reflex",
      scoreValue,
      actionLabel,
      onAction: handleClick,
    })
  }, [state, result, handleClick, onStatusChange])

  return (
    <div className="flex flex-col items-center w-full h-full min-h-0 justify-center">
      <div
        onClick={() => handleClick()}
        className={cn(
          "relative flex flex-1 w-full max-w-[420px] max-h-[280px] min-h-0 cursor-pointer flex-col items-center justify-center rounded-2xl transition-all duration-300 text-center p-6 select-none overflow-hidden border shadow-xl",
          state === "idle" && "bg-surface-weak border-border-weak-base hover:bg-surface-base-hover",
          state === "waiting" && "bg-surface-critical-weak border-border-critical-base/20",
          state === "ready" && "bg-surface-success-strong border-border-success-base shadow-lg",
          state === "result" &&
            "bg-surface-interactive-weak border-border-interactive-base/20 hover:bg-surface-interactive-base/10",
        )}
      >
        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center"
            >
              <div className="size-12 rounded-full bg-surface-base flex items-center justify-center mb-4 border border-border-weak-base shadow-sm">
                <div className="size-2 bg-icon-interactive-base rounded-full animate-ping" />
              </div>
              <h4 className="text-lg font-black text-text-base tracking-tighter uppercase">
                Reflex Test
              </h4>
              <p className="text-xs text-text-weak font-medium mt-1">Tap to start</p>
            </motion.div>
          )}
          {state === "waiting" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center"
            >
              <h4 className="text-2xl font-black text-text-on-critical-base tracking-tighter uppercase animate-pulse">
                Wait...
              </h4>
              <p className="text-xs text-text-on-critical-base/60 font-bold mt-1 uppercase tracking-widest">
                Wait for green
              </p>
            </motion.div>
          )}
          {state === "ready" && (
            <motion.div
              initial={{ opacity: 0, scale: 1.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center"
            >
              <h4 className="text-4xl font-black text-text-on-success-base tracking-tighter uppercase">
                NOW!
              </h4>
            </motion.div>
          )}
          {state === "result" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center"
            >
              <span className="text-[10px] font-black text-text-interactive-base uppercase tracking-widest mb-1">
                Response Time
              </span>
              <h4 className="text-5xl font-black text-text-base tracking-tighter tabular-nums">
                {result}
                <span className="text-sm ml-1 text-text-weak">ms</span>
              </h4>
              <p className="text-xs text-text-weak font-bold mt-4 bg-surface-base px-4 py-1.5 rounded-full border border-border-weak-base shadow-sm">
                Try to beat it
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Glossy overlay */}
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none opacity-20" />

        {/* Local Pause Overlay */}
        <AnimatePresence>
          {isPaused && (state === "waiting" || state === "ready") && (
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
