import fsp from "node:fs/promises"
import { z } from "zod"
import { writeJsonFileAtomic } from "../../../storage/atomic-file"
import { skillArtifactIntegritySchema, skillSourceRefSchema } from "./catalog-schemas"
import { installedSkillLockPath } from "./paths"
import { parseTNodeErrorCode } from "../../shared/parse-values"

const LOCK_SCHEMA_VERSION = 1

const installedSkillLockEntryBaseSchema = z.object({
  catalogId: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  skillName: z.string().trim().min(1),
  source: skillSourceRefSchema,
  integrity: skillArtifactIntegritySchema,
  installedAt: z.string().trim().datetime(),
  scannerPolicyVersion: z.number().int().positive(),
  catalogRevision: z.string().trim().min(1).optional(),
})

const installedSkillLockEntrySchema = z.discriminatedUnion("state", [
  installedSkillLockEntryBaseSchema.extend({
    state: z.literal("active"),
    installedPath: z.string().trim().min(1),
  }),
  installedSkillLockEntryBaseSchema.extend({
    state: z.literal("withdrawn"),
    withdrawnPath: z.string().trim().min(1),
    withdrawnAt: z.string().trim().datetime(),
    runtimeRefreshPending: z.boolean(),
    permissionDisposition: z.enum(["denied", "system-replacement"]).optional(),
  }),
])

const installedSkillLockSchema = z.object({
  schemaVersion: z.literal(LOCK_SCHEMA_VERSION),
  installed: z.record(z.string().trim().min(1), installedSkillLockEntrySchema),
})

export type InstalledSkillLockEntry = z.infer<typeof installedSkillLockEntrySchema>
export type InstalledSkillLock = z.infer<typeof installedSkillLockSchema>

function emptyInstalledSkillLock(): InstalledSkillLock {
  return {
    schemaVersion: LOCK_SCHEMA_VERSION,
    installed: {},
  }
}

function lockValidationError(error: z.ZodError) {
  const issues = error.issues.map((issue) => {
    const location = issue.path.length > 0 ? issue.path.join(".") : "lock"
    return `${location}: ${issue.message}`
  })
  return new Error(`Invalid installed skill lock: ${issues.join("; ")}`)
}

export function parseInstalledSkillLock<TValue>(input: TValue): InstalledSkillLock {
  const result = installedSkillLockSchema.safeParse(input)
  if (!result.success) {
    throw lockValidationError(result.error)
  }
  return result.data
}

export async function readInstalledSkillLock(): Promise<InstalledSkillLock> {
  const filepath = installedSkillLockPath()
  const source = await fsp.readFile(filepath, "utf8").catch((error) => {
    if (parseTNodeErrorCode(error) === "ENOENT") {
      return undefined
    }
    throw error
  })

  if (!source) {
    return emptyInstalledSkillLock()
  }

  try {
    return parseInstalledSkillLock(JSON.parse(source))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid installed skill lock JSON: ${error.message}`, { cause: error })
    }
    throw error
  }
}

export async function writeInstalledSkillLock(lock: InstalledSkillLock): Promise<void> {
  const parsed = parseInstalledSkillLock(lock)
  await writeJsonFileAtomic(installedSkillLockPath(), parsed)
}
