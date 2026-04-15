import { describe, expect, test } from "bun:test"
import { getBuddyPersona } from "../../src/learning/personas/catalog"
import { INTENTS, WORKSPACE_STATES } from "../../src/learning/shared/teaching-vocabulary"
import { compileRuntimeLearningToolPermissions } from "../../src/learning/tools/tool-permission-compiler"
import { derivePersonaStaticLearningToolPermissions } from "../../src/learning/tools/tool-capability-policy"

describe("tool permission compiler", () => {
  test("runtime-allowed tools are always included in the static persona permission envelope", () => {
    const personas = [
      getBuddyPersona("buddy"),
      getBuddyPersona("code-buddy"),
      getBuddyPersona("math-buddy"),
      getBuddyPersona("reading-buddy"),
    ]

    for (const persona of personas) {
      const staticPermissions = derivePersonaStaticLearningToolPermissions(persona)

      for (const intent of INTENTS) {
        for (const workspaceState of WORKSPACE_STATES) {
          const runtimePermissions = compileRuntimeLearningToolPermissions({
            persona,
            intent,
            workspaceState,
          })

          for (const [toolID, access] of Object.entries(runtimePermissions.tools)) {
            if (access === "allow") {
              expect(staticPermissions[toolID as keyof typeof staticPermissions]).toBe("allow")
            }
          }
        }
      }
    }
  })
})
