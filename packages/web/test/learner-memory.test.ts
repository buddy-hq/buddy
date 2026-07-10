import { describe, expect, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"
import { buildLearnerMemoryNotebookBootstrapPatch } from "../src/lib/learner-memory"
import { loadNotebookLearnerMemoryDefaults } from "../src/state/learner-memory-settings"
import { globalConfigQueryKeys } from "../src/state/global-config-query"

describe("buildLearnerMemoryNotebookBootstrapPatch", () => {
  test("skips the notebook patch when the selection matches the global defaults", () => {
    expect(
      buildLearnerMemoryNotebookBootstrapPatch({
        globalConfig: {
          learner_memory: {
            enabled: true,
            auto_extract: true,
          },
        },
        enabled: true,
        autoExtract: true,
      }),
    ).toBeUndefined()
  })

  test("writes an opt-out override when notebook creation disables learner memory", () => {
    expect(
      buildLearnerMemoryNotebookBootstrapPatch({
        globalConfig: {
          learner_memory: {
            enabled: true,
            auto_extract: true,
          },
        },
        enabled: false,
        autoExtract: false,
      }),
    ).toEqual({
      learner_memory: {
        enabled: false,
      },
    })
  })

  test("writes only the auto-extract override when notebook creation changes that default", () => {
    expect(
      buildLearnerMemoryNotebookBootstrapPatch({
        globalConfig: {
          learner_memory: {
            enabled: true,
            auto_extract: false,
          },
        },
        enabled: true,
        autoExtract: true,
      }),
    ).toEqual({
      learner_memory: {
        auto_extract: true,
      },
    })
  })
})

describe("loadNotebookLearnerMemoryDefaults", () => {
  test("reads persisted global notebook defaults before opening notebook creation", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(globalConfigQueryKeys.bundle(), {
      learner_memory: {
        enabled: true,
        auto_extract: true,
      },
    })

    await expect(loadNotebookLearnerMemoryDefaults(queryClient)).resolves.toMatchObject({
      enabled: true,
      autoExtract: true,
    })
  })
})
