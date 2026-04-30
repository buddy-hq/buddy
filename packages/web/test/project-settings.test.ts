import { describe, expect, test } from "bun:test"
import {
  resolveLearnerMemoryMasterToggleDraft,
  resolveModelSelectionDirtyAfterPersist,
} from "../src/state/project-settings"

const learnerMemoryDefaults = {
  learnerMemoryMasterEnabled: false,
  learnerMemoryMinUserMessages: 4,
  learnerMemoryAttentionThreshold: 6,
  learnerMemoryMaxExtractionCallsPerSession: 2,
  learnerMemoryMaxExtractionCallsPerDay: 20,
  learnerMemoryDefaultContextLimit: 8,
  learnerMemoryExtractModel: "",
  learnerMemoryConsolidationModel: "",
  learnerMemoryMinStartupIdleMs: 21_600_000,
  learnerMemoryStartupConcurrency: 8,
  learnerMemoryMaxRawMemoriesForConsolidation: 256,
  learnerMemoryMaxUnusedStageOneDays: 30,
}

describe("resolveModelSelectionDirtyAfterPersist", () => {
  test("keeps model selection dirty when the draft changed during an in-flight save", () => {
    expect(
      resolveModelSelectionDirtyAfterPersist({
        draft: {
          provider: "kimi",
          model: "kimi-k2-thinking",
          logLevel: "",
          learnerMemoryEnabled: false,
          learnerMemoryAutoExtract: false,
          ...learnerMemoryDefaults,
        },
        modelSelectionDirty: true,
        patch: {
          model: "kimi/kimi-k2",
        },
      }),
    ).toBe(true)
  })

  test("clears model selection dirty when the persisted model matches the current draft", () => {
    expect(
      resolveModelSelectionDirtyAfterPersist({
        draft: {
          provider: "kimi",
          model: "kimi-k2-thinking",
          logLevel: "",
          learnerMemoryEnabled: false,
          learnerMemoryAutoExtract: false,
          ...learnerMemoryDefaults,
        },
        modelSelectionDirty: true,
        patch: {
          model: "kimi/kimi-k2-thinking",
        },
      }),
    ).toBe(false)
  })

  test("preserves the dirty flag when the save did not persist a model patch", () => {
    expect(
      resolveModelSelectionDirtyAfterPersist({
        draft: {
          provider: "kimi",
          model: "kimi-k2-thinking",
          logLevel: "",
          learnerMemoryEnabled: false,
          learnerMemoryAutoExtract: false,
          ...learnerMemoryDefaults,
        },
        modelSelectionDirty: true,
        patch: {
          default_persona: "buddy",
        },
      }),
    ).toBe(true)
  })
})

describe("resolveLearnerMemoryMasterToggleDraft", () => {
  test("turning global memory off also turns off notebook participation and auto extraction", () => {
    const draft = resolveLearnerMemoryMasterToggleDraft(
      {
        provider: "",
        model: "",
        logLevel: "",
        learnerMemoryEnabled: true,
        learnerMemoryAutoExtract: true,
        ...learnerMemoryDefaults,
        learnerMemoryMasterEnabled: true,
      },
      false,
    )

    expect(draft.learnerMemoryMasterEnabled).toBe(false)
    expect(draft.learnerMemoryEnabled).toBe(false)
    expect(draft.learnerMemoryAutoExtract).toBe(false)
  })

  test("turning global memory on preserves existing notebook choices", () => {
    const draft = resolveLearnerMemoryMasterToggleDraft(
      {
        provider: "",
        model: "",
        logLevel: "",
        learnerMemoryEnabled: true,
        learnerMemoryAutoExtract: true,
        ...learnerMemoryDefaults,
        learnerMemoryMasterEnabled: false,
      },
      true,
    )

    expect(draft.learnerMemoryMasterEnabled).toBe(true)
    expect(draft.learnerMemoryEnabled).toBe(true)
    expect(draft.learnerMemoryAutoExtract).toBe(true)
  })
})
