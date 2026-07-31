import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

type BuddySkillDefinition = {
  file: URL
  content: string
  presentation: BuddySkillPresentation
}

type BuddySkillPresentation = {
  displayName: string
  shortDescription: string
  icon?: string
}

type BuddySkill = {
  url: URL
  name: string
  description: string
  presentation: BuddySkillPresentation
}

const SKILL_NAME_RE = /^name:\s*(.+)$/m
const SKILL_DESCRIPTION_RE = /^description:\s*(.+)$/m
const DISPLAY_NAME_MIN_LENGTH = 1
const DISPLAY_NAME_MAX_LENGTH = 64
const SHORT_DESCRIPTION_MIN_LENGTH = 25
const SHORT_DESCRIPTION_MAX_LENGTH = 64
const ICON_MIN_LENGTH = 1
const ICON_MAX_LENGTH = 512

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

function validatePresentationField(input: {
  field: keyof BuddySkillPresentation
  value: string
  minLength: number
  maxLength: number
}): string {
  const value = input.value.trim()
  if (value.length < input.minLength || value.length > input.maxLength) {
    throw new Error(
      `Skill presentation ${input.field} must be ${input.minLength}-${input.maxLength} characters`,
    )
  }
  return value
}

function validateSkillPresentation(presentation: BuddySkillPresentation): BuddySkillPresentation {
  return {
    displayName: validatePresentationField({
      field: "displayName",
      value: presentation.displayName,
      minLength: DISPLAY_NAME_MIN_LENGTH,
      maxLength: DISPLAY_NAME_MAX_LENGTH,
    }),
    shortDescription: validatePresentationField({
      field: "shortDescription",
      value: presentation.shortDescription,
      minLength: SHORT_DESCRIPTION_MIN_LENGTH,
      maxLength: SHORT_DESCRIPTION_MAX_LENGTH,
    }),
    ...(presentation.icon
      ? {
          icon: validatePresentationField({
            field: "icon",
            value: presentation.icon,
            minLength: ICON_MIN_LENGTH,
            maxLength: ICON_MAX_LENGTH,
          }),
        }
      : {}),
  }
}

function defineBuddySkill(input: BuddySkillDefinition): BuddySkill {
  const content = resolveSkillDocumentContent(input)
  const { name, description } = parseSkillFrontmatter(content)

  return {
    url: input.file,
    name,
    description,
    presentation: validateSkillPresentation(input.presentation),
  }
}

export { defineBuddySkill }

export type { BuddySkill, BuddySkillDefinition, BuddySkillPresentation }
