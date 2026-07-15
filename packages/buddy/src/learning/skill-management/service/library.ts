import fsp from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  normalizeSkillArtifactSha256,
  skillArtifactIntegritySchema,
  skillSourceRefSchema,
  type SkillSourceRef,
} from "./catalog-schemas"
import { SkillServiceError, type SkillLibraryItemView } from "./contracts"
import {
  readInstalledSkillLock,
  type InstalledSkillLockEntry,
  writeInstalledSkillLock,
} from "./lock"
import {
  ensureManagedSkillPathReady,
  isWithinPath,
  libraryCatalogCacheRoot,
  managedLibraryRoot,
  managedWithdrawnLibraryRoot,
} from "./paths"
import { BUDDY_ENV } from "../../../storage"
import { allBuddySkills } from "../../runtime/feature-registry"
import { libraryCatalogArtifactUrl, skillArtifactPublicKey } from "./artifact-config"
import { createSignedArtifactStore } from "./signed-artifact"
import { clearSkillPermission, setSkillPermission } from "./permissions"

const CATALOG_SCHEMA_VERSION = 1
const CATALOG_FILE_NAME = "catalog.json"
const RUNTIME_ENTRYPOINT_FILE_NAMES = new Set(["index.js"])
const WITHDRAWN_PATH_MAX_ATTEMPTS = 100
const WITHDRAWN_PERMISSION_DISPOSITION = {
  denied: "denied",
  systemReplacement: "system-replacement",
} as const

type WithdrawnSkillMove = {
  catalogId: string
  installedPath: string
  withdrawnPath: string
  previousEntry: InstalledSkillLockEntry
}

const skillReviewSchema = z.object({
  approvedAt: z.string().trim().datetime(),
  approvedBy: z.string().trim().min(1).optional(),
  policyVersion: z.number().int().positive(),
  approvedWarningRuleIDs: z.array(z.string().trim().min(1)).optional(),
  approvedBlockRuleIDs: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().min(1).optional(),
})

const skillCatalogEntrySchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  displayName: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  categories: z.array(z.string().trim().min(1)),
  tags: z.array(z.string().trim().min(1)),
  source: skillSourceRefSchema,
  integrity: skillArtifactIntegritySchema,
  review: skillReviewSchema,
  status: z.enum(["approved", "withdrawn"]),
})

const skillCatalogDocumentSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  revision: z.number().int().positive(),
  entries: z.array(skillCatalogEntrySchema),
})

export type SkillReview = z.infer<typeof skillReviewSchema>
export type SkillCatalogEntry = z.infer<typeof skillCatalogEntrySchema>
export type SkillCatalogDocument = z.infer<typeof skillCatalogDocumentSchema>

function catalogValidationError(error: z.ZodError) {
  const issues = error.issues.map((issue) => {
    const location = issue.path.length > 0 ? issue.path.join(".") : "catalog"
    return `${location}: ${issue.message}`
  })
  return new Error(`Invalid skill catalog: ${issues.join("; ")}`)
}

export function parseSkillCatalogDocument(input: unknown): SkillCatalogDocument {
  const result = skillCatalogDocumentSchema.safeParse(input)
  if (!result.success) {
    throw catalogValidationError(result.error)
  }
  const ids = new Set<string>()
  for (const entry of result.data.entries) {
    if (ids.has(entry.id)) {
      throw new Error(`Invalid skill catalog: duplicate entry id "${entry.id}"`)
    }
    ids.add(entry.id)
  }
  return result.data
}

export function skillCatalogPayloadBytes(catalog: SkillCatalogDocument): Uint8Array {
  return Buffer.from(`${JSON.stringify(parseSkillCatalogDocument(catalog), null, 2)}\n`, "utf8")
}

export function sourceLabel(source: SkillSourceRef): string {
  return `${source.repo}/${source.path}`
}

function toSkillLibraryItemView(input: {
  entry: SkillCatalogEntry
  state: SkillLibraryItemView["state"]
}): SkillLibraryItemView {
  return {
    id: input.entry.id,
    displayName: input.entry.displayName,
    summary: input.entry.summary,
    categories: input.entry.categories,
    tags: input.entry.tags,
    sourceKind: "github",
    sourceLabel: sourceLabel(input.entry.source),
    state: input.state,
  }
}

export function isCatalogSkillUpdateAvailable(input: {
  entry: Pick<SkillCatalogEntry, "integrity">
  lockEntry: InstalledSkillLockEntry | undefined
}): boolean {
  return (
    input.lockEntry?.state === "active" &&
    normalizeSkillArtifactSha256(input.lockEntry.integrity.sha256) !==
      normalizeSkillArtifactSha256(input.entry.integrity.sha256)
  )
}

export function resolveCatalogSkillState(input: {
  entry: Pick<SkillCatalogEntry, "integrity" | "status">
  lockEntry: InstalledSkillLockEntry | undefined
}): SkillLibraryItemView["state"] {
  if (input.entry.status === "withdrawn" || input.lockEntry?.state === "withdrawn") {
    return "withdrawn_installed"
  }
  if (input.lockEntry?.state !== "active") {
    return "available"
  }
  return isCatalogSkillUpdateAvailable(input) ? "update_available" : "installed"
}

function parseCatalogJson(source: string): unknown {
  try {
    const parsed: unknown = JSON.parse(source)
    return parsed
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid skill catalog JSON: ${message}`, { cause: error })
  }
}

async function fileExists(filepath: string): Promise<boolean> {
  return await fsp.stat(filepath).then(
    (stat) => stat.isFile(),
    () => false,
  )
}

export function catalogPathCandidates(input: {
  argv: readonly string[]
  moduleUrl: string
}): string[] {
  const resourcesRoot = process.env[BUDDY_ENV.BACKEND_RESOURCES_DIR]?.trim()
  const paths = [
    ...(resourcesRoot ? [path.join(resourcesRoot, CATALOG_FILE_NAME)] : []),
    path.join(path.dirname(fileURLToPath(input.moduleUrl)), CATALOG_FILE_NAME),
    ...input.argv.flatMap((arg) => {
      if (!RUNTIME_ENTRYPOINT_FILE_NAMES.has(path.basename(arg))) return []
      return [path.join(path.dirname(path.resolve(arg)), CATALOG_FILE_NAME)]
    }),
  ]

  return [...new Set(paths)]
}

export async function resolveCatalogPathFromCandidates(
  candidates: readonly string[],
): Promise<string> {
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate
    }
  }

  throw new Error(`Skill catalog not found at: ${candidates.join(", ")}`)
}

export async function resolveCatalogPath(): Promise<string> {
  return await resolveCatalogPathFromCandidates(
    catalogPathCandidates({
      argv: process.argv,
      moduleUrl: import.meta.url,
    }),
  )
}

async function readBundledCatalogPayload() {
  const source = await fsp.readFile(await resolveCatalogPath(), "utf8")
  const value = parseSkillCatalogDocument(parseCatalogJson(source))
  return {
    value,
    payloadBytes: skillCatalogPayloadBytes(value),
    revision: value.revision,
  }
}

const skillCatalogStore = createSignedArtifactStore<SkillCatalogDocument>({
  artifactLabel: "skill library catalog",
  cacheRoot: libraryCatalogCacheRoot,
  loadBundled: readBundledCatalogPayload,
  parsePayload: parseSkillCatalogDocument,
  publicKey: skillArtifactPublicKey,
  remoteUrl: libraryCatalogArtifactUrl,
  revision: (catalog) => catalog.revision,
})

export async function readSkillCatalogSnapshot(options?: { refresh?: boolean }) {
  const resolution = options?.refresh
    ? await skillCatalogStore.refresh()
    : await skillCatalogStore.get()
  return {
    document: resolution.value,
    revision: resolution.revision,
    source: resolution.source,
    syncError: resolution.syncError,
  }
}

export async function readSkillCatalogDocument(): Promise<SkillCatalogDocument> {
  return (await readSkillCatalogSnapshot()).document
}

export function resetSkillCatalogStoreForTests(): void {
  skillCatalogStore.reset()
}

async function readReconciledInstalledSkillLock() {
  const lock = await readInstalledSkillLock()
  let changed = false

  for (const [catalogId, lockEntry] of Object.entries(lock.installed)) {
    const trackedPath = path.resolve(
      lockEntry.state === "active" ? lockEntry.installedPath : lockEntry.withdrawnPath,
    )
    const expectedRoot =
      lockEntry.state === "active" ? managedLibraryRoot() : managedWithdrawnLibraryRoot()
    const trackedStat = await fsp.stat(trackedPath).catch(() => undefined)

    if (!trackedStat?.isDirectory() || !isWithinPath(expectedRoot, trackedPath)) {
      delete lock.installed[catalogId]
      changed = true
    }
  }

  if (changed) {
    await writeInstalledSkillLock(lock)
  }

  return lock
}

export async function listCatalogLibraryItems(
  catalogDocument?: SkillCatalogDocument,
): Promise<SkillLibraryItemView[]> {
  const [catalog, lock] = await Promise.all([
    catalogDocument ? Promise.resolve(catalogDocument) : readSkillCatalogDocument(),
    readReconciledInstalledSkillLock(),
  ])

  return catalog.entries.flatMap((entry) => {
    const lockEntry = lock.installed[entry.id]
    if (entry.status === "withdrawn" && !lockEntry) {
      return []
    }

    const state = resolveCatalogSkillState({ entry, lockEntry })

    return [
      toSkillLibraryItemView({
        entry,
        state,
      }),
    ]
  })
}

export async function readCatalogEntryByID(
  skillID: string,
): Promise<SkillCatalogEntry | undefined> {
  const catalog = await readSkillCatalogDocument()
  return catalog.entries.find((entry) => entry.id === skillID)
}

export async function readCatalogRevision(): Promise<string> {
  return String((await readSkillCatalogSnapshot()).revision)
}

async function refreshSkillRuntime(): Promise<void> {
  await OpenCodeInstance.disposeAll()
}

async function nextWithdrawnSkillPath(catalogId: string): Promise<string> {
  const root = managedWithdrawnLibraryRoot()
  const base = path.join(root, catalogId)
  const timestamp = Date.now()

  for (let attempt = 0; attempt < WITHDRAWN_PATH_MAX_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${timestamp}-${attempt}`
    const exists = await fsp.stat(candidate).then(
      () => true,
      () => false,
    )
    if (!exists) {
      return candidate
    }
  }

  throw new SkillServiceError("conflict", `Could not allocate withdrawn path for ${catalogId}`)
}

async function rollbackWithdrawnSkillMoves(moves: WithdrawnSkillMove[]): Promise<void> {
  for (const move of moves.toReversed()) {
    const [withdrawnStat, installedStat] = await Promise.all([
      fsp.stat(move.withdrawnPath).catch(() => undefined),
      fsp.stat(move.installedPath).catch(() => undefined),
    ])
    if (!withdrawnStat?.isDirectory() || installedStat) {
      continue
    }

    await fsp.mkdir(path.dirname(move.installedPath), { recursive: true }).catch(() => undefined)
    await fsp.rename(move.withdrawnPath, move.installedPath).catch(() => undefined)
  }
}

export async function reconcileWithdrawnLibrarySkills(
  catalogDocument?: SkillCatalogDocument,
  dependencies?: {
    clearSkillPermission?: typeof clearSkillPermission
    refreshSkillRuntime?: () => Promise<void>
    setSkillPermission?: typeof setSkillPermission
    systemSkillNames?: readonly string[]
  },
): Promise<void> {
  const clearPermission = dependencies?.clearSkillPermission ?? clearSkillPermission
  const denySkill = dependencies?.setSkillPermission ?? setSkillPermission
  const refreshRuntime = dependencies?.refreshSkillRuntime ?? refreshSkillRuntime
  const systemSkillNames = new Set(
    dependencies?.systemSkillNames ?? allBuddySkills().map((skill) => skill.name),
  )
  const [catalog, lock] = await Promise.all([
    catalogDocument ? Promise.resolve(catalogDocument) : readSkillCatalogDocument(),
    readReconciledInstalledSkillLock(),
  ])
  const withdrawnCatalogIds = new Set(
    catalog.entries.filter((entry) => entry.status === "withdrawn").map((entry) => entry.id),
  )
  let changed = false
  let runtimeRefreshPending = false
  const movedSkills: WithdrawnSkillMove[] = []

  try {
    for (const [catalogId, lockEntry] of Object.entries(lock.installed)) {
      if (!withdrawnCatalogIds.has(catalogId)) {
        continue
      }
      if (lockEntry.state !== "active") {
        if (lockEntry.runtimeRefreshPending) runtimeRefreshPending = true
        continue
      }

      await ensureManagedSkillPathReady()

      const installedPath = path.resolve(lockEntry.installedPath)
      if (!isWithinPath(managedLibraryRoot(), installedPath)) {
        throw new SkillServiceError(
          "forbidden",
          `Refusing to withdraw library skill outside Buddy-managed storage: ${catalogId}`,
        )
      }

      const withdrawnPath = await nextWithdrawnSkillPath(catalogId)
      const installedStat = await fsp.stat(installedPath).catch(() => undefined)
      if (installedStat?.isDirectory()) {
        await fsp.mkdir(path.dirname(withdrawnPath), { recursive: true })
        await fsp.rename(installedPath, withdrawnPath)
        movedSkills.push({
          catalogId,
          installedPath,
          withdrawnPath,
          previousEntry: lockEntry,
        })
      }

      lock.installed[catalogId] = {
        catalogId: lockEntry.catalogId,
        displayName: lockEntry.displayName,
        skillName: lockEntry.skillName,
        source: lockEntry.source,
        integrity: lockEntry.integrity,
        installedAt: lockEntry.installedAt,
        scannerPolicyVersion: lockEntry.scannerPolicyVersion,
        catalogRevision: lockEntry.catalogRevision,
        state: "withdrawn",
        withdrawnPath,
        withdrawnAt: new Date().toISOString(),
        runtimeRefreshPending: true,
      }
      changed = true
      runtimeRefreshPending = true
    }

    if (changed) await writeInstalledSkillLock(lock)
  } catch (error) {
    await rollbackWithdrawnSkillMoves(movedSkills)
    throw error
  }

  let permissionDispositionChanged = false
  for (const [catalogId, lockEntry] of Object.entries(lock.installed)) {
    if (!withdrawnCatalogIds.has(catalogId) || lockEntry.state !== "withdrawn") {
      continue
    }

    const replacementExists = systemSkillNames.has(lockEntry.skillName)
    const permissionDisposition = replacementExists
      ? WITHDRAWN_PERMISSION_DISPOSITION.systemReplacement
      : WITHDRAWN_PERMISSION_DISPOSITION.denied
    if (lockEntry.permissionDisposition === permissionDisposition) {
      continue
    }

    if (replacementExists) {
      await clearPermission(lockEntry.skillName)
    } else {
      await denySkill(lockEntry.skillName, "deny")
    }
    lock.installed[catalogId] = {
      ...lockEntry,
      permissionDisposition,
    }
    permissionDispositionChanged = true
  }
  if (permissionDispositionChanged) await writeInstalledSkillLock(lock)
  if (!runtimeRefreshPending) return

  await refreshRuntime()
  for (const [catalogId, lockEntry] of Object.entries(lock.installed)) {
    if (
      withdrawnCatalogIds.has(catalogId) &&
      lockEntry.state === "withdrawn" &&
      lockEntry.runtimeRefreshPending
    ) {
      lockEntry.runtimeRefreshPending = false
    }
  }
  await writeInstalledSkillLock(lock)
}
