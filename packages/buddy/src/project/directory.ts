import os from "node:os"
import fs from "node:fs"
import path from "node:path"
import {
  BUDDY_ENV,
  resolveBuddyHomeDirectory,
  resolveConfiguredPath,
  resolveDefaultBuddyGlobalConfigDir,
} from "../storage"
import { BUDDY_HOME_DEFAULT_PATH_SEGMENTS } from "./notebook-constants"
import { monorepoPackageJsonDeclaresWorkspaces, parseMonorepoPackageJson } from "./parse-values"

const BUDDY_BOOTSTRAP_DIRECTORY_PATH_SEGMENTS = ["bootstrap", "http-proxy"] as const

function resolveDefaultNotebookHomeDirectory() {
  return path.join(resolveBuddyHomeDirectory(), ...BUDDY_HOME_DEFAULT_PATH_SEGMENTS)
}

function resolveBuddyGlobalConfigDirectory() {
  return (
    resolveConfiguredPath(process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR]) ??
    resolveDefaultBuddyGlobalConfigDir()
  )
}

function findMonorepoRoot(start: string) {
  let current = path.resolve(start)
  while (true) {
    const packageJSON = path.join(current, "package.json")
    if (fs.existsSync(packageJSON)) {
      try {
        const parsed = parseMonorepoPackageJson(JSON.parse(fs.readFileSync(packageJSON, "utf8")))
        if (parsed !== undefined && monorepoPackageJsonDeclaresWorkspaces(parsed)) {
          return current
        }
      } catch {
        // Ignore invalid package.json and continue traversing up.
      }
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}

function defaultAllowedRoots() {
  const cwd = process.cwd()
  const monorepoRoot = findMonorepoRoot(cwd)
  return [
    cwd,
    monorepoRoot,
    monorepoRoot ? path.resolve(monorepoRoot, "..") : undefined,
    resolveDefaultNotebookHomeDirectory(),
    "/tmp",
    os.tmpdir(),
  ].filter((value): value is string => Boolean(value))
}

function decodeDirectory(raw: string) {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function directoryBase() {
  const configured = process.env[BUDDY_ENV.DIRECTORY_BASE]?.trim()
  if (configured) {
    return path.resolve(decodeDirectory(configured))
  }
  return process.cwd()
}

function resolveDirectoryPath(raw: string) {
  const decoded = decodeDirectory(raw).trim()
  if (!decoded) {
    return directoryBase()
  }
  if (path.isAbsolute(decoded)) {
    return decoded
  }
  return path.resolve(directoryBase(), decoded)
}

function canonicalizeDirectory(directory: string) {
  let current = directory
  const suffix: string[] = []

  while (true) {
    if (fs.existsSync(current)) {
      try {
        const resolved = fs.realpathSync.native(current)
        if (suffix.length === 0) {
          return resolved
        }
        return path.join(resolved, ...suffix.toReversed())
      } catch {
        return directory
      }
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return directory
    }

    suffix.push(path.basename(current))
    current = parent
  }
}

function isInsideRoot(directory: string, root: string) {
  const relative = path.relative(root, directory)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

export function isInsideDirectoryRoot(directory: string, root: string) {
  return isInsideRoot(directory, root)
}

export function resolveDirectory(raw: string) {
  return canonicalizeDirectory(resolveDirectoryPath(raw))
}

export function ensureGlobalBootstrapWorkspaceDirectory() {
  const directory = path.join(
    resolveBuddyGlobalConfigDirectory(),
    ...BUDDY_BOOTSTRAP_DIRECTORY_PATH_SEGMENTS,
  )
  fs.mkdirSync(directory, { recursive: true })
  return canonicalizeDirectory(directory)
}

export function allowedDirectoryRoots() {
  const configured = (process.env[BUDDY_ENV.ALLOWED_DIRECTORY_ROOTS] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (configured.includes("*")) {
    return ["*"]
  }

  const roots = configured.length > 0 ? configured : defaultAllowedRoots()
  return Array.from(new Set(roots.map((entry) => resolveDirectory(entry))))
}

export function isAllowedDirectory(directory: string, roots: string[] = allowedDirectoryRoots()) {
  if (roots.includes("*")) {
    return true
  }
  return roots.some((root) => isInsideRoot(directory, root))
}
