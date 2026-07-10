import { describe, expect, test } from "bun:test"
import {
  buildGlobalLearnerMemoryPatch,
  buildNotebookLearnerMemoryPatch,
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

describe("buildGlobalLearnerMemoryPatch", () => {
  test("writes notebook default participation into global config", () => {
    expect(
      buildGlobalLearnerMemoryPatch(
        {
          learner_memory: {
            enabled: false,
            auto_extract: false,
          },
        },
        {
          ...learnerMemoryDefaults,
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
