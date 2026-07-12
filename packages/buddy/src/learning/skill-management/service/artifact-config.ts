import { BUDDY_ENV } from "../../../storage"

export const SKILL_ARTIFACT_RELEASE_BASE_URL =
  "https://github.com/prashantbhudwal/buddy-releases/releases/download/skill-artifacts"

export const LIBRARY_CATALOG_ARTIFACT_FILENAME = "library-catalog.envelope.json"
export const SYSTEM_SKILL_PACK_ARTIFACT_FILENAME_PREFIX = "system-skill-pack"

export const DEFAULT_LIBRARY_CATALOG_URL = `${SKILL_ARTIFACT_RELEASE_BASE_URL}/${LIBRARY_CATALOG_ARTIFACT_FILENAME}`
export const BUDDY_SKILL_ARTIFACT_PUBLIC_KEY =
  "RWTnXW/ReqIjINLWIh975uAh8iY7hYEoebHbIRFNtKa6dMEiZ3YBKWSw"

const DISABLED_ENV_VALUES = new Set(["1", "true", "yes"])

function configuredValue(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

export function skillArtifactFetchEnabled(): boolean {
  const value = configuredValue(BUDDY_ENV.DISABLE_SKILL_ARTIFACT_FETCH)?.toLowerCase()
  return value === undefined || !DISABLED_ENV_VALUES.has(value)
}

export function skillArtifactPublicKey(): string {
  return (
    configuredValue(BUDDY_ENV.SKILL_ARTIFACT_PUBLIC_KEY) ?? BUDDY_SKILL_ARTIFACT_PUBLIC_KEY
  )
}

export function libraryCatalogArtifactUrl(): string | undefined {
  if (!skillArtifactFetchEnabled()) return undefined
  return configuredValue(BUDDY_ENV.SKILL_LIBRARY_CATALOG_URL) ?? DEFAULT_LIBRARY_CATALOG_URL
}

export function systemSkillPackArtifactFilename(baseFingerprint: string): string {
  return `${SYSTEM_SKILL_PACK_ARTIFACT_FILENAME_PREFIX}-${baseFingerprint}.envelope.json`
}

export function publishedSkillArtifactUrl(filename: string): string {
  return `${SKILL_ARTIFACT_RELEASE_BASE_URL}/${filename}`
}

export function systemSkillPackArtifactUrl(baseFingerprint: string): string | undefined {
  if (!skillArtifactFetchEnabled()) return undefined
  const configured = configuredValue(BUDDY_ENV.SYSTEM_SKILL_PACK_URL)
  if (configured) {
    return configured.replaceAll("{baseFingerprint}", baseFingerprint)
  }
  return publishedSkillArtifactUrl(systemSkillPackArtifactFilename(baseFingerprint))
}
