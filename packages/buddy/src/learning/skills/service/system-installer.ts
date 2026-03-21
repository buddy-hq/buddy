import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { ensureManagedSkillPathReady, managedSystemRoot } from './paths'

type BundledSkillSource = {
  name: string
  directory: string
}

const SYSTEM_SKILLS_FINGERPRINT_FILE = '.buddy-system-skills.fingerprint'

async function readDirectoryEntries(directory: string) {
  return fsp
    .readdir(directory, {
      withFileTypes: true,
    })
    .catch(() => [])
}

function sortByName<T extends { name: string }>(entries: T[]) {
  return entries.sort((left, right) => left.name.localeCompare(right.name))
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
): Promise<BundledSkillSource[]> {
  const sources = new Map<string, BundledSkillSource>()

  for (const root of roots) {
    const entries = sortByName(await readDirectoryEntries(root))
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (sources.has(entry.name)) continue

      const directory = path.join(root, entry.name)
      const skillDocument = path.join(directory, 'SKILL.md')
      const stats = await fsp.stat(skillDocument).catch(() => undefined)
      if (!stats?.isFile()) continue

      sources.set(entry.name, {
        name: entry.name,
        directory,
      })
    }
  }

  return Array.from(sources.values()).sort((left, right) => left.name.localeCompare(right.name))
}

async function fingerprintBundledSources(sources: BundledSkillSource[]) {
  const hash = createHash('sha256')

  for (const source of sources) {
    hash.update(`${source.name}\n`)
    const files = await listFilesRecursively(source.directory)
    for (const file of files) {
      const relative = path.relative(source.directory, file)
      const content = await fsp.readFile(file)
      hash.update(relative)
      hash.update('\n')
      hash.update(content)
      hash.update('\n')
    }
  }

  return hash.digest('hex')
}

async function destinationMatchesSources(destinationRoot: string, sources: BundledSkillSource[]) {
  for (const source of sources) {
    const destinationSkillFile = path.join(destinationRoot, source.name, 'SKILL.md')
    const stats = await fsp.stat(destinationSkillFile).catch(() => undefined)
    if (!stats?.isFile()) {
      return false
    }
  }

  return true
}

async function readSystemSkillsFingerprint(markerPath: string) {
  return fsp.readFile(markerPath, 'utf8').catch(() => undefined)
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
    await fsp.cp(source.directory, path.join(systemRoot, source.name), {
      recursive: true,
      force: true,
    })
  }
}

export async function ensureBundledSystemSkillsInstalled(sourceRoots: string[]): Promise<void> {
  const sources = await collectBundledSystemSkillDirectories(sourceRoots)
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

  await fsp.writeFile(markerPath, `${nextFingerprint}\n`, 'utf8')
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
