import { describe, expect, test } from "bun:test"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import { deriveStaticPersonaToolPermissionsFromProfile } from "../../src/learning/runtime/persona-tool-permissions"

describe("persona tool permissions", () => {
  test("resolved session runtime gates tools by feature membership", () => {
    const buddy = getBuddyPersona("buddy")

    const buddyPerms = deriveStaticPersonaToolPermissionsFromProfile(buddy)
    expect(buddyPerms.teaching_checkpoint).toBe("deny")
    expect(buddyPerms.render_figure).toBe("allow")
  })

  test("derives static persona learning-tool permissions from canonical Buddy policy", () => {
    const buddyPermissions = deriveStaticPersonaToolPermissionsFromProfile(getBuddyPersona("buddy"))
    const teachingBuddyPermissions = deriveStaticPersonaToolPermissionsFromProfile(
      getBuddyPersona("teaching-buddy"),
    )

    expect(buddyPermissions.search_standards).toBe("allow")
    expect(buddyPermissions.render_figure).toBe("allow")
    expect(buddyPermissions.python_calculator).toBe("allow")
    expect(buddyPermissions.teaching_start_lesson).toBe("deny")
    expect(teachingBuddyPermissions).toEqual(buddyPermissions)
  })
})
