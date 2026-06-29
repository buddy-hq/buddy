import { describe, expect, test } from "bun:test"
import {
  isInstalledLibrarySkill,
  skillLibraryAction,
  skillLibraryButtonVariant,
} from "@/components/skills/skill-library-actions"

describe("skill library actions", () => {
  test("maps library states to their available action", () => {
    expect(skillLibraryAction("available")).toBe("install")
    expect(skillLibraryAction("installed")).toBe("installed")
    expect(skillLibraryAction("update_available")).toBe("update")
    expect(skillLibraryAction("withdrawn_installed")).toBe("remove")
  })

  test("treats update availability as an installed skill", () => {
    expect(isInstalledLibrarySkill("available")).toBe(false)
    expect(isInstalledLibrarySkill("installed")).toBe(true)
    expect(isInstalledLibrarySkill("update_available")).toBe(true)
    expect(isInstalledLibrarySkill("withdrawn_installed")).toBe(false)
  })

  test("uses the secondary button treatment for updates", () => {
    expect(skillLibraryButtonVariant("update")).toBe("secondary")
  })
})
