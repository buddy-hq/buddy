type BuddySkillDefinition = {
  file: URL
  content: string
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
  const { name, description } = parseSkillFrontmatter(input.content)

  return {
    url: input.file,
    name,
    description,
  }
}

export { defineBuddySkill }

export type { BuddySkill, BuddySkillDefinition }
