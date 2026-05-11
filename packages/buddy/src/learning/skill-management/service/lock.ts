import fsp from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { skillArtifactIntegritySchema, skillSourceRefSchema } from "./catalog-schemas"
import { installedSkillLockPath } from "./paths"

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

export function parseInstalledSkillLock(input: unknown): InstalledSkillLock {
  const result = installedSkillLockSchema.safeParse(input)
  if (!result.success) {
    throw lockValidationError(result.error)
  }
  return result.data
}

export async function readInstalledSkillLock(): Promise<InstalledSkillLock> {
  const filepath = installedSkillLockPath()
  const source = await fsp.readFile(filepath, "utf8").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
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
  const filepath = installedSkillLockPath()
  const temporaryPath = `${filepath}.tmp-${process.pid}-${Date.now()}`

  await fsp.mkdir(path.dirname(filepath), { recursive: true })
  await fsp.writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8")
  await fsp.rename(temporaryPath, filepath)
}
