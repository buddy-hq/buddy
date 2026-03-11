import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Config } from "../config.js"
import {
  managedSkillsRoot,
  managedSystemRoot,
} from "../../learning/skills/service/paths.js"
import { ensureBundledSystemSkillsInstalled } from "../../learning/skills/service/system-installer.js"
import { Global } from "../../storage"

const BUNDLED_SKILL_RELATIVE_PATHS = [
  // Bundled desktop runtime layout: resources/backend/learning/...
  "learning/capabilities/pedagogy/skills",
  // Bundled chunks/runtime variants.
  "../learning/capabilities/pedagogy/skills",
  // Source layout from src/config/opencode/skills.ts.
  "../../learning/capabilities/pedagogy/skills",
  "../../../learning/capabilities/pedagogy/skills",
  "../../../src/learning/capabilities/pedagogy/skills",
  // Alternate bundled layout used by some build artifacts.
  "skills/system",
  "../skills/system",
]

const EXTERNAL_VENDOR_SKILL_DIRS = [".claude", ".agents"] as const

function uniqueResolvedPaths(entries: string[]) {
  return Array.from(new Set(entries.map((entry) => path.resolve(entry))))
}

async function directoryExists(candidate: string) {
  const stats = await fs.stat(candidate).catch(() => undefined)
  return !!stats?.isDirectory()
}

function resolveBundledSkillRootCandidates() {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
  return BUNDLED_SKILL_RELATIVE_PATHS.map((relativePath) => path.resolve(moduleDirectory, relativePath))
}

async function resolveBuddyBundledSkillRoots(): Promise<string[]> {
  const roots: string[] = []
  for (const candidate of resolveBundledSkillRootCandidates()) {
    if (!(await directoryExists(candidate))) continue
    roots.push(candidate)
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
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
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

async function resolveOpenCodeSkillPaths(config: Config.Info, directory: string): Promise<string[] | undefined> {
  const normalizedDirectory = path.resolve(directory)
  const configuredPaths = resolveConfiguredSkillPaths(config, normalizedDirectory)
  const paths = filterConfiguredSkillPaths(configuredPaths, config.skills_external_vendor_roots_enabled === true)

  const bundledRoots = await resolveBuddyBundledSkillRoots()
  await ensureBundledSystemSkillsInstalled(bundledRoots)
  for (const managedPath of [managedSkillsRoot(), managedSystemRoot()]) {
    await appendIfDirectory(paths, managedPath)
  }

  if (config.skills_external_vendor_roots_enabled) {
    const vendorRoots = await resolveVendorSkillRoots(normalizedDirectory)
    for (const vendorRoot of vendorRoots) {
      await appendIfDirectory(paths, vendorRoot)
    }
  }

  return paths.length > 0 ? uniqueResolvedPaths(paths) : undefined
}

export { resolveBuddyBundledSkillRoots, resolveOpenCodeSkillPaths }
