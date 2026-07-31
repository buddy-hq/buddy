import { publishedSkillArtifactUrl } from "./artifact-config"

export const CATALOG_ICON_MEDIA_TYPE = "image/webp"
export const CATALOG_ICON_SHA256_HEX_LENGTH = 64
export const CATALOG_ICON_DIGEST_PREFIX_LENGTH = 16

const CATALOG_ICON_FILENAME_PATTERN = /^buddy-skill-[a-z0-9-]+-[0-9a-f]{16}\.webp$/
const CATALOG_ICON_SHA256_PATTERN = /^[0-9a-f]{64}$/

export type CatalogIconArtifact = {
  filename: string
  sha256: string
}

export function isCatalogIconFilename(value: string): boolean {
  return CATALOG_ICON_FILENAME_PATTERN.test(value)
}

export function isCatalogIconSha256(value: string): boolean {
  return CATALOG_ICON_SHA256_PATTERN.test(value)
}

export function catalogIconReleaseFilename(skillID: string, sha256: string): string {
  return `buddy-skill-${skillID}-${sha256.slice(0, CATALOG_ICON_DIGEST_PREFIX_LENGTH)}.webp`
}

export function catalogIconReleaseUrl(icon: CatalogIconArtifact): string {
  return publishedSkillArtifactUrl(icon.filename)
}

export function catalogIconRoutePath(skillID: string, icon: CatalogIconArtifact): string {
  const params = new URLSearchParams({ sha256: icon.sha256 })
  return `/api/skills/library/${encodeURIComponent(skillID)}/icon?${params}`
}
