import fsp from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { CreateCustomSkillInput, SkillRuleAction } from "./contracts"
import { SkillServiceError } from "./contracts"
import {
  loadManagedSkillFile,
  readOptionalString,
  sanitizeSkillName,
  skillDocument,
} from "./documents"
import { resolveInstalledSkillByName } from "./discovery"
import { fetchPinnedGitHubSkill } from "./github-fetcher"
import { readCatalogEntryByID } from "./library"
import { readInstalledSkillLock, writeInstalledSkillLock } from "./lock"
import {
  curatedSkillsCacheRoot,
  ensureManagedSkillPathReady,
  isWithinPath,
  managedCustomRoot,
  managedLibraryRoot,
  managedSkillsRoot,
  managedSource,
  managedWithdrawnLibraryRoot,
} from "./paths"
import { clearSkillPermission, setSkillPermission } from "./permissions"
import { SCANNER_POLICY_VERSION, scanSkillDirectory } from "./scanner"
import { listSkillsCatalog } from "./catalog"
import { computeSkillTreeSha256 } from "./tree-hash"
import { shouldIncludeSkillTreePath } from "./tree-limits"

const SKILL_DOCUMENT_FILENAME = "SKILL.md"
const CURATED_SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

async function writeManagedSkillFile(folder: string, document: string) {
  await fsp.mkdir(folder, { recursive: true })
  await fsp.writeFile(path.join(folder, SKILL_DOCUMENT_FILENAME), document, "utf8")
}

async function refreshSkillRuntime() {
  await OpenCodeInstance.disposeAll()
}

function requiredSkillName(name: string) {
  const normalized = name.trim()
  if (!normalized) {
    throw new SkillServiceError("invalid_input", "Skill name is required")
  }
  return normalized
}

async function findInstalledSkillOrThrow(name: string, directory: string) {
  const existing = await resolveInstalledSkillByName(name, directory)
  if (!existing) {
    throw new SkillServiceError("not_found", `Skill "${name}" not found`)
  }
  return existing
}

function validateLibrarySkillID(input: string) {
  const normalized = input.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(normalized)) {
    throw new SkillServiceError("invalid_input", "Invalid skill library item")
  }
  return normalized
}

function validateCuratedSkillName(input: string) {
  if (!CURATED_SKILL_NAME_PATTERN.test(input)) {
    throw new SkillServiceError(
      "invalid_input",
      `Curated skill name "${input}" must use lowercase letters, numbers, dashes, or underscores`,
    )
  }
  return input
}

function ensureExpectedIntegrity(input: {
  expectedSha256: string
  actualSha256: string
  expectedFileCount?: number
  actualFileCount: number
  expectedSizeBytes?: number
  actualSizeBytes: number
}) {
  if (input.actualSha256.toLowerCase() !== input.expectedSha256.toLowerCase()) {
    throw new SkillServiceError("forbidden", "Fetched skill does not match approved integrity hash")
  }
  if (input.expectedFileCount !== undefined && input.actualFileCount !== input.expectedFileCount) {
    throw new SkillServiceError("forbidden", "Fetched skill file count does not match catalog")
  }
  if (input.expectedSizeBytes !== undefined && input.actualSizeBytes !== input.expectedSizeBytes) {
    throw new SkillServiceError("forbidden", "Fetched skill size does not match catalog")
  }
}

function ensureApprovedScanWarnings(input: {
  approvedWarningRuleIDs: string[] | undefined
  actualWarningRuleIDs: string[]
}) {
  if (input.actualWarningRuleIDs.length === 0) {
    return
  }

  const approvedWarningRuleIDs = new Set(input.approvedWarningRuleIDs ?? [])
  const unapprovedWarningRuleID = input.actualWarningRuleIDs.find(
    (ruleID) => !approvedWarningRuleIDs.has(ruleID),
  )
  if (!unapprovedWarningRuleID) {
    return
  }

  throw new SkillServiceError(
    "forbidden",
    `Fetched skill has unapproved scanner warning: ${unapprovedWarningRuleID}`,
  )
}

async function copySkillTree(
  sourceRoot: string,
  targetRoot: string,
  treeRoot = sourceRoot,
): Promise<void> {
  await fsp.mkdir(targetRoot, { recursive: true })
  const entries = await fsp.readdir(sourceRoot, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))

  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name)
    if (!shouldIncludeSkillTreePath(treeRoot, sourcePath)) {
      continue
    }

    const targetPath = path.join(targetRoot, entry.name)
    const stat = await fsp.lstat(sourcePath)
    if (stat.isSymbolicLink()) {
      throw new SkillServiceError("forbidden", "Refusing to install skill tree containing symlinks")
    }
    if (stat.isDirectory()) {
      await copySkillTree(sourcePath, targetPath, treeRoot)
      continue
    }
    if (!stat.isFile()) {
      throw new SkillServiceError("forbidden", "Refusing to install non-file skill tree entry")
    }

    await fsp.mkdir(path.dirname(targetPath), { recursive: true })
    await fsp.copyFile(sourcePath, targetPath)
    await fsp.chmod(targetPath, stat.mode & 0o777)
  }
}

type PublishedSkillTree = {
  replacedBackupRoot?: string
}

async function publishSkillTree(input: {
  catalogId: string
  sourceRoot: string
  targetRoot: string
  replaceExisting?: boolean
}): Promise<PublishedSkillTree> {
  const stagingRoot = path.join(
    curatedSkillsCacheRoot(),
    "skill-installs",
    `.install-${input.catalogId}-${process.pid}-${Date.now()}`,
  )
  const backupRoot = path.join(
    curatedSkillsCacheRoot(),
    "skill-install-backups",
    `.backup-${input.catalogId}-${process.pid}-${Date.now()}`,
  )

  await fsp.rm(stagingRoot, { recursive: true, force: true })
  await fsp.rm(backupRoot, { recursive: true, force: true })
  try {
    await copySkillTree(input.sourceRoot, stagingRoot)
    const existingTarget = await fsp.stat(input.targetRoot).catch(() => undefined)
    if (existingTarget) {
      if (!input.replaceExisting) {
        throw new SkillServiceError(
          "conflict",
          `Skill library item "${input.catalogId}" is already installed`,
        )
      }

      await fsp.mkdir(path.dirname(backupRoot), { recursive: true })
      await fsp.rename(input.targetRoot, backupRoot)
    }
    try {
      await fsp.rename(stagingRoot, input.targetRoot)
    } catch (error) {
      const backupStat = await fsp.stat(backupRoot).catch(() => undefined)
      const targetStat = await fsp.stat(input.targetRoot).catch(() => undefined)
      if (backupStat?.isDirectory() && !targetStat) {
        await fsp.rename(backupRoot, input.targetRoot).catch(() => undefined)
      }
      throw error
    }

    return existingTarget ? { replacedBackupRoot: backupRoot } : {}
  } catch (error) {
    await fsp.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export async function installCuratedLibrarySkill(skillID: string, directory: string) {
  const normalizedSkillID = validateLibrarySkillID(skillID)
  const entry = await readCatalogEntryByID(normalizedSkillID)
  if (!entry || entry.status !== "approved") {
    throw new SkillServiceError("not_found", "Unknown skill library item")
  }

  await ensureManagedSkillPathReady()

  const lock = await readInstalledSkillLock()
  const existingLockEntry = lock.installed[normalizedSkillID]
  const targetRoot = path.join(managedLibraryRoot(), normalizedSkillID)
  let replaceExistingInstall = false
  if (existingLockEntry?.state === "active") {
    const installedStat = await fsp.stat(existingLockEntry.installedPath).catch(() => undefined)
    if (installedStat?.isDirectory()) {
      const installedSkill = await loadManagedSkillFile(
        path.join(existingLockEntry.installedPath, SKILL_DOCUMENT_FILENAME),
      )
      if (installedSkill?.name === existingLockEntry.skillName) {
        return existingLockEntry.skillName
      }

      replaceExistingInstall = true
    }
  }
  if (existingLockEntry?.state === "withdrawn") {
    throw new SkillServiceError("forbidden", "Withdrawn library skills cannot be reinstalled")
  }

  const fetched = await fetchPinnedGitHubSkill(entry.source)
  let published = false
  let lockWritten = false
  let permissionSetSkillName: string | undefined
  let publishedSkillTree: PublishedSkillTree | undefined

  try {
    const skill = await loadManagedSkillFile(path.join(fetched.skillRoot, SKILL_DOCUMENT_FILENAME))
    if (!skill) {
      throw new SkillServiceError("invalid_input", "Fetched skill has invalid SKILL.md metadata")
    }
    const skillName = validateCuratedSkillName(skill.name)
    const existingSkill = await resolveInstalledSkillByName(skillName, directory)
    if (
      existingSkill &&
      (!replaceExistingInstall || path.resolve(path.dirname(existingSkill.location)) !== targetRoot)
    ) {
      throw new SkillServiceError("conflict", `Skill "${skillName}" already exists`)
    }

    const sha256 = await computeSkillTreeSha256(fetched.skillRoot)
    ensureExpectedIntegrity({
      expectedSha256: entry.integrity.sha256,
      actualSha256: sha256,
      expectedFileCount: entry.integrity.fileCount,
      actualFileCount: fetched.stats.fileCount,
      expectedSizeBytes: entry.integrity.sizeBytes,
      actualSizeBytes: fetched.stats.totalBytes,
    })

    const scan = await scanSkillDirectory(fetched.skillRoot)
    if (scan.decision === "block") {
      const approvedBlockRuleIDs = new Set(entry.review.approvedBlockRuleIDs ?? [])
      const actualBlockRuleIDs = new Set(
        scan.findings
          .filter((finding) => finding.severity === "block")
          .map((finding) => finding.ruleId),
      )
      const unapprovedBlockRuleIDs = Array.from(actualBlockRuleIDs).filter(
        (ruleID) => !approvedBlockRuleIDs.has(ruleID),
      )
      if (unapprovedBlockRuleIDs.length > 0) {
        throw new SkillServiceError(
          "forbidden",
          `Fetched skill failed the security scan: unapproved block finding(s): ${unapprovedBlockRuleIDs.toSorted().join(",")}`,
        )
      }
    }
    ensureApprovedScanWarnings({
      approvedWarningRuleIDs: entry.review.approvedWarningRuleIDs,
      actualWarningRuleIDs: Array.from(
        new Set(
          scan.findings
            .filter((finding) => finding.severity === "warn")
            .map((finding) => finding.ruleId),
        ),
      ).toSorted(),
    })

    publishedSkillTree = await publishSkillTree({
      catalogId: normalizedSkillID,
      sourceRoot: fetched.skillRoot,
      targetRoot,
      replaceExisting: replaceExistingInstall,
    })
    published = true

    const nextLock = await readInstalledSkillLock()
    nextLock.installed[normalizedSkillID] = {
      catalogId: normalizedSkillID,
      displayName: entry.displayName,
      skillName,
      source: fetched.source,
      integrity: {
        algorithm: entry.integrity.algorithm,
        sha256,
        sizeBytes: fetched.stats.totalBytes,
        fileCount: fetched.stats.fileCount,
      },
      installedAt: new Date().toISOString(),
      scannerPolicyVersion: SCANNER_POLICY_VERSION,
      state: "active",
      installedPath: targetRoot,
    }
    await setSkillPermission(skillName, "allow")
    permissionSetSkillName = skillName
    await writeInstalledSkillLock(nextLock)
    lockWritten = true
    await refreshSkillRuntime()
    if (publishedSkillTree?.replacedBackupRoot) {
      await fsp
        .rm(publishedSkillTree.replacedBackupRoot, {
          recursive: true,
          force: true,
        })
        .catch(() => undefined)
    }

    return skillName
  } catch (error) {
    if (lockWritten) {
      const nextLock = await readInstalledSkillLock().catch(() => undefined)
      if (nextLock) {
        delete nextLock.installed[normalizedSkillID]
        await writeInstalledSkillLock(nextLock).catch(() => undefined)
      }
    }
    if (permissionSetSkillName) {
      await clearSkillPermission(permissionSetSkillName).catch(() => undefined)
    }
    if (published) {
      await fsp.rm(targetRoot, { recursive: true, force: true }).catch(() => undefined)
      if (publishedSkillTree?.replacedBackupRoot) {
        const [backupStat, targetStat] = await Promise.all([
          fsp.stat(publishedSkillTree.replacedBackupRoot).catch(() => undefined),
          fsp.stat(targetRoot).catch(() => undefined),
        ])
        if (backupStat?.isDirectory() && !targetStat) {
          await fsp.rename(publishedSkillTree.replacedBackupRoot, targetRoot).catch(() => undefined)
        }
      }
    }
    throw error
  } finally {
    await fetched.cleanup()
  }
}

export async function createCustomSkill(input: CreateCustomSkillInput, directory: string) {
  const name = sanitizeSkillName(input.name)
  if (!name) {
    throw new SkillServiceError("invalid_input", "Skill name must include letters or numbers")
  }

  if (await resolveInstalledSkillByName(name, directory)) {
    throw new SkillServiceError("conflict", `Skill "${name}" already exists`)
  }

  const folder = path.join(managedCustomRoot(), name)
  const existing = await fsp.stat(path.join(folder, "SKILL.md")).catch(() => undefined)
  if (existing?.isFile()) {
    throw new SkillServiceError("conflict", `Skill "${name}" already exists`)
  }

  await ensureManagedSkillPathReady()
  await writeManagedSkillFile(
    folder,
    skillDocument({
      name,
      description: input.description.trim(),
      examplePrompt: readOptionalString(input.examplePrompt),
      content: input.content,
    }),
  )
  await setSkillPermission(name, "allow")
  await refreshSkillRuntime()

  return name
}

export async function setInstalledSkillAction(
  name: string,
  action: SkillRuleAction,
  directory: string,
) {
  const normalizedName = requiredSkillName(name)
  const existing = await findInstalledSkillOrThrow(normalizedName, directory)

  if (action === "inherit") {
    await clearSkillPermission(existing.name)
  } else {
    await setSkillPermission(existing.name, action)
  }
  await refreshSkillRuntime()

  const updatedCatalog = await listSkillsCatalog(directory)
  const updatedSkill = updatedCatalog.installed.find((skill) => skill.name === existing.name)
  if (!updatedSkill) {
    throw new SkillServiceError("not_found", `Skill "${existing.name}" not found after update`)
  }

  return updatedSkill
}

export async function removeManagedSkill(name: string, directory: string) {
  const normalizedName = requiredSkillName(name)
  const existing = await findInstalledSkillOrThrow(normalizedName, directory)

  const ownership = managedSource(existing.location)
  if (!ownership.managed) {
    throw new SkillServiceError("forbidden", "Only Buddy-managed skills can be removed")
  }
  if (!ownership.removable) {
    throw new SkillServiceError("forbidden", `Skill "${existing.name}" cannot be removed`)
  }

  const folder = path.dirname(existing.location)
  const relative = path.relative(managedSkillsRoot(), folder)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SkillServiceError(
      "forbidden",
      "Refusing to remove a skill outside Buddy-managed storage",
    )
  }

  await fsp.rm(folder, {
    recursive: true,
    force: true,
  })
  await clearSkillPermission(existing.name)

  if (ownership.libraryID) {
    const lock = await readInstalledSkillLock()
    delete lock.installed[ownership.libraryID]
    await writeInstalledSkillLock(lock)
  }
  await refreshSkillRuntime()

  return normalizedName
}

export async function removeCuratedLibrarySkill(skillID: string, directory: string) {
  const normalizedSkillID = validateLibrarySkillID(skillID)
  const lock = await readInstalledSkillLock()
  const lockEntry = lock.installed[normalizedSkillID]
  if (!lockEntry) {
    throw new SkillServiceError("not_found", "Installed library skill not found")
  }

  const storageRoot =
    lockEntry.state === "active" ? managedLibraryRoot() : managedWithdrawnLibraryRoot()
  const skillPath = path.resolve(
    lockEntry.state === "active" ? lockEntry.installedPath : lockEntry.withdrawnPath,
  )
  if (!isWithinPath(storageRoot, skillPath)) {
    throw new SkillServiceError(
      "forbidden",
      "Refusing to remove a library skill outside Buddy-managed storage",
    )
  }

  await fsp.rm(skillPath, {
    recursive: true,
    force: true,
  })
  const replacementSkill = await resolveInstalledSkillByName(lockEntry.skillName, directory)
  if (!replacementSkill) {
    await clearSkillPermission(lockEntry.skillName)
  }
  delete lock.installed[normalizedSkillID]
  await writeInstalledSkillLock(lock)
  await refreshSkillRuntime()

  return lockEntry.skillName
}
