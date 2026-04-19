import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import { createPlatformJsonStorage } from "../context/platform"
import { getPromptScopeKey } from "./prompt-store"

const MODEL_SELECTION_STORAGE_FILE = "buddy.model-selection.dat"
export const MODEL_SELECTION_STORAGE_KEY = "buddy.model-selection.v1"
const RECENT_MODEL_LIMIT = 5

type ModelSelectionStore = {
  selectionSourceByKey: Record<string, "local" | "restored">
  restoredSelectionCreatedAtByKey: Record<string, number>
  selectedAgentByKey: Record<string, string>
  selectedModelByKey: Record<string, string>
  selectedVariantByKey: Record<string, string | null>
  recentModelKeys: string[]
  setSelectedAgent: (key: string, agent: string | undefined) => void
  setSelectedModel: (key: string, model: string | undefined) => void
  setSelectedVariant: (key: string, variant: string | null | undefined) => void
  pushRecentModelKey: (model: string) => void
  clearSelectedModel: (key: string) => void
  restoreSessionSelection: (
    key: string,
    selection: {
      agent?: string
      model?: string
      variant?: string | null
      messageCreatedAt?: number
    },
  ) => void
  migrateWorkspaceSelection: (directory: string, sessionID: string) => void
}

export function getModelSelectionScopeKey(directory: string, sessionID?: string) {
  return getPromptScopeKey(directory, sessionID)
}

export function getSelectedModelKey(
  state: Pick<ModelSelectionStore, "selectedModelByKey">,
  key: string,
) {
  return state.selectedModelByKey[key]
}

export function getSelectedAgentKey(
  state: Pick<ModelSelectionStore, "selectedAgentByKey">,
  key: string,
) {
  return state.selectedAgentByKey[key]
}

export function getSelectedVariantKey(
  state: Pick<ModelSelectionStore, "selectedVariantByKey">,
  key: string,
) {
  return state.selectedVariantByKey[key]
}

export const useModelSelectionStore = create<ModelSelectionStore>()(
  persist(
    immer((set) => ({
      selectionSourceByKey: {} as Record<string, "local" | "restored">,
      restoredSelectionCreatedAtByKey: {} as Record<string, number>,
      selectedAgentByKey: {} as Record<string, string>,
      selectedModelByKey: {} as Record<string, string>,
      selectedVariantByKey: {} as Record<string, string | null>,
      recentModelKeys: [] as string[],
      setSelectedAgent(key, agent) {
        const nextAgent = agent?.trim()
        set((state) => {
          state.selectionSourceByKey[key] = "local"
          delete state.restoredSelectionCreatedAtByKey[key]
          if (!nextAgent) {
            delete state.selectedAgentByKey[key]
            return
          }
          state.selectedAgentByKey[key] = nextAgent
        })
      },
      setSelectedModel(key, model) {
        const nextModel = model?.trim()
        set((state) => {
          state.selectionSourceByKey[key] = "local"
          delete state.restoredSelectionCreatedAtByKey[key]
          if (!nextModel) {
            delete state.selectedModelByKey[key]
            return
          }
          state.selectedModelByKey[key] = nextModel
        })
      },
      setSelectedVariant(key, variant) {
        set((state) => {
          state.selectionSourceByKey[key] = "local"
          delete state.restoredSelectionCreatedAtByKey[key]
          if (variant === null) {
            state.selectedVariantByKey[key] = null
            return
          }

          const nextVariant = variant?.trim()
          if (!nextVariant) {
            delete state.selectedVariantByKey[key]
            return
          }
          state.selectedVariantByKey[key] = nextVariant
        })
      },
      pushRecentModelKey(model) {
        const nextModel = model.trim()
        if (!nextModel) return

        set((state) => {
          state.recentModelKeys = [
            nextModel,
            ...state.recentModelKeys.filter((item) => item !== nextModel),
          ].slice(0, RECENT_MODEL_LIMIT)
        })
      },
      clearSelectedModel(key) {
        set((state) => {
          state.selectionSourceByKey[key] = "local"
          delete state.restoredSelectionCreatedAtByKey[key]
          delete state.selectedModelByKey[key]
        })
      },
      restoreSessionSelection(key, selection) {
        const nextAgent = selection.agent?.trim()
        const nextModel = selection.model?.trim()
        const nextVariant = selection.variant === null ? null : selection.variant?.trim()
        const nextCreatedAt = selection.messageCreatedAt

        set((state) => {
          const currentSource = state.selectionSourceByKey[key]
          const currentRestoredAt = state.restoredSelectionCreatedAtByKey[key]
          const shouldAdvance =
            currentSource !== "local" &&
            (currentSource !== "restored" ||
              (nextCreatedAt !== undefined &&
                (currentRestoredAt === undefined || nextCreatedAt >= currentRestoredAt)))

          if (!shouldAdvance) {
            return
          }

          state.selectionSourceByKey[key] = "restored"
          if (nextCreatedAt !== undefined) {
            state.restoredSelectionCreatedAtByKey[key] = nextCreatedAt
          }

          if (nextAgent) {
            state.selectedAgentByKey[key] = nextAgent
          }
          if (nextModel) {
            state.selectedModelByKey[key] = nextModel
          }
          if (nextVariant === null) {
            state.selectedVariantByKey[key] = null
            return
          }
          if (nextVariant) {
            state.selectedVariantByKey[key] = nextVariant
          }
        })
      },
      migrateWorkspaceSelection(directory, sessionID) {
        const sourceKey = getModelSelectionScopeKey(directory)
        const targetKey = getModelSelectionScopeKey(directory, sessionID)

        set((state) => {
          const sourceAgent = state.selectedAgentByKey[sourceKey]
          const targetAgent = state.selectedAgentByKey[targetKey]
          if (sourceAgent && !targetAgent) {
            state.selectedAgentByKey[targetKey] = sourceAgent
          }
          delete state.selectedAgentByKey[sourceKey]

          const sourceModel = state.selectedModelByKey[sourceKey]
          const targetModel = state.selectedModelByKey[targetKey]
          if (sourceModel && !targetModel) {
            state.selectedModelByKey[targetKey] = sourceModel
          }
          delete state.selectedModelByKey[sourceKey]

          const sourceVariant = state.selectedVariantByKey[sourceKey]
          const targetVariant = state.selectedVariantByKey[targetKey]
          if (sourceVariant !== undefined && targetVariant === undefined) {
            state.selectedVariantByKey[targetKey] = sourceVariant
          }
          delete state.selectedVariantByKey[sourceKey]

          // Carry the explicit values into the session scope, but let session history
          // restore overwrite them later when the opened thread already has messages.
          delete state.selectionSourceByKey[sourceKey]
          delete state.restoredSelectionCreatedAtByKey[sourceKey]
        })
      },
    })),
    {
      name: MODEL_SELECTION_STORAGE_KEY,
      version: 1,
      storage: createPlatformJsonStorage(MODEL_SELECTION_STORAGE_FILE),
      partialize(state) {
        return {
          selectionSourceByKey: state.selectionSourceByKey,
          restoredSelectionCreatedAtByKey: state.restoredSelectionCreatedAtByKey,
          selectedAgentByKey: state.selectedAgentByKey,
          selectedModelByKey: state.selectedModelByKey,
          selectedVariantByKey: state.selectedVariantByKey,
          recentModelKeys: state.recentModelKeys,
        }
      },
      migrate(persistedState) {
        const state = persistedState as
          | {
              selectionSourceByKey?: Record<string, "local" | "restored">
              restoredSelectionCreatedAtByKey?: Record<string, number>
              selectedAgentByKey?: Record<string, string>
              selectedModelByKey?: Record<string, string>
              selectedVariantByKey?: Record<string, string | null>
              recentModelKeys?: string[]
            }
          | undefined

        return {
          selectionSourceByKey: state?.selectionSourceByKey ?? {},
          restoredSelectionCreatedAtByKey: state?.restoredSelectionCreatedAtByKey ?? {},
          selectedAgentByKey: state?.selectedAgentByKey ?? {},
          selectedModelByKey: state?.selectedModelByKey ?? {},
          selectedVariantByKey: state?.selectedVariantByKey ?? {},
          recentModelKeys: state?.recentModelKeys ?? [],
        }
      },
    },
  ),
)
