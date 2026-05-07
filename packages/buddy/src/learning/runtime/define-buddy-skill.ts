import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

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

function readRawSkillFile(file: URL): string | undefined {
  const filepath = fileURLToPath(file)
  if (!existsSync(filepath)) {
    return undefined
  }

  return readFileSync(filepath, "utf8")
}

function resolveSkillDocumentContent(input: BuddySkillDefinition): string {
  try {
    parseSkillFrontmatter(input.content)
    return input.content
  } catch {
    return readRawSkillFile(input.file) ?? input.content
  }
}

function defineBuddySkill(input: BuddySkillDefinition): BuddySkill {
  const content = resolveSkillDocumentContent(input)
  const { name, description } = parseSkillFrontmatter(content)

  return {
    url: input.file,
    name,
    description,
  }
}

export { defineBuddySkill }

export type { BuddySkill, BuddySkillDefinition }
