import { describe, expect, test } from "bun:test"
import {
  buildLearnerMemoryGlobalBootstrapPatch,
  buildLearnerMemoryProjectBootstrapPatch,
} from "../src/lib/learner-memory"

describe("buildLearnerMemoryGlobalBootstrapPatch", () => {
  test("enables the global learner-memory master switch when notebook bootstrap opts in", () => {
    expect(
      buildLearnerMemoryGlobalBootstrapPatch({
        directory: "/tmp/notebook",
        enabled: true,
      }),
    ).toEqual({
      learner_memory: {
        master_enabled: true,
      },
    })
  })

  test("skips the global patch when notebook bootstrap leaves learner memory off", () => {
    expect(
      buildLearnerMemoryGlobalBootstrapPatch({
        directory: "/tmp/notebook",
        enabled: false,
      }),
    ).toBeUndefined()
  })
})

describe("buildLearnerMemoryProjectBootstrapPatch", () => {
  test("writes notebook participation and auto-extract settings for opt-in notebooks", () => {
    expect(
      buildLearnerMemoryProjectBootstrapPatch({
        directory: "/tmp/notebook",
        enabled: true,
        autoExtract: true,
      }),
    ).toEqual({
      learner_memory: {
        enabled: true,
        auto_extract: true,
      },
    })
  })

  test("forces auto-extract off when notebook bootstrap does not opt into it", () => {
    expect(
      buildLearnerMemoryProjectBootstrapPatch({
        directory: "/tmp/notebook",
        enabled: true,
        autoExtract: false,
      }),
    ).toEqual({
      learner_memory: {
        enabled: true,
        auto_extract: false,
      },
    })
  })

  test("skips the notebook patch when learner memory is not enabled", () => {
    expect(
      buildLearnerMemoryProjectBootstrapPatch({
        directory: "/tmp/notebook",
        enabled: false,
        autoExtract: true,
      }),
    ).toBeUndefined()
  })
})
