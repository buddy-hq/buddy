import { describe, expect, test } from "bun:test"
import { resolveLearningToolRegistrationFlags } from "../../src/learning/tools/tool-registration-policy"

describe("tool registration policy", () => {
  test("overrides take precedence over default registration readiness", () => {
    const flags = resolveLearningToolRegistrationFlags({
      overrides: {
        math: false,
        knowledgeGraph: false,
      },
    })

    expect(flags.math).toBe(false)
    expect(flags.knowledgeGraph).toBe(false)
  })
})
