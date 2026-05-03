import { describe, expect, test } from "bun:test"
import { resolveFeatureRegistrationFlags } from "../../src/learning/runtime/tool-registration-policy"

describe("tool registration policy", () => {
  test("resolves default feature registration flags from registered features", () => {
    const flags = resolveFeatureRegistrationFlags()

    expect(flags).toBeObject()
    expect(Object.keys(flags).length).toBeGreaterThan(0)
  })

  test("overrides take precedence over default registration readiness", () => {
    const flags = resolveFeatureRegistrationFlags({
      overrides: {
        curriculum: false,
        flashcards: false,
      },
    })

    expect(flags.curriculum).toBe(false)
    expect(flags.flashcards).toBe(false)
  })
})
