import { getModelSelectionScopeKey, useModelSelectionStore } from "@/state/model-selection-store"

export function applyOnboardingModelSelection(input: {
  directory: string
  model: string | undefined
  variant?: string
}) {
  const nextModel = input.model?.trim()
  if (!nextModel) return

  const store = useModelSelectionStore.getState()
  store.pushRecentModelKey(nextModel)
  const scopeKey = getModelSelectionScopeKey(input.directory)
  store.setSelectedModel(scopeKey, nextModel)

  const nextVariant = input.variant?.trim()
  if (nextVariant) {
    store.setSelectedVariant(scopeKey, nextVariant)
  }
}
