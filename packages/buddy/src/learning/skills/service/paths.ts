import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { xdgCache } from "xdg-basedir"
import { Global } from "../../../storage"
import type { ManagedSkillSource, SkillScope } from "./contracts"

export const OPENCODE_SKILL_CACHE_ROOT = path.join(
  xdgCache ?? path.join(os.homedir(), ".cache"),
  "opencode",
  "skills",
)

export function agentSkillsRoot() {
  return path.join(Global.Path.home, ".agents", "skills")
}

export function managedSkillsRoot() {
  return path.join(agentSkillsRoot(), "buddy-managed")
}

export function managedLibraryRoot() {
  return path.join(managedSkillsRoot(), "library")
}

export function managedCustomRoot() {
  return path.join(managedSkillsRoot(), "custom")
}

export async function ensureManagedSkillPathReady() {
  await fsp.mkdir(agentSkillsRoot(), { recursive: true })
  await fsp.mkdir(managedSkillsRoot(), { recursive: true })
}

export function isWithinPath(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

export function resolveSkillScope(location: string): SkillScope {
  const normalizedLocation = path.resolve(location)
  const globalRoots = [
    path.join(Global.Path.home, ".agents", "skills"),
    path.join(Global.Path.home, ".claude", "skills"),
  ]

  if (globalRoots.some((root) => isWithinPath(root, normalizedLocation))) {
    return "global"
  }

  return "workspace"
}

export function managedSource(location: string): ManagedSkillSource {
  const root = managedSkillsRoot()
  const relative = path.relative(root, location)
  const insideManagedRoot = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  if (!insideManagedRoot) {
    return {
      source: "external",
      managed: false,
      removable: false,
    }
  }

  const segments = relative.split(path.sep)
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

  return {
    source: "external",
    managed: true,
    removable: true,
  }
}
