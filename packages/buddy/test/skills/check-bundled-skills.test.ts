import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  checkBundledSkills,
  collectBundledSkillRegistrations,
  collectSourceBuddyManifests,
} from "../../script/check-bundled-skills"
import type { BuddySkill } from "../../src/learning/runtime/define-buddy-skill"
import { isDisabledBundledSkillName } from "../../src/learning/skill-management/disabled-bundled-skills"
import { renderBuddySkillManifest } from "../../src/learning/skill-management/service/manifests"

function createSkill(input: {
  name: string
  documentPath: string
  displayName?: string
}): BuddySkill {
  return {
    url: pathToFileURL(input.documentPath),
    name: input.name,
    description: "Runtime description.",
    presentation: {
      displayName: input.displayName ?? "Explain",
      shortDescription: "Teach a concept clearly before moving into application",
    },
  }
}

describe("bundled skill registrations", () => {
  test("renders deterministic quoted YAML with a trailing newline", () => {
    expect(
      renderBuddySkillManifest({
        displayName: 'Explain "Clearly"',
        shortDescription: "Teach a concept clearly before moving into application",
      }),
    ).toBe(`interface:
  display_name: "Explain \\"Clearly\\""
  short_description: "Teach a concept clearly before moving into application"
`)
  })

  test("rejects duplicate registered names and documents", () => {
    const first = createSkill({
      name: "explain",
      documentPath: "/tmp/explain/SKILL.md",
    })
    const duplicateName = createSkill({
      name: "explain",
      documentPath: "/tmp/other/SKILL.md",
    })
    const duplicateDocument = createSkill({
      name: "other",
      documentPath: "/tmp/explain/SKILL.md",
    })

    expect(() => collectBundledSkillRegistrations([first, duplicateName])).toThrow(
      "Duplicate bundled skill name",
    )
    expect(() => collectBundledSkillRegistrations([first, duplicateDocument])).toThrow(
      "Duplicate bundled skill document",
    )
  })

  test("verifies every registered bundled skill document", async () => {
    const registrations = await checkBundledSkills()
    expect(
      registrations.some((registration) => registration.skillName === "resolve-confusions"),
    ).toBe(true)
    expect(
      registrations.every((registration) => !isDisabledBundledSkillName(registration.skillName)),
    ).toBe(true)
  })

  test("detects source manifests that duplicate typed metadata", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-source-manifest-"))
    const manifestPath = path.join(root, "feature", "skills", "explain", "agents", "buddy.yaml")
    await fsp.mkdir(path.dirname(manifestPath), { recursive: true })
    await fsp.writeFile(manifestPath, "interface: {}\n", "utf8")

    expect(await collectSourceBuddyManifests(root)).toEqual([manifestPath])
  })
})
