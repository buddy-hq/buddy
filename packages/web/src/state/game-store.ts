import { create } from "zustand"
import { persist } from "zustand/middleware"

export type GameType = "snake" | "reaction" | "memory"

type HighScores = Record<GameType, number>

type GameStore = {
  isGameVisible: boolean
  isPaused: boolean
  isMinimized: boolean
  isBallVisible: boolean
  highScores: HighScores
  setGameVisible: (visible: boolean) => void
  setPaused: (paused: boolean) => void
  setMinimized: (minimized: boolean) => void
  setIsBallVisible: (visible: boolean) => void
  updateHighScore: (game: GameType, score: number) => void
}

export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
      isGameVisible: false,
      isPaused: false,
      isMinimized: false,
      isBallVisible: false,
      highScores: {
        snake: 0,
        reaction: 0,
        memory: 0,
      },
      setGameVisible: (visible) => set({ isGameVisible: visible }),
      setPaused: (paused) => set({ isPaused: paused }),
      setMinimized: (minimized) => set({ isMinimized: minimized }),
      setIsBallVisible: (visible) => set({ isBallVisible: visible }),
      updateHighScore: (game, score) =>
        set((state) => {
          const current = state.highScores[game]
          let updated = false
          if (game === "snake") {
            if (score > current) updated = true
          } else {
            // For reaction and memory, if current is 0, any valid score is better.
            // Otherwise, a lower score is better.
            if (current === 0 || score < current) updated = true
          }

          if (updated) {
            return {
              highScores: {
                ...state.highScores,
                [game]: score,
              },
            }
          }
          return state
        }),
    }),
    {
      name: "buddy-game-store",
      partialize: (state) => ({
        highScores: state.highScores,
      }),
    },
  ),
)
