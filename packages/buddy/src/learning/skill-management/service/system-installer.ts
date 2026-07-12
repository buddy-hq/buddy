import fsp from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { BuddySkill } from "../../runtime/define-buddy-skill"
import {
  skillArtifactPublicKey,
  systemSkillPackArtifactUrl,
} from "./artifact-config"
import { renderBuddySkillManifest } from "./manifests"
import { ensureManagedSkillPathReady, managedSkillsRoot, managedSystemRoot, systemSkillPackCacheRoot } from "./paths"
import { createSignedArtifactStore, type SignedArtifactResolution } from "./signed-artifact"
import {
  buildBundledSystemSkillPack,
  parseSystemSkillPack,
  SYSTEM_SKILL_RUNTIME_CONTRACT_VERSION,
  systemSkillPackFileBytes,
  systemSkillPackPayloadBytes,
  type SystemSkillPack,
  type SystemSkillPackCompatibility,
} from "./system-pack"

const SYSTEM_SKILLS_FINGERPRINT_FILE = ".buddy-system-skills.fingerprint"
const SYSTEM_SKILL_PACK_CACHE_CONTRACT_PREFIX = "contract"
const SYSTEM_SKILL_STAGING_PREFIX = ".system-staging"
const SYSTEM_SKILL_BACKUP_PREFIX = ".system-backup"

type SystemSkillStore = ReturnType<typeof createSignedArtifactStore<SystemSkillPack>>

const storeByBaseline = new Map<string, SystemSkillStore>()
const bundledPackBySource = new Map<string, Promise<SystemSkillPack>>()
let publishQueue = Promise.resolve()

function systemPackCacheRoot(baseFingerprint: string): string {
  return path.join(
    systemSkillPackCacheRoot(),
    `${SYSTEM_SKILL_PACK_CACHE_CONTRACT_PREFIX}-${SYSTEM_SKILL_RUNTIME_CONTRACT_VERSION}`,
    baseFingerprint,
  )
}

function expectedCompatibility(
  bundledPack: SystemSkillPack,
  skills: readonly BuddySkill[],
): SystemSkillPackCompatibility {
  return {
    baseFingerprint: bundledPack.contentFingerprint,
    runtimeContractVersion: SYSTEM_SKILL_RUNTIME_CONTRACT_VERSION,
    skillNames: skills.map((skill) => skill.name),
    skillManifests: new Map(
      skills.map((skill) => [skill.name, renderBuddySkillManifest(skill.presentation)]),
    ),
  }
}

function storeKey(compatibility: SystemSkillPackCompatibility): string {
  return `${compatibility.runtimeContractVersion}:${compatibility.baseFingerprint}`
}

function systemSkillStore(
  bundledPack: SystemSkillPack,
  skills: readonly BuddySkill[],
): SystemSkillStore {
  const compatibility = expectedCompatibility(bundledPack, skills)
  const key = storeKey(compatibility)
  const existing = storeByBaseline.get(key)
  if (existing) return existing

  const store = createSignedArtifactStore<SystemSkillPack>({
    artifactLabel: "system skill pack",
    cacheRoot: () => systemPackCacheRoot(compatibility.baseFingerprint),
    loadBundled: async () => ({
      value: bundledPack,
      payloadBytes: systemSkillPackPayloadBytes(bundledPack),
      revision: bundledPack.revision,
    }),
    parsePayload: (value) => parseSystemSkillPack(value, compatibility),
    publicKey: skillArtifactPublicKey,
    remoteUrl: () => systemSkillPackArtifactUrl(compatibility.baseFingerprint),
    revision: (pack) => pack.revision,
  })
  storeByBaseline.set(key, store)
  return store
}

async function listInstalledSystemSkillFiles(root: string): Promise<string[] | undefined> {
  const files: string[] = []
  const pending = [root]

  try {
    while (pending.length > 0) {
      const current = pending.pop()
      if (!current) continue
      const entries = await fsp.readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        const entryPath = path.join(current, entry.name)
        if (entry.isSymbolicLink()) return undefined
        if (entry.isDirectory()) {
          pending.push(entryPath)
          continue
        }
        if (!entry.isFile()) return undefined
        const relativePath = path.relative(root, entryPath).split(path.sep).join("/")
        if (relativePath !== SYSTEM_SKILLS_FINGERPRINT_FILE) files.push(relativePath)
      }
    }
  } catch {
    return undefined
  }

  return files.toSorted()
}

async function destinationMatchesPack(pack: SystemSkillPack): Promise<boolean> {
  const fingerprint = await fsp
    .readFile(path.join(managedSystemRoot(), SYSTEM_SKILLS_FINGERPRINT_FILE), "utf8")
    .catch(() => undefined)
  if (fingerprint?.trim() !== pack.contentFingerprint) return false

  const rootEntries = await fsp.readdir(managedSystemRoot(), { withFileTypes: true }).catch(() => [])
  const installedSkillNames = rootEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted()
  const expectedSkillNames = pack.skills.map((skill) => skill.name).toSorted()
  if (
    installedSkillNames.length !== expectedSkillNames.length ||
    installedSkillNames.some((name, index) => name !== expectedSkillNames[index])
  ) {
    return false
  }

  const expectedFilePaths = pack.skills
    .flatMap((skill) => skill.files.map((file) => `${skill.name}/${file.path}`))
    .toSorted()
  const installedFilePaths = await listInstalledSystemSkillFiles(managedSystemRoot())
  if (
    !installedFilePaths ||
    installedFilePaths.length !== expectedFilePaths.length ||
    installedFilePaths.some((file, index) => file !== expectedFilePaths[index])
  ) {
    return false
  }

  const filesMatch = await Promise.all(
    pack.skills.flatMap((skill) =>
      skill.files.map(async (file) => {
        const filepath = path.join(managedSystemRoot(), skill.name, ...file.path.split("/"))
        const installedBytes = await fsp.readFile(filepath).catch(() => undefined)
        return (
          installedBytes !== undefined &&
          installedBytes.equals(Buffer.from(systemSkillPackFileBytes(file)))
        )
      }),
    ),
  )
  return filesMatch.every((matches) => matches)
}

async function materializePack(pack: SystemSkillPack, targetRoot: string): Promise<void> {
  await fsp.mkdir(targetRoot, { recursive: true })
  await Promise.all(
    pack.skills.flatMap((skill) =>
      skill.files.map(async (file) => {
        const filepath = path.join(targetRoot, skill.name, ...file.path.split("/"))
        await fsp.mkdir(path.dirname(filepath), { recursive: true })
        await fsp.writeFile(filepath, systemSkillPackFileBytes(file))
      }),
    ),
  )
  await fsp.writeFile(
    path.join(targetRoot, SYSTEM_SKILLS_FINGERPRINT_FILE),
    `${pack.contentFingerprint}\n`,
    "utf8",
  )
}

async function cleanupStaleTransactions(parent: string): Promise<void> {
  const entries = await fsp.readdir(parent, { withFileTypes: true }).catch(() => [])
  await Promise.all(
    entries.flatMap((entry) => {
      if (
        !entry.name.startsWith(SYSTEM_SKILL_STAGING_PREFIX) &&
        !entry.name.startsWith(SYSTEM_SKILL_BACKUP_PREFIX)
      ) {
        return []
      }
      return [fsp.rm(path.join(parent, entry.name), { recursive: true, force: true })]
    }),
  )
}

async function publishPackOnce(pack: SystemSkillPack): Promise<boolean> {
  if (await destinationMatchesPack(pack)) return false

  await ensureManagedSkillPathReady()
  const parent = managedSkillsRoot()
  await cleanupStaleTransactions(parent)
  const nonce = `${process.pid}-${Date.now()}`
  const stagingRoot = path.join(parent, `${SYSTEM_SKILL_STAGING_PREFIX}-${nonce}`)
  const backupRoot = path.join(parent, `${SYSTEM_SKILL_BACKUP_PREFIX}-${nonce}`)
  const systemRoot = managedSystemRoot()

  await Promise.all([
    fsp.rm(stagingRoot, { recursive: true, force: true }),
    fsp.rm(backupRoot, { recursive: true, force: true }),
  ])
  await materializePack(pack, stagingRoot)

  let existingMoved = false
  try {
    const existing = await fsp.stat(systemRoot).catch(() => undefined)
    if (existing) {
      await fsp.rename(systemRoot, backupRoot)
      existingMoved = true
    }
    try {
      await fsp.rename(stagingRoot, systemRoot)
    } catch (error) {
      if (existingMoved) {
        await fsp.rename(backupRoot, systemRoot).catch(() => undefined)
      }
      throw error
    }
    await fsp.rm(backupRoot, { recursive: true, force: true }).catch(() => undefined)
    return true
  } catch (error) {
    await fsp.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function publishPack(pack: SystemSkillPack): Promise<boolean> {
  let changed = false
  const operation = publishQueue.then(async () => {
    changed = await publishPackOnce(pack)
  })
  publishQueue = operation.catch(() => undefined)
  await operation
  return changed
}

async function bundledPack(sourceRoots: string[], skills: readonly BuddySkill[]) {
  const key = JSON.stringify({
    roots: sourceRoots.map((root) => path.resolve(root)).toSorted(),
    skills: skills
      .map((skill) => ({
        name: skill.name,
        presentation: skill.presentation,
      }))
      .toSorted((left, right) => left.name.localeCompare(right.name)),
  })
  const existing = bundledPackBySource.get(key)
  if (existing) return await existing
  const task = buildBundledSystemSkillPack({
    roots: sourceRoots,
    skills,
  }).catch((error: unknown) => {
    bundledPackBySource.delete(key)
    throw error
  })
  bundledPackBySource.set(key, task)
  return await task
}

async function resolveSystemSkillPack(input: {
  sourceRoots: string[]
  skills: readonly BuddySkill[]
  refresh?: boolean
}): Promise<SignedArtifactResolution<SystemSkillPack>> {
  const bundled = await bundledPack(input.sourceRoots, input.skills)
  const store = systemSkillStore(bundled, input.skills)
  return input.refresh ? await store.refresh() : await store.get()
}

export async function ensureSystemSkillsInstalled(
  sourceRoots: string[],
  skills: readonly BuddySkill[],
): Promise<void> {
  const resolution = await resolveSystemSkillPack({ sourceRoots, skills })
  await publishPack(resolution.value)
}

export async function refreshSystemSkillPack(
  sourceRoots: string[],
  skills: readonly BuddySkill[],
  dependencies?: {
    refreshSkillRuntime?: () => Promise<void>
  },
): Promise<{ changed: boolean; syncError?: string }> {
  const resolution = await resolveSystemSkillPack({
    sourceRoots,
    skills,
    refresh: true,
  })
  const changed = await publishPack(resolution.value)
  if (changed) {
    await (dependencies?.refreshSkillRuntime ?? OpenCodeInstance.disposeAll)()
  }
  return {
    changed,
    ...(resolution.syncError ? { syncError: resolution.syncError } : {}),
  }
}

export async function readInstalledSystemSkillsFingerprint(): Promise<string | undefined> {
  const value = await fsp
    .readFile(path.join(managedSystemRoot(), SYSTEM_SKILLS_FINGERPRINT_FILE), "utf8")
    .catch(() => undefined)
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export function resetSystemSkillPackStoresForTests(): void {
  for (const store of storeByBaseline.values()) {
    store.reset()
  }
  storeByBaseline.clear()
  bundledPackBySource.clear()
  publishQueue = Promise.resolve()
}
