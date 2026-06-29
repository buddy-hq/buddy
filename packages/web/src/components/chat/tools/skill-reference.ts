import { basename } from "../utils/path"

export type TSkillReference = {
  displayName: string
  filePath: string
  skillName: string
}

type TSkillReferencePathParts = {
  displaySource: string
  skillNameSource: string
}

const SKILL_MANIFEST_FILE_NAME = "skill.md"
const SKILLS_DIRECTORY_NAME = "skills"
const SKILL_RESOURCE_DIRECTORY_NAMES = new Set(["assets", "references", "scripts"])

function toTitleCaseWords(value: string): string {
  return value
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ")
}

export function humanizeSkillDisplayName(value: string): string {
  const withoutExtension = value.replace(/\.[^.]+$/u, "")
  return toTitleCaseWords(withoutExtension.replaceAll(/[_-]+/gu, " ").trim().toLowerCase())
}

function parseSkillReferencePath(
  filePath: string | undefined,
): TSkillReferencePathParts | undefined {
  if (!filePath) return undefined

  const normalizedPath = filePath.replaceAll("\\", "/")
  const segments = normalizedPath.split("/").filter((segment) => segment.length > 0)
  const lowerSegments = segments.map((segment) => segment.toLowerCase())
  const fileName = basename(normalizedPath)

  if (lowerSegments.at(-1) === SKILL_MANIFEST_FILE_NAME) {
    const skillNameSource = segments.at(-2)
    if (!skillNameSource) return undefined
    return {
      displaySource: skillNameSource,
      skillNameSource,
    }
  }

  const resourceDirectoryIndex = lowerSegments.findLastIndex((segment) =>
    SKILL_RESOURCE_DIRECTORY_NAMES.has(segment),
  )
  if (resourceDirectoryIndex < 0) return undefined

  const skillsDirectoryIndex = lowerSegments.findLastIndex(
    (segment, index) => segment === SKILLS_DIRECTORY_NAME && index < resourceDirectoryIndex,
  )
  const skillNameSource = segments[resourceDirectoryIndex - 1]
  if (
    skillsDirectoryIndex < 0 ||
    resourceDirectoryIndex <= skillsDirectoryIndex + 1 ||
    !skillNameSource
  ) {
    return undefined
  }

  return {
    displaySource: fileName,
    skillNameSource,
  }
}

export function isSkillReferencePath(filePath: string | undefined): boolean {
  return parseSkillReferencePath(filePath) !== undefined
}

export function resolveSkillReference(filePath: string | undefined): TSkillReference | undefined {
  if (!filePath) return undefined
  const pathParts = parseSkillReferencePath(filePath)
  if (!pathParts) return undefined

  return {
    filePath,
    displayName: humanizeSkillDisplayName(pathParts.displaySource),
    skillName: humanizeSkillDisplayName(pathParts.skillNameSource),
  }
}

export function resolveSkillReferenceInfo(input: {
  filePath?: string
  title?: string
  subtitle?: string
  detail?: string
}): TSkillReference | undefined {
  const fromPath = resolveSkillReference(input.filePath)
  if (fromPath) return fromPath
  if (!isSkillReferenceTitle(input.title) || !input.subtitle) return undefined

  return {
    filePath: input.filePath ?? input.subtitle,
    displayName: input.subtitle,
    skillName: input.detail ?? input.subtitle,
  }
}

export function getSkillReferenceToolTitle(active: boolean): string {
  return active ? "Using Reference" : "Referred"
}

export function isSkillReferenceTitle(title: string | undefined): boolean {
  return title === getSkillReferenceToolTitle(true) || title === getSkillReferenceToolTitle(false)
}

export function getSkillReferenceRowAction(active: boolean): string {
  return active ? "Using Reference" : "Referred"
}

export function getSkillReferenceBurstVerb(): string {
  return "Using Reference"
}

export function formatSkillReferenceBurstLabel(displayName?: string): string {
  const verb = getSkillReferenceBurstVerb()
  return displayName ? `${verb} ${displayName}` : verb
}

export function getSkillReferenceGroupKey(skillName: string): string {
  return `skill:${skillName}`
}

export function formatSettledSkillReferenceLabel(skillName: string): string {
  return formatSettledSkillToolLabel(skillName)
}

export function getSkillToolTitle(active: boolean): string {
  return active ? "Using Skill" : "Skill Used"
}

export function getSkillToolRowAction(active: boolean): string {
  return active ? "Using Skill" : "Skill Used"
}

export function formatSettledSkillToolLabel(skillName: string): string {
  return `${getSkillToolTitle(false)}: ${skillName}`
}

export function formatSettledSkillToolCountLabel(count: number): string {
  return `${count} Skills Used`
}
