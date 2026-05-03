import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

type BuddySkillDefinition = {
  file: URL
}

type BuddySkill = {
  url: URL
  name: string
  description: string
}

const SKILL_NAME_RE = /^name:\s*(.+)$/m
const SKILL_DESCRIPTION_RE = /^description:\s*(.+)$/m

function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const nameMatch = SKILL_NAME_RE.exec(content)
  const descriptionMatch = SKILL_DESCRIPTION_RE.exec(content)

  if (!nameMatch) {
    throw new Error("SKILL.md must contain a `name:` frontmatter field")
  }
  if (!descriptionMatch) {
    throw new Error("SKILL.md must contain a `description:` frontmatter field")
  }

  return {
    name: nameMatch[1].trim(),
    description: descriptionMatch[1].trim(),
  }
}

function defineBuddySkill(input: BuddySkillDefinition): BuddySkill {
  const path = fileURLToPath(input.file)
  const content = readFileSync(path, "utf-8")
  const { name, description } = parseSkillFrontmatter(content)

  return {
    url: input.file,
    name,
    description,
  }
}

export { defineBuddySkill }

export type { BuddySkill, BuddySkillDefinition }
