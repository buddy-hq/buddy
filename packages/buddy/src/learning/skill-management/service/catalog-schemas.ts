import { z } from "zod"

const SHA256_HEX_LENGTH = 64
const GITHUB_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const GITHUB_SOURCE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/

export function normalizeSkillArtifactSha256(sha256: string): string {
  return sha256.toLowerCase()
}

export const skillSourceRefSchema = z.object({
  type: z.literal("github"),
  repo: z.string().trim().min(1).regex(GITHUB_REPO_PATTERN, "repo must be owner/name"),
  path: z
    .string()
    .trim()
    .min(1)
    .regex(GITHUB_SOURCE_PATH_PATTERN, "path must contain only safe repository path characters"),
  ref: z
    .string()
    .trim()
    .regex(GITHUB_COMMIT_SHA_PATTERN, "ref must be an immutable 40-character commit SHA"),
})

export const skillArtifactIntegritySchema = z.object({
  algorithm: z.literal("tree-sha256-v1"),
  sha256: z
    .string()
    .trim()
    .length(SHA256_HEX_LENGTH)
    .regex(/^[0-9a-f]+$/i),
  sizeBytes: z.number().int().nonnegative().optional(),
  fileCount: z.number().int().nonnegative().optional(),
})

export type SkillSourceRef = z.infer<typeof skillSourceRefSchema>
export type SkillArtifactIntegrity = z.infer<typeof skillArtifactIntegritySchema>
