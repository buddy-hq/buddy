import { expect, test } from "bun:test"
import path from "node:path"
import { isInsideSkillRoot } from "../src/extension/notebook"

test.each([
  ["/a/skills/x/SKILL.md", true],
  ["/a/skills-other/x", false],
  ["/a", false],
])("skill root containment for %s is %s", (skillPath, expected) => {
  expect(isInsideSkillRoot(path.resolve(skillPath), [path.resolve("/a/skills")])).toBe(expected)
})
