import { describe, expect, test } from "bun:test"
import { matchesInstalledSkillSearch } from "../src/components/skills/skill-presentation"

const SKILL = {
  name: "resolve-confusions",
  description: "Runtime description for agent triggering.",
  displayName: "Resolve Misconceptions",
  shortDescription: "Replace faulty mental models and verify understanding",
}

describe("installed skill presentation search", () => {
  test("matches presentation and runtime metadata", () => {
    expect(matchesInstalledSkillSearch(SKILL, "misconceptions")).toBe(true)
    expect(matchesInstalledSkillSearch(SKILL, "faulty mental")).toBe(true)
    expect(matchesInstalledSkillSearch(SKILL, "resolve-confusions")).toBe(true)
    expect(matchesInstalledSkillSearch(SKILL, "agent triggering")).toBe(true)
  })

  test("matches additional catalog terms and normalizes the query", () => {
    expect(matchesInstalledSkillSearch(SKILL, "  SYSTEM  ", ["system", "global"])).toBe(true)
    expect(matchesInstalledSkillSearch(SKILL, "workspace", ["system", "global"])).toBe(false)
  })

  test("matches an empty query", () => {
    expect(matchesInstalledSkillSearch(SKILL, "  ")).toBe(true)
  })
})
