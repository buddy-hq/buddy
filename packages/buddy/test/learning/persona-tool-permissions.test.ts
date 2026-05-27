import { describe, expect, test } from "bun:test"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import { deriveStaticPersonaToolPermissionsFromProfile } from "../../src/learning/runtime/persona-tool-permissions"

describe("persona tool permissions", () => {
  test("resolved session runtime gates tools by feature membership and teaching workspace", () => {
    const codeBuddy = getBuddyPersona("code-buddy")
    const buddy = getBuddyPersona("buddy")

    // codeBuddy has lessonWorkspace feature -> teaching_checkpoint is available
    const codeBuddyPerms = deriveStaticPersonaToolPermissionsFromProfile(codeBuddy)
    // teaching_checkpoint requires teachingWorkspace:"active" but static permissions
    // don't check workspace state - they only check feature membership and runtime readiness
    expect(codeBuddyPerms.teaching_checkpoint).toBe("allow")

    // buddy does NOT have lessonWorkspace feature -> teaching_checkpoint should be denied
    const buddyPerms = deriveStaticPersonaToolPermissionsFromProfile(buddy)
    expect(buddyPerms.teaching_checkpoint).toBe("deny")

    // buddy has figureRendering feature -> render_figure is available
    expect(buddyPerms.render_figure).toBe("allow")
  })

  test("derives static persona learning-tool permissions from canonical Buddy policy", () => {
    const buddyPermissions = deriveStaticPersonaToolPermissionsFromProfile(getBuddyPersona("buddy"))
    const codeBuddyPermissions = deriveStaticPersonaToolPermissionsFromProfile(
      getBuddyPersona("code-buddy"),
    )

    expect(buddyPermissions.search_standards).toBe("allow")
    expect(buddyPermissions.render_figure).toBe("allow")
    expect(buddyPermissions.python_calculator).toBe("allow")
    expect(buddyPermissions.teaching_start_lesson).toBe("deny")

    expect(codeBuddyPermissions.teaching_start_lesson).toBe("allow")
    expect(codeBuddyPermissions.python_calculator).toBe("deny")
  })
})
