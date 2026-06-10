import { basename } from "../utils/path"
export type TSkillReference = {
  displayName: string
  filePath: string
  skillName: string
}

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

export function isSkillReferencePath(filePath: string | undefined): boolean {
  if (!filePath) return false
  const segments = filePath
    .replaceAll("\\", "/")
    .toLowerCase()
    .split("/")
    .filter((segment) => segment.length > 0)

  return segments.includes("skills") || segments.at(-1) === "skill.md"
}

export function resolveSkillReference(filePath: string | undefined): TSkillReference | undefined {
  if (!filePath || !isSkillReferencePath(filePath)) return undefined

  const normalizedPath = filePath.replaceAll("\\", "/")
  const segments = normalizedPath.split("/").filter((segment) => segment.length > 0)
  const skillDirectoryIndex = segments.findLastIndex((segment) => segment.toLowerCase() === "skills")
  const fileName = basename(normalizedPath)
  const lowerFileName = fileName.toLowerCase()
  const displaySource =
    lowerFileName === "skill.md" ? segments.at(-2) ?? fileName : fileName
  const rawSkillName =
    skillDirectoryIndex >= 0 ? segments[skillDirectoryIndex + 1] ?? displaySource : displaySource

  return {
    filePath,
    displayName: humanizeSkillDisplayName(displaySource),
    skillName: humanizeSkillDisplayName(rawSkillName),
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
