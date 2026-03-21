import { LearnerArtifactPath } from '../path'
import type { ProfileArtifact } from '../types'
import { ProfileArtifactSchema } from '../types'
import { readMarkdownFile, writeMarkdownFile } from './io'
import { normalizeList } from './normalize'

function defaultProfile(): ProfileArtifact {
  const now = new Date().toISOString()
  return {
    id: 'profile',
    kind: 'profile',
    goalIds: [],
    background: [],
    knownPrerequisites: [],
    availableTimePatterns: [],
    toolEnvironmentLimits: [],
    motivationAnchors: [],
    learnerPreferences: [],
    createdAt: now,
    updatedAt: now,
  }
}

export async function readProfile() {
  const filepath = LearnerArtifactPath.profileFile()
  const existing = await readMarkdownFile(filepath, ProfileArtifactSchema)
  return existing?.data
}

export async function writeProfile(profile: ProfileArtifact) {
  const normalized = ProfileArtifactSchema.parse(profile)
  await writeMarkdownFile(LearnerArtifactPath.profileFile(), normalized, '')
  return normalized
}

export async function ensureProfile() {
  const filepath = LearnerArtifactPath.profileFile()
  const existing = await readMarkdownFile(filepath, ProfileArtifactSchema)
  if (existing) return existing.data

  const profile = defaultProfile()
  return writeProfile(profile)
}

export async function patchProfile(
  patch: Partial<
    Pick<
      ProfileArtifact,
      | 'background'
      | 'knownPrerequisites'
      | 'availableTimePatterns'
      | 'toolEnvironmentLimits'
      | 'motivationAnchors'
      | 'learnerPreferences'
    >
  >,
) {
  const current = await ensureProfile()
  const next: ProfileArtifact = {
    ...current,
    ...(patch.background !== undefined ? { background: normalizeList(patch.background) } : {}),
    ...(patch.knownPrerequisites !== undefined
      ? { knownPrerequisites: normalizeList(patch.knownPrerequisites) }
      : {}),
    ...(patch.availableTimePatterns !== undefined
      ? { availableTimePatterns: normalizeList(patch.availableTimePatterns) }
      : {}),
    ...(patch.toolEnvironmentLimits !== undefined
      ? { toolEnvironmentLimits: normalizeList(patch.toolEnvironmentLimits) }
      : {}),
    ...(patch.motivationAnchors !== undefined
      ? { motivationAnchors: normalizeList(patch.motivationAnchors) }
      : {}),
    ...(patch.learnerPreferences !== undefined
      ? { learnerPreferences: normalizeList(patch.learnerPreferences) }
      : {}),
    updatedAt: new Date().toISOString(),
  }
  return writeProfile(next)
}
