import { describe, expect, test } from "bun:test"
import { defineBuddySkill } from "../../src/learning/runtime/define-buddy-skill"

const DISPLAY_NAME_MAX_LENGTH = 64
const SHORT_DESCRIPTION_MIN_LENGTH = 25
const SHORT_DESCRIPTION_MAX_LENGTH = 64

function defineTestSkill(presentation: { displayName: string; shortDescription: string }) {
  return defineBuddySkill({
    file: new URL("file:///tmp/bundled-skill/SKILL.md"),
    content: `---
name: bundled-skill
description: Runtime description for the bundled skill.
---

Use the bundled skill.
`,
    presentation,
  })
}

describe("bundled skill presentation", () => {
  test("trims valid presentation fields", () => {
    expect(
      defineTestSkill({
        displayName: "  Explain  ",
        shortDescription: "  Teach a concept clearly before application  ",
      }).presentation,
    ).toEqual({
      displayName: "Explain",
      shortDescription: "Teach a concept clearly before application",
    })
  })

  test("accepts inclusive field length boundaries", () => {
    expect(
      defineTestSkill({
        displayName: "x".repeat(DISPLAY_NAME_MAX_LENGTH),
        shortDescription: "x".repeat(SHORT_DESCRIPTION_MIN_LENGTH),
      }).presentation,
    ).toEqual({
      displayName: "x".repeat(DISPLAY_NAME_MAX_LENGTH),
      shortDescription: "x".repeat(SHORT_DESCRIPTION_MIN_LENGTH),
    })
    expect(
      defineTestSkill({
        displayName: "x",
        shortDescription: "x".repeat(SHORT_DESCRIPTION_MAX_LENGTH),
      }).presentation.shortDescription,
    ).toHaveLength(SHORT_DESCRIPTION_MAX_LENGTH)
  })

  test("rejects empty, oversized, and out-of-range fields", () => {
    expect(() =>
      defineTestSkill({
        displayName: " ",
        shortDescription: "x".repeat(SHORT_DESCRIPTION_MIN_LENGTH),
      }),
    ).toThrow("displayName")
    expect(() =>
      defineTestSkill({
        displayName: "x".repeat(DISPLAY_NAME_MAX_LENGTH + 1),
        shortDescription: "x".repeat(SHORT_DESCRIPTION_MIN_LENGTH),
      }),
    ).toThrow("displayName")
    expect(() =>
      defineTestSkill({
        displayName: "Explain",
        shortDescription: "x".repeat(SHORT_DESCRIPTION_MIN_LENGTH - 1),
      }),
    ).toThrow("shortDescription")
    expect(() =>
      defineTestSkill({
        displayName: "Explain",
        shortDescription: "x".repeat(SHORT_DESCRIPTION_MAX_LENGTH + 1),
      }),
    ).toThrow("shortDescription")
  })
})
