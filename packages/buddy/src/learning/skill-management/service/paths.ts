import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { xdgCache } from "xdg-basedir"
import { BUDDY_HOME_DIRECTORY_NAME, Global } from "../../../storage"
import type { ManagedSkillSource, SkillScope } from "./contracts"

export const OPENCODE_SKILL_CACHE_ROOT = path.join(
  xdgCache ?? path.join(os.homedir(), ".cache"),
  "opencode",
  "skills",
)

export function buddyHomeRoot() {
  return path.join(Global.Path.home, BUDDY_HOME_DIRECTORY_NAME)
}

export function managedSkillsRoot() {
  return path.join(buddyHomeRoot(), "skills")
}

export function managedSystemRoot() {
  return path.join(managedSkillsRoot(), ".system")
}

export function managedLibraryRoot() {
  return path.join(managedSkillsRoot(), "library")
}

export function managedCustomRoot() {
  return path.join(managedSkillsRoot(), "custom")
}

export function managedWithdrawnLibraryRoot() {
  return path.join(buddyHomeRoot(), "withdrawn-skills", "library")
}

export function installedSkillLockPath() {
  return path.join(buddyHomeRoot(), "skills.lock.json")
}

export function curatedSkillsCacheRoot() {
  return path.join(buddyHomeRoot(), "cache")
}

export function skillArtifactCacheRoot() {
  return path.join(curatedSkillsCacheRoot(), "skill-artifacts")
}

export function libraryCatalogCacheRoot() {
  return path.join(skillArtifactCacheRoot(), "library-catalog")
}

export function systemSkillPackCacheRoot() {
  return path.join(skillArtifactCacheRoot(), "system-skill-pack")
}

export async function ensureManagedSkillPathReady() {
  await fsp.mkdir(managedSkillsRoot(), { recursive: true })
  await fsp.mkdir(managedSystemRoot(), { recursive: true })
  await fsp.mkdir(managedLibraryRoot(), { recursive: true })
  await fsp.mkdir(managedCustomRoot(), { recursive: true })
  await fsp.mkdir(managedWithdrawnLibraryRoot(), { recursive: true })
}

export function isWithinPath(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

export function resolveSkillScope(location: string): SkillScope {
  const normalizedLocation = path.resolve(location)
  const globalRoots = [
    managedSkillsRoot(),
    path.join(Global.Path.home, ".agents", "skills"),
    path.join(Global.Path.home, ".claude", "skills"),
  ]

  if (globalRoots.some((root) => isWithinPath(root, normalizedLocation))) {
    return "global"
  }

  return "workspace"
}

function managedRelativeSegments(location: string) {
  const root = managedSkillsRoot()
  const relative = path.relative(root, location)
  const insideManagedRoot =
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)

  return {
    insideManagedRoot,
    segments: relative.split(path.sep),
  }
}

export function managedSource(location: string): ManagedSkillSource {
  const { insideManagedRoot, segments } = managedRelativeSegments(location)
  if (!insideManagedRoot) {
    return {
      source: "external",
      managed: false,
      removable: false,
    }
  }

  if (segments[0] === "library" && segments[1]) {
    return {
      source: "library",
      managed: true,
      removable: true,
      libraryID: segments[1],
    }
  }

  if (segments[0] === "custom") {
    return {
      source: "custom",
      managed: true,
      removable: true,
    }
  }

  if (segments[0] === ".system") {
    return {
      source: "system",
      managed: true,
      removable: false,
    }
  }

  return {
    source: "external",
    managed: true,
    removable: false,
  }
}
