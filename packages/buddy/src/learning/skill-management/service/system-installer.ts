import { createHash } from "node:crypto"
import fsp from "node:fs/promises"
import path from "node:path"
import { ensureManagedSkillPathReady, managedSystemRoot } from "./paths"
import { BUDDY_SKILL_MANIFEST_RELATIVE_PATH, renderBuddySkillManifest } from "./manifests"
import { loadManagedSkillFile } from "./documents"
import type { BuddySkill } from "../../runtime/define-buddy-skill"

type BundledSkillSource = {
  name: string
  directory: string
  manifest: string
}

const SYSTEM_SKILLS_FINGERPRINT_FILE = ".buddy-system-skills.fingerprint"

async function readDirectoryEntries(directory: string) {
  return fsp
    .readdir(directory, {
      withFileTypes: true,
    })
    .catch(() => [])
}

function sortByName<T extends { name: string }>(entries: T[]) {
  return entries.toSorted((left, right) => left.name.localeCompare(right.name))
}

async function listFilesRecursively(directory: string): Promise<string[]> {
  const entries = sortByName(await readDirectoryEntries(directory))

  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(full)))
      continue
    }

    if (entry.isFile()) {
      files.push(full)
    }
  }

  return files
}

async function collectBundledSystemSkillDirectories(
  roots: string[],
  skills: readonly BuddySkill[],
): Promise<BundledSkillSource[]> {
  const sources = new Map<string, BundledSkillSource>()
  const manifests = new Map(
    skills.map((skill) => [skill.name, renderBuddySkillManifest(skill.presentation)]),
  )

  for (const root of roots) {
    const entries = sortByName(await readDirectoryEntries(root))
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (sources.has(entry.name)) continue

      const directory = path.join(root, entry.name)
      const skillDocument = path.join(directory, "SKILL.md")
      const skill = await loadManagedSkillFile(skillDocument)
      if (!skill) continue
      const manifest = manifests.get(skill.name)
      if (!manifest) {
        throw new Error(`Bundled skill "${skill.name}" is missing typed presentation metadata`)
      }

      sources.set(entry.name, {
        name: entry.name,
        directory,
        manifest,
      })
    }
  }

  return Array.from(sources.values()).toSorted((left, right) => left.name.localeCompare(right.name))
}

async function fingerprintBundledSources(sources: BundledSkillSource[]) {
  const hash = createHash("sha256")

  for (const source of sources) {
    hash.update(`${source.name}\n`)
    const files = await listFilesRecursively(source.directory)
    for (const file of files) {
      const relative = path.relative(source.directory, file)
      if (relative === BUDDY_SKILL_MANIFEST_RELATIVE_PATH) {
        continue
      }
      const content = await fsp.readFile(file)
      hash.update(relative)
      hash.update("\n")
      hash.update(content)
      hash.update("\n")
    }
    hash.update(BUDDY_SKILL_MANIFEST_RELATIVE_PATH)
    hash.update("\n")
    hash.update(source.manifest)
    hash.update("\n")
  }

  return hash.digest("hex")
}

async function destinationMatchesSources(destinationRoot: string, sources: BundledSkillSource[]) {
  for (const source of sources) {
    const destinationSkillFile = path.join(destinationRoot, source.name, "SKILL.md")
    const destinationManifestPath = path.join(
      destinationRoot,
      source.name,
      BUDDY_SKILL_MANIFEST_RELATIVE_PATH,
    )
    const [skillStats, destinationManifest] = await Promise.all([
      fsp.stat(destinationSkillFile).catch(() => undefined),
      fsp.readFile(destinationManifestPath, "utf8").catch(() => undefined),
    ])
    if (!skillStats?.isFile()) {
      return false
    }
    if (destinationManifest !== source.manifest) {
      return false
    }
  }

  return true
}

async function readSystemSkillsFingerprint(markerPath: string) {
  return fsp.readFile(markerPath, "utf8").catch(() => undefined)
}

async function shouldSkipSystemSkillInstall(input: {
  markerPath: string
  nextFingerprint: string
  systemRoot: string
  sources: BundledSkillSource[]
}) {
  const existingFingerprint = await readSystemSkillsFingerprint(input.markerPath)
  if (existingFingerprint?.trim() !== input.nextFingerprint) {
    return false
  }

  return destinationMatchesSources(input.systemRoot, input.sources)
}

async function clearDirectoryContents(directory: string) {
  const entries = await readDirectoryEntries(directory)
  for (const entry of entries) {
    await fsp.rm(path.join(directory, entry.name), {
      recursive: true,
      force: true,
    })
  }
}

async function copySourcesToSystemRoot(systemRoot: string, sources: BundledSkillSource[]) {
  for (const source of sources) {
    const destination = path.join(systemRoot, source.name)
    await fsp.cp(source.directory, destination, {
      recursive: true,
      force: true,
    })
    const manifestPath = path.join(destination, BUDDY_SKILL_MANIFEST_RELATIVE_PATH)
    await fsp.mkdir(path.dirname(manifestPath), { recursive: true })
    await fsp.writeFile(manifestPath, source.manifest, "utf8")
  }
}

export async function ensureBundledSystemSkillsInstalled(
  sourceRoots: string[],
  skills: readonly BuddySkill[],
): Promise<void> {
  const sources = await collectBundledSystemSkillDirectories(sourceRoots, skills)
  if (!sources.length) {
    return
  }

  await ensureManagedSkillPathReady()

  const systemRoot = managedSystemRoot()
  const markerPath = path.join(systemRoot, SYSTEM_SKILLS_FINGERPRINT_FILE)
  const nextFingerprint = await fingerprintBundledSources(sources)

  const shouldSkipInstall = await shouldSkipSystemSkillInstall({
    markerPath,
    nextFingerprint,
    systemRoot,
    sources,
  })
  if (shouldSkipInstall) return

  await clearDirectoryContents(systemRoot)
  await copySourcesToSystemRoot(systemRoot, sources)

  await fsp.writeFile(markerPath, `${nextFingerprint}\n`, "utf8")
}

export async function readInstalledSystemSkillsFingerprint(): Promise<string | undefined> {
  const markerPath = path.join(managedSystemRoot(), SYSTEM_SKILLS_FINGERPRINT_FILE)
  const value = await readSystemSkillsFingerprint(markerPath)
  if (!value) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
