import { describe, expect, test } from "bun:test"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import { TEACHING_WORKSPACE_STATES } from "../../src/learning/shared/teaching-vocabulary"
import { deriveStaticPersonaToolPermissionsFromProfile } from "../../src/learning/runtime/persona-tool-permissions"
import { compileRuntimeLearningToolPermissions } from "../../src/learning/runtime/tool-permission-compiler"

describe("tool permission compiler", () => {
  test("runtime-allowed tools are always included in the static persona permission envelope", () => {
    const personas = [getBuddyPersona("buddy"), getBuddyPersona("teaching-buddy")]

    for (const persona of personas) {
      const staticPermissions = deriveStaticPersonaToolPermissionsFromProfile(persona)

      for (const _teachingWorkspaceState of TEACHING_WORKSPACE_STATES) {
        const runtimePermissions = compileRuntimeLearningToolPermissions({
          persona,
        })

        for (const [toolID, access] of Object.entries(runtimePermissions.tools)) {
          if (access === "allow") {
            expect(staticPermissions[toolID as keyof typeof staticPermissions]).toBe("allow")
          }
        }
      }
    }
  })
})
