import { beforeEach, describe, expect, test } from "bun:test"
import {
  getModelSelectionScopeKey,
  MODEL_SELECTION_STORAGE_KEY,
  useModelSelectionStore,
} from "../src/state/model-selection-store"

function resetModelSelectionStore() {
  localStorage.removeItem(MODEL_SELECTION_STORAGE_KEY)
  useModelSelectionStore.setState({
    selectionSourceByKey: {},
    restoredSelectionCreatedAtByKey: {},
    selectedAgentByKey: {},
    selectedModelByKey: {},
    selectedVariantByKey: {},
    recentModelKeys: [],
  })
}

describe("model selection store", () => {
  beforeEach(() => {
    resetModelSelectionStore()
  })

  test("keeps selections isolated per session key", () => {
    const store = useModelSelectionStore.getState()
    const leftKey = getModelSelectionScopeKey("/repo", "left")
    const rightKey = getModelSelectionScopeKey("/repo", "right")

    store.setSelectedModel(leftKey, "openai/gpt-5")
    store.setSelectedModel(rightKey, "anthropic/claude-sonnet-4")

    expect(useModelSelectionStore.getState().selectedModelByKey[leftKey]).toBe("openai/gpt-5")
    expect(useModelSelectionStore.getState().selectedModelByKey[rightKey]).toBe(
      "anthropic/claude-sonnet-4",
    )
  })

  test("migrates the workspace selection into a new session when the target is empty", () => {
    const store = useModelSelectionStore.getState()
    const workspaceKey = getModelSelectionScopeKey("/repo")
    const sessionKey = getModelSelectionScopeKey("/repo", "session-1")

    store.setSelectedAgent(workspaceKey, "build")
    store.setSelectedModel(workspaceKey, "openai/gpt-5")
    store.setSelectedVariant(workspaceKey, "high")
    store.migrateWorkspaceSelection("/repo", "session-1")

    expect(useModelSelectionStore.getState().selectedAgentByKey[workspaceKey]).toBeUndefined()
    expect(useModelSelectionStore.getState().selectedModelByKey[workspaceKey]).toBeUndefined()
    expect(useModelSelectionStore.getState().selectedVariantByKey[workspaceKey]).toBeUndefined()
    expect(useModelSelectionStore.getState().selectedAgentByKey[sessionKey]).toBe("build")
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBe("openai/gpt-5")
    expect(useModelSelectionStore.getState().selectedVariantByKey[sessionKey]).toBe("high")
  })

  test("does not overwrite an existing session selection during workspace migration", () => {
    const store = useModelSelectionStore.getState()
    const workspaceKey = getModelSelectionScopeKey("/repo")
    const sessionKey = getModelSelectionScopeKey("/repo", "session-1")

    store.setSelectedAgent(workspaceKey, "build")
    store.setSelectedAgent(sessionKey, "plan")
    store.setSelectedModel(workspaceKey, "openai/gpt-5")
    store.setSelectedModel(sessionKey, "anthropic/claude-sonnet-4")
    store.setSelectedVariant(workspaceKey, "high")
    store.setSelectedVariant(sessionKey, "low")
    store.migrateWorkspaceSelection("/repo", "session-1")

    expect(useModelSelectionStore.getState().selectedAgentByKey[workspaceKey]).toBe("build")
    expect(useModelSelectionStore.getState().selectedAgentByKey[sessionKey]).toBe("plan")
    expect(useModelSelectionStore.getState().selectedModelByKey[workspaceKey]).toBe("openai/gpt-5")
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBe(
      "anthropic/claude-sonnet-4",
    )
    expect(useModelSelectionStore.getState().selectedVariantByKey[workspaceKey]).toBe("high")
    expect(useModelSelectionStore.getState().selectedVariantByKey[sessionKey]).toBe("low")
  })

  test("keeps the most recent model picks first without duplicates", () => {
    const store = useModelSelectionStore.getState()

    store.pushRecentModelKey("openai/gpt-5")
    store.pushRecentModelKey("anthropic/claude-sonnet-4")
    store.pushRecentModelKey("openai/gpt-5")

    expect(useModelSelectionStore.getState().recentModelKeys).toEqual([
      "openai/gpt-5",
      "anthropic/claude-sonnet-4",
    ])
  })

  test("restores model and variant from a session message without overwriting local picks", () => {
    const store = useModelSelectionStore.getState()
    const sessionKey = getModelSelectionScopeKey("/repo", "session-1")

    store.restoreSessionSelection(sessionKey, {
      agent: "build",
      model: "openai/gpt-5",
      variant: "high",
    })

    expect(useModelSelectionStore.getState().selectedAgentByKey[sessionKey]).toBe("build")
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBe("openai/gpt-5")
    expect(useModelSelectionStore.getState().selectedVariantByKey[sessionKey]).toBe("high")

    store.setSelectedAgent(sessionKey, "plan")
    store.setSelectedModel(sessionKey, "anthropic/claude-sonnet-4")
    store.setSelectedVariant(sessionKey, "low")
    store.restoreSessionSelection(sessionKey, {
      agent: "build",
      model: "openai/gpt-5-mini",
      variant: "high",
    })

    expect(useModelSelectionStore.getState().selectedAgentByKey[sessionKey]).toBe("plan")
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBe(
      "anthropic/claude-sonnet-4",
    )
    expect(useModelSelectionStore.getState().selectedVariantByKey[sessionKey]).toBe("low")
  })

  test("preserves an explicit default-variant selection across workspace migration", () => {
    const store = useModelSelectionStore.getState()
    const workspaceKey = getModelSelectionScopeKey("/repo")
    const sessionKey = getModelSelectionScopeKey("/repo", "session-1")

    store.setSelectedVariant(workspaceKey, null)
    store.migrateWorkspaceSelection("/repo", "session-1")

    expect(useModelSelectionStore.getState().selectedVariantByKey[workspaceKey]).toBeUndefined()
    expect(useModelSelectionStore.getState().selectedVariantByKey[sessionKey]).toBeNull()
  })

  test("restores an explicit default variant when the session message omits a variant", () => {
    const store = useModelSelectionStore.getState()
    const sessionKey = getModelSelectionScopeKey("/repo", "session-1")

    store.restoreSessionSelection(sessionKey, {
      agent: "build",
      model: "openai/gpt-5",
      variant: null,
    })

    expect(useModelSelectionStore.getState().selectedVariantByKey[sessionKey]).toBeNull()
  })

  test("advances restored session selection when a newer user message arrives", () => {
    const store = useModelSelectionStore.getState()
    const sessionKey = getModelSelectionScopeKey("/repo", "session-1")

    store.restoreSessionSelection(sessionKey, {
      agent: "build",
      model: "openai/gpt-5",
      variant: "high",
      messageCreatedAt: 10,
    })
    store.restoreSessionSelection(sessionKey, {
      agent: "plan",
      model: "anthropic/claude-sonnet-4",
      variant: null,
      messageCreatedAt: 20,
    })

    expect(useModelSelectionStore.getState().selectedAgentByKey[sessionKey]).toBe("plan")
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBe(
      "anthropic/claude-sonnet-4",
    )
    expect(useModelSelectionStore.getState().selectedVariantByKey[sessionKey]).toBeNull()
  })

  test("does not overwrite a local session selection with a newer restored message", () => {
    const store = useModelSelectionStore.getState()
    const sessionKey = getModelSelectionScopeKey("/repo", "session-1")

    store.restoreSessionSelection(sessionKey, {
      agent: "build",
      model: "openai/gpt-5",
      variant: "high",
      messageCreatedAt: 10,
    })
    store.setSelectedModel(sessionKey, "openai/gpt-5-mini")
    store.restoreSessionSelection(sessionKey, {
      agent: "plan",
      model: "anthropic/claude-sonnet-4",
      variant: "low",
      messageCreatedAt: 20,
    })

    expect(useModelSelectionStore.getState().selectedAgentByKey[sessionKey]).toBe("build")
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBe(
      "openai/gpt-5-mini",
    )
    expect(useModelSelectionStore.getState().selectedVariantByKey[sessionKey]).toBe("high")
  })
})
