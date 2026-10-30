import { beforeEach, describe, expect, test } from "bun:test"
import {
  fastModeRestoreSelection,
  getModelSelectionScopeKey,
  getSelectedFastKey,
  MODEL_SELECTION_STORAGE_KEY,
  omitOpenAIFastSiblingOptions,
  resolveFastModePromptModel,
  resolveFastModeSelection,
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
    selectedFastByKey: {},
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

  test("seeds a replacement workspace draft from a deleted session selection", () => {
    const store = useModelSelectionStore.getState()
    const workspaceKey = getModelSelectionScopeKey("/repo")

    store.setSelectedAgent(workspaceKey, "build")
    store.seedWorkspaceSelection("/repo", {
      model: "openai/gpt-5",
      variant: "high",
    })

    const nextState = useModelSelectionStore.getState()
    expect(nextState.selectedAgentByKey[workspaceKey]).toBeUndefined()
    expect(nextState.selectedModelByKey[workspaceKey]).toBe("openai/gpt-5")
    expect(nextState.selectedVariantByKey[workspaceKey]).toBe("high")
    expect(nextState.selectionSourceByKey[workspaceKey]).toBe("local")
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

    expect(useModelSelectionStore.getState().selectedAgentByKey[workspaceKey]).toBeUndefined()
    expect(useModelSelectionStore.getState().selectedAgentByKey[sessionKey]).toBe("plan")
    expect(useModelSelectionStore.getState().selectedModelByKey[workspaceKey]).toBeUndefined()
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBe(
      "anthropic/claude-sonnet-4",
    )
    expect(useModelSelectionStore.getState().selectedVariantByKey[workspaceKey]).toBeUndefined()
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

  test("allows session history to overwrite a migrated workspace model", () => {
    const store = useModelSelectionStore.getState()
    const workspaceKey = getModelSelectionScopeKey("/repo")
    const sessionKey = getModelSelectionScopeKey("/repo", "session-1")

    store.setSelectedModel(workspaceKey, "openai/gpt-5")
    store.migrateWorkspaceSelection("/repo", "session-1")
    store.restoreSessionSelection(sessionKey, {
      model: "anthropic/claude-sonnet-4",
      messageCreatedAt: 10,
    })

    expect(useModelSelectionStore.getState().selectedModelByKey[workspaceKey]).toBeUndefined()
    expect(useModelSelectionStore.getState().selectionSourceByKey[sessionKey]).toBe("restored")
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBe(
      "anthropic/claude-sonnet-4",
    )
  })

  test("keeps the fast setting isolated per session", () => {
    const store = useModelSelectionStore.getState()
    const leftKey = getModelSelectionScopeKey("/repo", "left")
    const rightKey = getModelSelectionScopeKey("/repo", "right")

    store.setSelectedFast(leftKey, true)
    store.setSelectedFast(rightKey, false)

    const state = useModelSelectionStore.getState()
    expect(getSelectedFastKey(state, leftKey)).toBe(true)
    expect(getSelectedFastKey(state, rightKey)).toBe(false)
  })

  test("keeps an explicit fast off when the workspace selection migrates", () => {
    const store = useModelSelectionStore.getState()
    const workspaceKey = getModelSelectionScopeKey("/repo")
    const sessionKey = getModelSelectionScopeKey("/repo", "ses_fast")

    store.setSelectedFast(workspaceKey, false)
    store.migrateWorkspaceSelection("/repo", "ses_fast")

    expect(getSelectedFastKey(useModelSelectionStore.getState(), workspaceKey)).toBeUndefined()
    expect(getSelectedFastKey(useModelSelectionStore.getState(), sessionKey)).toBe(false)
  })

  test("does not let history overwrite a local fast choice", () => {
    const store = useModelSelectionStore.getState()
    const sessionKey = getModelSelectionScopeKey("/repo", "ses_fast")

    store.setSelectedFast(sessionKey, false)
    store.restoreSessionSelection(sessionKey, {
      model: "openai/gpt-5.5-fast",
      fast: true,
      messageCreatedAt: 20,
    })

    expect(getSelectedFastKey(useModelSelectionStore.getState(), sessionKey)).toBe(false)
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBeUndefined()
  })

  test("restores fast from history and leaves it when a later message omits it", () => {
    const store = useModelSelectionStore.getState()
    const sessionKey = getModelSelectionScopeKey("/repo", "ses_fast")

    store.restoreSessionSelection(sessionKey, {
      model: "openai/gpt-5.5",
      fast: true,
      messageCreatedAt: 10,
    })
    store.restoreSessionSelection(sessionKey, {
      model: "openai/gpt-5.5",
      messageCreatedAt: 11,
    })

    expect(getSelectedFastKey(useModelSelectionStore.getState(), sessionKey)).toBe(true)

    store.restoreSessionSelection(sessionKey, {
      model: "openai/gpt-5.5",
      fast: false,
      messageCreatedAt: 12,
    })
    expect(getSelectedFastKey(useModelSelectionStore.getState(), sessionKey)).toBe(false)

    store.restoreSessionSelection(sessionKey, {
      fast: null,
      messageCreatedAt: 13,
    })
    expect(getSelectedFastKey(useModelSelectionStore.getState(), sessionKey)).toBeUndefined()
  })

  test("seeds fast on, off, and cleared", () => {
    const store = useModelSelectionStore.getState()
    const workspaceKey = getModelSelectionScopeKey("/repo")

    store.seedWorkspaceSelection("/repo", { model: "openai/gpt-5.5", fast: true })
    expect(getSelectedFastKey(useModelSelectionStore.getState(), workspaceKey)).toBe(true)

    store.seedWorkspaceSelection("/repo", { model: "openai/gpt-5.5", fast: false })
    expect(getSelectedFastKey(useModelSelectionStore.getState(), workspaceKey)).toBe(false)

    store.seedWorkspaceSelection("/repo", { model: "openai/gpt-5.5" })
    expect(getSelectedFastKey(useModelSelectionStore.getState(), workspaceKey)).toBeUndefined()

    store.seedWorkspaceSelection("/repo", { model: "openai/gpt-5.5", fast: true })
    store.seedWorkspaceSelection("/repo", { model: "openai/gpt-5.5", fast: null })
    expect(getSelectedFastKey(useModelSelectionStore.getState(), workspaceKey)).toBeUndefined()
  })
})

const OPENAI_KEYS = new Set(["openai/gpt-5.5", "openai/gpt-5.5-fast"])

describe("fast mode prompt model", () => {
  test("sends the fast catalog id only when the sibling exists and fast is on", () => {
    expect(
      resolveFastModeSelection({
        modelKey: "openai/gpt-5.5",
        fast: true,
        availableModelKeys: OPENAI_KEYS,
      }),
    ).toEqual({
      supported: true,
      enabled: true,
      displayModelKey: "openai/gpt-5.5",
      requestModelKey: "openai/gpt-5.5-fast",
    })

    expect(
      resolveFastModePromptModel({
        model: { providerID: "openai", modelID: "gpt-5.5" },
        fast: true,
        availableModelKeys: OPENAI_KEYS,
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5.5-fast" })

    expect(
      resolveFastModePromptModel({
        model: { providerID: "openai", modelID: "gpt-5.5" },
        fast: false,
        availableModelKeys: OPENAI_KEYS,
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5.5" })

    expect(
      resolveFastModePromptModel({
        model: { providerID: "openai", modelID: "gpt-5.5" },
        fast: undefined,
        availableModelKeys: OPENAI_KEYS,
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5.5" })
  })

  test("does not invent a fast id the catalog does not contain", () => {
    const selection = resolveFastModeSelection({
      modelKey: "openai/gpt-5.5",
      fast: true,
      availableModelKeys: new Set(["openai/gpt-5.5"]),
    })

    expect(selection.supported).toBe(false)
    expect(selection.enabled).toBe(false)
    expect(selection.requestModelKey).toBe("openai/gpt-5.5")
  })

  test("treats a selected fast sibling as on unless fast was turned off", () => {
    const keys = OPENAI_KEYS

    expect(
      resolveFastModeSelection({
        modelKey: "openai/gpt-5.5-fast",
        fast: undefined,
        availableModelKeys: keys,
      }),
    ).toEqual({
      supported: true,
      enabled: true,
      displayModelKey: "openai/gpt-5.5",
      requestModelKey: "openai/gpt-5.5-fast",
    })

    expect(
      resolveFastModePromptModel({
        model: { providerID: "openai", modelID: "gpt-5.5-fast" },
        fast: false,
        availableModelKeys: keys,
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5.5" })
  })

  test("leaves a real model whose id ends in -fast unchanged", () => {
    const keys = new Set(["venice/claude-opus-5-fast"])
    const selection = resolveFastModeSelection({
      modelKey: "venice/claude-opus-5-fast",
      fast: true,
      availableModelKeys: keys,
    })

    expect(selection.supported).toBe(false)
    expect(selection.requestModelKey).toBe("venice/claude-opus-5-fast")
    expect(
      resolveFastModePromptModel({
        model: { providerID: "venice", modelID: "claude-opus-5-fast" },
        fast: true,
        availableModelKeys: keys,
      }),
    ).toEqual({ providerID: "venice", modelID: "claude-opus-5-fast" })
  })

  test("ignores a remembered fast flag for every provider except OpenAI", () => {
    const keys = new Set([
      "anthropic/claude-opus-5-5",
      "anthropic/claude-opus-5-5-fast",
      "openrouter/openai/gpt-5.5",
      "openrouter/openai/gpt-5.5-fast",
    ])

    expect(
      resolveFastModePromptModel({
        model: { providerID: "anthropic", modelID: "claude-opus-5-5" },
        fast: true,
        availableModelKeys: keys,
      }),
    ).toEqual({ providerID: "anthropic", modelID: "claude-opus-5-5" })

    expect(
      resolveFastModeSelection({
        modelKey: "anthropic/claude-opus-5-5",
        fast: true,
        availableModelKeys: keys,
      }).supported,
    ).toBe(false)

    expect(
      resolveFastModePromptModel({
        model: { providerID: "openrouter", modelID: "openai/gpt-5.5" },
        fast: true,
        availableModelKeys: keys,
      }),
    ).toEqual({ providerID: "openrouter", modelID: "openai/gpt-5.5" })
  })

  test("drops an OpenAI fast row when its base model is listed", () => {
    const options = [
      { key: "openai/gpt-5.5", label: "GPT-5.5" },
      { key: "openai/gpt-5.5-fast", label: "GPT-5.5 Fast" },
      { key: "anthropic/claude-opus-5-5", label: "Claude Opus 5.5" },
      { key: "anthropic/claude-opus-5-5-fast", label: "Claude Opus 5.5 Fast" },
      { key: "openai/gpt-4.1-fast", label: "GPT-4.1 Fast" },
    ]

    expect(omitOpenAIFastSiblingOptions(options).map((option) => option.key)).toEqual([
      "openai/gpt-5.5",
      "anthropic/claude-opus-5-5",
      "anthropic/claude-opus-5-5-fast",
      "openai/gpt-4.1-fast",
    ])
  })

  test("restores a fast sibling as the base model with fast on", () => {
    expect(
      fastModeRestoreSelection({
        modelKey: "openai/gpt-5.5-fast",
        availableModelKeys: OPENAI_KEYS,
      }),
    ).toEqual({ modelKey: "openai/gpt-5.5", fast: true })

    expect(
      fastModeRestoreSelection({
        modelKey: "openai/gpt-5.5",
        availableModelKeys: OPENAI_KEYS,
      }),
    ).toEqual({ modelKey: "openai/gpt-5.5", fast: false })

    expect(
      fastModeRestoreSelection({
        modelKey: "openai/gpt-5.5-fast",
        availableModelKeys: new Set(),
      }),
    ).toEqual({ modelKey: "openai/gpt-5.5-fast", fast: undefined })

    expect(
      fastModeRestoreSelection({
        modelKey: "venice/claude-opus-5-fast",
        availableModelKeys: new Set(["venice/claude-opus-5-fast"]),
      }),
    ).toEqual({ modelKey: "venice/claude-opus-5-fast", fast: false })

    expect(
      fastModeRestoreSelection({
        modelKey: "anthropic/claude-opus-5-5-fast",
        availableModelKeys: new Set([
          "anthropic/claude-opus-5-5",
          "anthropic/claude-opus-5-5-fast",
        ]),
      }),
    ).toEqual({ modelKey: "anthropic/claude-opus-5-5-fast", fast: false })
  })
})
