import { describe, expect, test } from "bun:test"
import {
  buildGlobalLearnerMemoryPatch,
  buildNotebookLearnerMemoryPatch,
  resolveLearnerMemoryMasterToggleDraft,
  resolveNotebookLearnerMemorySelection,
} from "../src/state/learner-memory-settings"

const learnerMemoryDefaults = {
  learnerMemoryDefaultEnabled: true,
  learnerMemoryDefaultAutoExtract: true,
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

describe("resolveLearnerMemoryMasterToggleDraft", () => {
  test("turning global memory off also turns off notebook defaults and auto extraction", () => {
    const draft = resolveLearnerMemoryMasterToggleDraft(
      {
        learnerMemoryMasterEnabled: true,
        ...learnerMemoryDefaults,
      },
      false,
    )

    expect(draft.learnerMemoryMasterEnabled).toBe(false)
    expect(draft.learnerMemoryDefaultEnabled).toBe(false)
    expect(draft.learnerMemoryDefaultAutoExtract).toBe(false)
  })

  test("turning global memory on preserves existing notebook defaults", () => {
    const draft = resolveLearnerMemoryMasterToggleDraft(
      {
        learnerMemoryMasterEnabled: false,
        ...learnerMemoryDefaults,
      },
      true,
    )

    expect(draft.learnerMemoryMasterEnabled).toBe(true)
    expect(draft.learnerMemoryDefaultEnabled).toBe(true)
    expect(draft.learnerMemoryDefaultAutoExtract).toBe(true)
  })
})

describe("buildGlobalLearnerMemoryPatch", () => {
  test("writes notebook default participation into global config", () => {
    expect(
      buildGlobalLearnerMemoryPatch(
        {
          learner_memory: {
            master_enabled: true,
            enabled: false,
            auto_extract: false,
          },
        },
        {
          ...learnerMemoryDefaults,
          learnerMemoryMasterEnabled: true,
        },
      ),
    ).toEqual({
      learner_memory: {
        enabled: true,
        auto_extract: true,
      },
    })
  })
})

describe("buildNotebookLearnerMemoryPatch", () => {
  test("writes a notebook opt-out when the global default is enabled", () => {
    expect(
      buildNotebookLearnerMemoryPatch({
        globalConfig: {
          learner_memory: {
            enabled: true,
            auto_extract: true,
          },
        },
        rawProjectConfig: {},
        enabled: false,
        autoExtract: false,
      }),
    ).toEqual({
      learner_memory: {
        enabled: false,
      },
    })
  })

  test("clears notebook overrides when returning to the global defaults", () => {
    expect(
      buildNotebookLearnerMemoryPatch({
        globalConfig: {
          learner_memory: {
            enabled: true,
            auto_extract: true,
          },
        },
        rawProjectConfig: {
          learner_memory: {
            enabled: false,
            auto_extract: false,
          },
        },
        enabled: true,
        autoExtract: true,
      }),
    ).toEqual({
      learner_memory: {
        enabled: null,
        auto_extract: null,
      },
    })
  })
})

describe("resolveNotebookLearnerMemorySelection", () => {
  test("preserves the inherited auto-extract default even while the notebook is opted out", () => {
    expect(
      resolveNotebookLearnerMemorySelection(
        {
          learner_memory: {
            enabled: true,
            auto_extract: true,
          },
        },
        {
          learner_memory: {
            enabled: false,
          },
        },
      ),
    ).toMatchObject({
      enabled: false,
      autoExtract: false,
      autoExtractWhenEnabled: true,
    })
  })
})
