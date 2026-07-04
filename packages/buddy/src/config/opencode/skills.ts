import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Config } from "../config.js"
import {
  managedSkillsRoot,
  managedSystemRoot,
} from "../../learning/skill-management/service/paths.js"
import { ensureBundledSystemSkillsInstalled } from "../../learning/skill-management/service/system-installer.js"
import { BUDDY_ENV, Global } from "../../storage"

const BUNDLED_FEATURE_RELATIVE_PATHS = [
  // Bundled desktop runtime layout: resources/backend/learning/...
  "learning/features",
  // Bundled chunks/runtime variants.
  "../learning/features",
  // Source layout from src/config/opencode/skills.ts.
  "../../learning/features",
  "../../../learning/features",
  "../../../src/learning/features",
]

const EXTERNAL_VENDOR_SKILL_DIRS = [".claude", ".agents"] as const
const WORKSPACE_BUNDLED_FEATURE_RELATIVE_PATHS = [
  "packages/buddy/src/learning/features",
  "src/learning/features",
] as const

function uniqueResolvedPaths(entries: string[]) {
  return Array.from(new Set(entries.map((entry) => path.resolve(entry))))
}

async function directoryExists(candidate: string) {
  const stats = await fs.stat(candidate).catch(() => undefined)
  return !!stats?.isDirectory()
}

async function readDirectoryEntries(directory: string) {
  return fs
    .readdir(directory, {
      withFileTypes: true,
    })
    .catch(() => [])
}

async function collectFeatureSkillRoots(featuresRoot: string) {
  const entries = await readDirectoryEntries(featuresRoot)
  const roots: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const skillsDirectory = path.join(featuresRoot, entry.name, "skills")
    if (await directoryExists(skillsDirectory)) {
      roots.push(skillsDirectory)
    }
  }

  return roots
}

function resolveBundledFeatureRootCandidates() {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
  const resourcesRoot = process.env[BUDDY_ENV.BACKEND_RESOURCES_DIR]?.trim()
  return uniqueResolvedPaths([
    ...(resourcesRoot ? [path.join(resourcesRoot, "learning/features")] : []),
    ...resolveWorkspaceBundledFeatureRootCandidates(moduleDirectory),
    ...BUNDLED_FEATURE_RELATIVE_PATHS.map((relativePath) =>
      path.resolve(moduleDirectory, relativePath),
    ),
  ])
}

function walkUpToFilesystemRoot(start: string) {
  const directories: string[] = []
  let current = path.resolve(start)

  while (true) {
    directories.push(current)
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  return directories
}

function resolveWorkspaceBundledFeatureRootCandidates(moduleDirectory: string) {
  const candidates: string[] = []
  const starts = uniqueResolvedPaths([moduleDirectory, process.cwd()])

  for (const start of starts) {
    for (const directory of walkUpToFilesystemRoot(start)) {
      for (const relativePath of WORKSPACE_BUNDLED_FEATURE_RELATIVE_PATHS) {
        candidates.push(path.join(directory, relativePath))
      }
    }
  }

  return candidates
}

async function resolveBuddyBundledSkillRoots(): Promise<string[]> {
  const roots: string[] = []
  for (const candidate of resolveBundledFeatureRootCandidates()) {
    if (!(await directoryExists(candidate))) continue
    roots.push(...(await collectFeatureSkillRoots(candidate)))
  }
  return uniqueResolvedPaths(roots)
}

async function resolveBuddySourceBundledSkillRoots(): Promise<string[]> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
  const roots: string[] = []

  for (const candidate of resolveWorkspaceBundledFeatureRootCandidates(moduleDirectory)) {
    if (!(await directoryExists(candidate))) continue
    roots.push(...(await collectFeatureSkillRoots(candidate)))
  }

  return uniqueResolvedPaths(roots)
}

function walkUpDirectories(start: string, stop: string) {
  const directories: string[] = []
  let current = path.resolve(start)
  const boundary = path.resolve(stop)

  while (true) {
    directories.push(current)
    if (current === boundary) {
      break
    }

    const parent = path.dirname(current)
    if (parent === current) {
      break
    }

    current = parent
  }

  return directories
}

function resolveConfiguredSkillPaths(config: Config.Info, directory: string): string[] {
  if (!Array.isArray(config.skills?.paths)) {
    return []
  }

  return config.skills.paths
    .filter((entry: unknown): entry is string => typeof entry === "string")
    .map((entry: string) => entry.trim())
    .filter((entry: string) => entry.length > 0)
    .map((entry: string) => {
      const expanded = entry.startsWith("~/") ? path.join(Global.Path.home, entry.slice(2)) : entry
      return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(directory, expanded)
    })
}

function isPathInVendorSkillRoot(candidate: string) {
  const segments = path.resolve(candidate).split(path.sep)
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index]
    const next = segments[index + 1]
    if ((current === ".claude" || current === ".agents") && next === "skills") {
      return true
    }
  }

  return false
}

function filterConfiguredSkillPaths(configuredPaths: string[], includeVendorRoots: boolean) {
  if (includeVendorRoots) {
    return configuredPaths
  }

  return configuredPaths.filter((entry) => !isPathInVendorSkillRoot(entry))
}

async function resolveGitBoundary(directory: string) {
  let current = path.resolve(directory)

  while (true) {
    const gitMarker = path.join(current, ".git")
    const markerStats = await fs.stat(gitMarker).catch(() => undefined)
    if (markerStats) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return path.resolve(directory)
    }

    current = parent
  }
}

async function resolveVendorSkillRoots(directory: string): Promise<string[]> {
  const candidates: string[] = []
  const boundary = await resolveGitBoundary(directory)

  for (const externalDir of EXTERNAL_VENDOR_SKILL_DIRS) {
    candidates.push(path.join(Global.Path.home, externalDir, "skills"))
  }

  for (const current of walkUpDirectories(directory, boundary)) {
    for (const externalDir of EXTERNAL_VENDOR_SKILL_DIRS) {
      candidates.push(path.join(current, externalDir, "skills"))
    }
  }

  return uniqueResolvedPaths(candidates)
}

async function appendIfDirectory(paths: string[], candidate: string) {
  const normalized = path.resolve(candidate)
  if (!(await directoryExists(normalized))) return
  if (paths.includes(normalized)) {
    return
  }
  paths.push(normalized)
}

async function resolveOpenCodeSkillPaths(
  config: Config.Info,
  directory: string,
): Promise<string[] | undefined> {
  const normalizedDirectory = path.resolve(directory)
  const configuredPaths = resolveConfiguredSkillPaths(config, normalizedDirectory)
  const paths = filterConfiguredSkillPaths(
    configuredPaths,
    config.skills_external_vendor_roots_enabled === true,
  )

  const bundledRoots = await resolveBuddyBundledSkillRoots()
  const sourceBundledRoots = await resolveBuddySourceBundledSkillRoots()
  const { allBuddySkills } = await import("../../learning/runtime/feature-registry.js")
  await ensureBundledSystemSkillsInstalled(bundledRoots, allBuddySkills())
  for (const managedPath of [managedSkillsRoot(), managedSystemRoot()]) {
    await appendIfDirectory(paths, managedPath)
  }
  for (const sourceBundledRoot of sourceBundledRoots) {
    await appendIfDirectory(paths, sourceBundledRoot)
  }

  if (config.skills_external_vendor_roots_enabled) {
    const vendorRoots = await resolveVendorSkillRoots(normalizedDirectory)
    for (const vendorRoot of vendorRoots) {
      await appendIfDirectory(paths, vendorRoot)
    }
  }

  return paths.length > 0 ? uniqueResolvedPaths(paths) : undefined
}

export {
  resolveBuddyBundledSkillRoots,
  resolveBuddySourceBundledSkillRoots,
  resolveOpenCodeSkillPaths,
}
