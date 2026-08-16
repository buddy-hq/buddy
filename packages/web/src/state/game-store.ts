import { create } from "zustand"
import { persist } from "zustand/middleware"
import { parseBuddyConfigObject, parseFiniteNumber } from "./parse-external"

export const GAME_PROMPT_PREFERENCE_STANDARD = "standard"
export const GAME_PROMPT_PREFERENCE_REDUCED = "reduced"
export const GAME_PROMPT_PREFERENCE_DISABLED = "disabled"

export const STANDARD_GAME_PROMPT_DELAY_MS = 120_000
export const REDUCED_GAME_PROMPT_DELAY_MS = 300_000
export const STANDARD_GAME_PROMPT_COOLDOWN_MS = 4 * 60 * 60 * 1000
export const REDUCED_GAME_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000
export const GAME_PROMPT_DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000

export type TGameType = "snake" | "reaction" | "memory"
export type TGamePromptPreference =
  | typeof GAME_PROMPT_PREFERENCE_STANDARD
  | typeof GAME_PROMPT_PREFERENCE_REDUCED
  | typeof GAME_PROMPT_PREFERENCE_DISABLED

type THighScores = Record<TGameType, number>

type TGameStore = {
  isGameVisible: boolean
  isPaused: boolean
  isMinimized: boolean
  isBallVisible: boolean
  highScores: THighScores
  gamePromptPreference: TGamePromptPreference
  gamePromptDismissedUntil: number | null
  gamePromptLastShownAt: number | null
  setGameVisible: (visible: boolean) => void
  setPaused: (paused: boolean) => void
  setMinimized: (minimized: boolean) => void
  setIsBallVisible: (visible: boolean) => void
  setGamePromptPreference: (preference: TGamePromptPreference) => void
  dismissGamePrompt: (now?: number) => void
  markGamePromptShown: (now?: number) => void
  clearGamePromptDismissal: () => void
  updateHighScore: (game: TGameType, score: number) => void
}

function parseGamePromptPreference<TValue>(value: TValue): TGamePromptPreference {
  if (value === GAME_PROMPT_PREFERENCE_REDUCED) return GAME_PROMPT_PREFERENCE_REDUCED
  if (value === GAME_PROMPT_PREFERENCE_DISABLED) return GAME_PROMPT_PREFERENCE_DISABLED
  return GAME_PROMPT_PREFERENCE_STANDARD
}

function parseTimestamp<TValue>(value: TValue): number | null {
  return parseFiniteNumber(value) ?? null
}

function parseHighScores<TValue>(value: TValue, fallback: THighScores) {
  const record = parseBuddyConfigObject(value)
  if (!record) return fallback

  return {
    snake: parseFiniteNumber(record.snake) ?? fallback.snake,
    reaction: parseFiniteNumber(record.reaction) ?? fallback.reaction,
    memory: parseFiniteNumber(record.memory) ?? fallback.memory,
  }
}

export function getGamePromptDelayMs(preference: TGamePromptPreference): number {
  if (preference === GAME_PROMPT_PREFERENCE_REDUCED) return REDUCED_GAME_PROMPT_DELAY_MS
  return STANDARD_GAME_PROMPT_DELAY_MS
}

export function getGamePromptCooldownMs(preference: TGamePromptPreference): number {
  if (preference === GAME_PROMPT_PREFERENCE_REDUCED) return REDUCED_GAME_PROMPT_COOLDOWN_MS
  return STANDARD_GAME_PROMPT_COOLDOWN_MS
}

export const useGameStore = create<TGameStore>()(
  persist(
    (set) => ({
      isGameVisible: false,
      isPaused: false,
      isMinimized: false,
      isBallVisible: false,
      gamePromptPreference: GAME_PROMPT_PREFERENCE_STANDARD,
      gamePromptDismissedUntil: null,
      gamePromptLastShownAt: null,
      highScores: {
        snake: 0,
        reaction: 0,
        memory: 0,
      },
      setGameVisible: (visible) => set({ isGameVisible: visible }),
      setPaused: (paused) => set({ isPaused: paused }),
      setMinimized: (minimized) => set({ isMinimized: minimized }),
      setIsBallVisible: (visible) => set({ isBallVisible: visible }),
      setGamePromptPreference: (preference) =>
        set({
          gamePromptPreference: preference,
          gamePromptDismissedUntil: null,
        }),
      dismissGamePrompt: (now = Date.now()) =>
        set({ gamePromptDismissedUntil: now + GAME_PROMPT_DISMISS_COOLDOWN_MS }),
      markGamePromptShown: (now = Date.now()) => set({ gamePromptLastShownAt: now }),
      clearGamePromptDismissal: () => set({ gamePromptDismissedUntil: null }),
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
      merge(persistedState, currentState) {
        const record = parseBuddyConfigObject(persistedState)
        if (!record) return currentState

        return {
          ...currentState,
          highScores: parseHighScores(record.highScores, currentState.highScores),
          gamePromptPreference: parseGamePromptPreference(record.gamePromptPreference),
          gamePromptDismissedUntil: parseTimestamp(record.gamePromptDismissedUntil),
          gamePromptLastShownAt: parseTimestamp(record.gamePromptLastShownAt),
        }
      },
      partialize: (state) => ({
        highScores: state.highScores,
        gamePromptPreference: state.gamePromptPreference,
        gamePromptDismissedUntil: state.gamePromptDismissedUntil,
        gamePromptLastShownAt: state.gamePromptLastShownAt,
      }),
    },
  ),
)
