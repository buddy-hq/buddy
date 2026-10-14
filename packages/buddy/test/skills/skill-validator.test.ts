import { describe, expect, test } from "bun:test"
import { validateBuddySkillSource } from "../../script/skill-validator"

function skillSource(frontmatter: string, body = "# Skill\n\nUse this workflow.\n") {
  return `---\n${frontmatter}\n---\n\n${body}`
}

describe("Buddy skill validator", () => {
  test("accepts a valid skill and Buddy's example prompt field", () => {
    const result = validateBuddySkillSource(
      skillSource(
        'name: example-skill\ndescription: Use for example tasks.\nexample_prompt: "Try this"',
      ),
      "example-skill",
    )

    expect(result).toEqual({ name: "example-skill", issues: [] })
  })

  test("catches YAML that the runtime parser rejects", () => {
    const result = validateBuddySkillSource(
      skillSource("name: summarise\ndescription: Applies to any text: books and articles."),
    )

    expect(result.issues[0]).toStartWith("Invalid YAML frontmatter:")
  })

  test("checks metadata and registered name", () => {
    const result = validateBuddySkillSource(
      skillSource("name: Wrong_Name\ndescription: Use for examples.\nunknown: true"),
      "expected-name",
    )

    expect(result.issues).toContain('Unexpected frontmatter field "unknown".')
    expect(result.issues).toContain('Frontmatter "name" must use lowercase hyphen-case.')
    expect(result.issues).toContain(
      'Frontmatter name "Wrong_Name" does not match registered name "expected-name".',
    )
  })

  test("rejects empty instructions and unfinished placeholders", () => {
    expect(
      validateBuddySkillSource(skillSource("name: example\ndescription: Use for examples.", ""))
        .issues,
    ).toContain("SKILL.md must contain instructions after the frontmatter.")
    expect(
      validateBuddySkillSource(
        skillSource("name: example\ndescription: Use for examples.", "[TODO: write instructions]"),
      ).issues,
    ).toContain("SKILL.md contains an unfinished TODO placeholder.")
  })

  test("allows placeholder text inside a code fence", () => {
    const result = validateBuddySkillSource(
      skillSource("name: example\ndescription: Use for examples.", "```text\n[TODO: example]\n```"),
    )

    expect(result.issues).toEqual([])
  })
})
