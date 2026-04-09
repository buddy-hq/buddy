import { getModelSelectionScopeKey, useModelSelectionStore } from "@/state/model-selection-store"

export function applyOnboardingModelSelection(directory: string, model: string | undefined) {
  const nextModel = model?.trim()
  if (!nextModel) return

  const store = useModelSelectionStore.getState()
  store.pushRecentModelKey(nextModel)
  store.setSelectedModel(getModelSelectionScopeKey(directory), nextModel)
}
