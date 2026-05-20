import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@buddy/ui"
import { XIcon, Gamepad2Icon, TrophyIcon, MinusIcon } from "lucide-react"
import { Snake } from "./games/snake"
import { ReactionTime } from "./games/reaction"
import { MemoryGame } from "./games/memory"
import { useGameStore, type GameType } from "@/state/game-store"

type GameDockProps = {
  onClose: () => void
  onMinimize: () => void
  className?: string
}

export type GameStatus = {
  scoreLabel: string
  scoreValue: string | number
  actionLabel: string
  onAction: () => void
  extraControls?: React.ReactNode
}

const GAME_TABS: Array<{ id: GameType; label: string }> = [
  { id: "snake", label: "Snake" },
  { id: "reaction", label: "Reflex" },
  { id: "memory", label: "Pairs" },
]

export function GameDock({ onClose, onMinimize, className }: GameDockProps) {
  const dockRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<GameType>("snake")
  const highScores = useGameStore((state) => state.highScores)
  const [gameStatus, setGameStatus] = useState<GameStatus | null>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      dockRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      ref={dockRef}
      tabIndex={-1}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-border-base bg-surface-raised-base backdrop-blur-xl shadow-lg h-[440px] mb-0 outline-none",
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(10px)" }}
        className="flex flex-col flex-1 h-full min-h-0"
      >
        {/* Header */}
        <div className="relative flex items-center justify-between px-4 py-2 border-b border-border-weak-base bg-surface-base/50 gap-4">
          {/* Navigation Tabs on the Start */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex h-8 items-center gap-4 bg-transparent p-0 border-0 shrink-0">
              {GAME_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative px-1 py-0.5 text-[11px] font-semibold transition-all duration-150 cursor-pointer border-0 rounded-none bg-transparent shadow-none outline-none select-none",
                    activeTab === tab.id
                      ? "text-text-base font-bold"
                      : "text-text-weak hover:text-text-base",
                  )}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute -bottom-[9px] left-0 right-0 h-[2px] bg-text-base"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Centered Buddy Arcade Banner */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none hidden sm:flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-weak border border-border-weak-base shadow-sm">
            <Gamepad2Icon className="size-3 text-text-weak" />
            <h3 className="text-[9px] font-black tracking-wider text-text-base uppercase">
              Buddy Arcade
            </h3>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onMinimize}
              className="rounded-full size-6 flex items-center justify-center text-text-weak hover:bg-surface-base-hover hover:text-text-base transition-all active:scale-95"
            >
              <MinusIcon className="size-3" />
            </button>
            <button
              onClick={onClose}
              className="rounded-full size-6 flex items-center justify-center text-text-weak hover:bg-surface-critical-base/10 hover:text-text-on-critical-base transition-all active:scale-95"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        </div>

        {/* Game Stage */}
        <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1, y: -10 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="w-full h-full flex items-center justify-center min-h-0"
            >
              {activeTab === "snake" && <Snake onStatusChange={setGameStatus} />}
              {activeTab === "reaction" && <ReactionTime onStatusChange={setGameStatus} />}
              {activeTab === "memory" && <MemoryGame onStatusChange={setGameStatus} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Info */}
        <div className="px-5 py-3 border-t border-border-weak-base bg-surface-base/30 shrink-0 min-h-[52px] flex items-center">
          {gameStatus ? (
            <div className="flex items-center justify-between w-full">
              {/* Score and level/controls */}
              <div className="flex items-center gap-5">
                {/* Current Score */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-text-weak uppercase tracking-wider">
                    {gameStatus.scoreLabel}:
                  </span>
                  <span className="text-sm font-black text-text-base tabular-nums leading-none">
                    {gameStatus.scoreValue}
                  </span>
                </div>

                {/* Best Score */}
                <div className="flex items-center gap-2 border-l border-border-weak-base pl-5">
                  <TrophyIcon className="size-3 text-icon-warning-base" />
                  <span className="text-[9px] font-bold text-text-weak uppercase tracking-wider">
                    Best:
                  </span>
                  <span className="text-sm font-black text-text-base tabular-nums leading-none">
                    {highScores[activeTab]}
                  </span>
                </div>

                {/* Extra controls (e.g. Snake level selector) */}
                {gameStatus.extraControls && (
                  <div className="flex items-center gap-1.5 border-l border-border-weak-base pl-5">
                    {gameStatus.extraControls}
                  </div>
                )}
              </div>

              {/* Game reset/action button */}
              <button
                onClick={gameStatus.onAction}
                className="rounded-xl bg-surface-weak border border-border-weak-base px-4 py-2 text-xs font-bold text-text-base hover:bg-surface-base-hover transition-all active:scale-95 shadow-sm cursor-pointer"
              >
                {gameStatus.actionLabel}
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-text-weak font-medium">Initializing...</span>
          )}
        </div>
      </motion.div>
    </div>
  )
}
