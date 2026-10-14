import fsp from "node:fs/promises"
import matter from "gray-matter"
import { z } from "zod"

const MAX_SKILL_NAME_LENGTH = 64
const MAX_SKILL_DESCRIPTION_LENGTH = 1024
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/
const ALLOWED_FRONTMATTER_KEYS = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
  "example_prompt",
])
const CODE_FENCE_PATTERN = /^[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/
const TODO_PATTERN = /^[ ]{0,3}\[TODO:[^\n]*\][ \t]*$/
const frontmatterSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
  })
  .catchall(z.unknown())

export type BuddySkillValidation = {
  name?: string
  issues: string[]
}

function unfinishedTodoInBody(body: string): boolean {
  let fenceMarker: string | undefined
  let fenceLength = 0

  for (const line of body.split(/\r?\n/)) {
    const fence = CODE_FENCE_PATTERN.exec(line)
    if (fence) {
      const marker = fence[1]
      if (!fenceMarker) {
        fenceMarker = marker[0]
        fenceLength = marker.length
      } else if (
        marker[0] === fenceMarker &&
        marker.length >= fenceLength &&
        !fence[2].trim()
      ) {
        fenceMarker = undefined
        fenceLength = 0
      }
      continue
    }
    if (!fenceMarker && TODO_PATTERN.test(line)) return true
  }

  return false
}

export function validateBuddySkillSource(
  source: string,
  expectedName?: string,
): BuddySkillValidation {
  const issues: string[] = []
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return { issues: ["SKILL.md must start with YAML frontmatter (---)."] }
  }

  const frontmatter = FRONTMATTER_PATTERN.exec(source)
  if (!frontmatter) {
    return { issues: ["SKILL.md must close its YAML frontmatter with ---."] }
  }

  let data: unknown
  try {
    data = matter(source).data
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error)
    return { issues: [`Invalid YAML frontmatter: ${detail}`] }
  }

  const parsed = frontmatterSchema.safeParse(data)
  if (!parsed.success) {
    return { issues: [z.prettifyError(parsed.error)] }
  }

  const fields = parsed.data
  for (const key of Object.keys(fields)) {
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      issues.push(`Unexpected frontmatter field "${key}".`)
    }
  }

  const name = fields.name
  if (!SKILL_NAME_PATTERN.test(name)) {
    issues.push('Frontmatter "name" must use lowercase hyphen-case.')
  }
  if (name.length > MAX_SKILL_NAME_LENGTH) {
    issues.push(`Frontmatter "name" must be at most ${MAX_SKILL_NAME_LENGTH} characters.`)
  }
  if (expectedName && name !== expectedName) {
    issues.push(`Frontmatter name "${name}" does not match registered name "${expectedName}".`)
  }

  const description = fields.description
  if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    issues.push(
      `Frontmatter "description" must be at most ${MAX_SKILL_DESCRIPTION_LENGTH} characters.`,
    )
  }
  if (description.startsWith("[TODO:")) {
    issues.push("Frontmatter description contains an unfinished TODO placeholder.")
  }
  if (description.includes("<") || description.includes(">")) {
    issues.push("Frontmatter description cannot contain angle brackets.")
  }

  const body = source.slice(frontmatter[0].length)
  if (!body.trim()) {
    issues.push("SKILL.md must contain instructions after the frontmatter.")
  } else if (unfinishedTodoInBody(body)) {
    issues.push("SKILL.md contains an unfinished TODO placeholder.")
  }

  return { name, issues }
}

export async function validateBuddySkillFile(
  documentPath: string,
  expectedName?: string,
): Promise<BuddySkillValidation> {
  let source: string
  try {
    source = await fsp.readFile(documentPath, "utf8")
  } catch {
    return { issues: [`Cannot read SKILL.md at ${documentPath}.`] }
  }
  return validateBuddySkillSource(source, expectedName)
}
