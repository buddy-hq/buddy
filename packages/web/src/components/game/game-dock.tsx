import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  ComposerDock,
  ComposerDockHeader,
  ComposerDockTitle,
  ComposerDockActions,
  ComposerDockBody,
  ComposerDockFooter,
  cn,
} from "@buddy/ui"
import { XIcon, Gamepad2Icon, TrophyIcon, MinusIcon } from "@/icons/app-icons"
import { Snake } from "./games/snake"
import { ReactionTime } from "./games/reaction"
import { MemoryGame } from "./games/memory"
import { useGameStore, type TGameType } from "@/state/game-store"

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

const GAME_TABS: Array<{ id: TGameType; label: string }> = [
  { id: "snake", label: "Snake" },
  { id: "reaction", label: "Reflex" },
  { id: "memory", label: "Pairs" },
]

export function GameDock({ onClose, onMinimize, className }: GameDockProps) {
  const [activeTab, setActiveTab] = useState<TGameType>("snake")
  const highScores = useGameStore((state) => state.highScores)
  const [gameStatus, setGameStatus] = useState<GameStatus | null>(null)

  return (
    <ComposerDock size="md" className={className}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(10px)" }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ComposerDockHeader>
          {/* Navigation Tabs on the Start */}
          <div className="flex shrink-0 items-center gap-4">
            <div className="flex h-8 shrink-0 items-center gap-4 border-0 bg-transparent p-0">
              {GAME_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative border-0 bg-transparent px-1 py-0.5 text-[11px] font-semibold tracking-wide shadow-none outline-none transition-all duration-150 select-none",
                    activeTab === tab.id
                      ? "font-bold text-text-base"
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

          <ComposerDockTitle icon={Gamepad2Icon} title="Buddy Arcade" />

          <ComposerDockActions>
            <button
              onClick={onMinimize}
              className="flex size-6 items-center justify-center rounded-full text-text-weak transition-all hover:bg-surface-base-hover hover:text-text-base active:scale-95"
            >
              <MinusIcon className="size-3" />
            </button>
            <button
              onClick={onClose}
              className="flex size-6 items-center justify-center rounded-full text-text-weak transition-all hover:bg-surface-critical-base/10 hover:text-text-on-critical-base active:scale-95"
            >
              <XIcon className="size-3" />
            </button>
          </ComposerDockActions>
        </ComposerDockHeader>

        <ComposerDockBody padded>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1, y: -10 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="flex min-h-0 h-full w-full items-center justify-center"
            >
              {activeTab === "snake" && <Snake onStatusChange={setGameStatus} />}
              {activeTab === "reaction" && <ReactionTime onStatusChange={setGameStatus} />}
              {activeTab === "memory" && <MemoryGame onStatusChange={setGameStatus} />}
            </motion.div>
          </AnimatePresence>
        </ComposerDockBody>

        <ComposerDockFooter>
          {gameStatus ? (
            <div className="flex w-full items-center justify-between">
              {/* Score and level/controls */}
              <div className="flex items-center gap-5">
                {/* Current Score */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-text-weak">
                    {gameStatus.scoreLabel}:
                  </span>
                  <span className="text-sm font-black leading-none tabular-nums text-text-base">
                    {gameStatus.scoreValue}
                  </span>
                </div>

                {/* Best Score */}
                <div className="flex items-center gap-2 border-l border-border-weak-base pl-5">
                  <TrophyIcon className="size-3 text-icon-warning-base" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-text-weak">
                    Best:
                  </span>
                  <span className="text-sm font-black leading-none tabular-nums text-text-base">
                    {highScores[activeTab]}
                  </span>
                </div>

                {/* Extra controls */}
                {gameStatus.extraControls && (
                  <div className="flex items-center gap-1.5 border-l border-border-weak-base pl-5">
                    {gameStatus.extraControls}
                  </div>
                )}
              </div>

              {/* Game reset/action button */}
              <button
                onClick={gameStatus.onAction}
                className="cursor-pointer rounded-xl border border-border-weak-base bg-surface-weak px-4 py-2 text-xs font-bold text-text-base shadow-sm transition-all hover:bg-surface-base-hover active:scale-95"
              >
                {gameStatus.actionLabel}
              </button>
            </div>
          ) : (
            <span className="text-[10px] font-medium text-text-weak">Initializing...</span>
          )}
        </ComposerDockFooter>
      </motion.div>
    </ComposerDock>
  )
}
