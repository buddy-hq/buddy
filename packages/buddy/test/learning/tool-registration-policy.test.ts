import { describe, expect, test } from "bun:test"
import {
  allLearningToolGroups,
  getLearningToolGroupDescriptor,
} from "../../src/learning/tools/tool-catalog"
import { resolveLearningToolRegistrationFlags } from "../../src/learning/tools/tool-registration-policy"

describe("tool registration policy", () => {
  test("descriptors expose registration warnings for every learning tool group", () => {
    for (const group of allLearningToolGroups()) {
      const descriptor = getLearningToolGroupDescriptor(group)
      expect(typeof descriptor.registerWarning).toBe("string")
      expect(descriptor.registerWarning.length > 0).toBe(true)
    }
  })

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
