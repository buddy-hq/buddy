import os from "node:os"
import fs from "node:fs"
import path from "node:path"

function findMonorepoRoot(start: string) {
  let current = path.resolve(start)
  while (true) {
    const packageJSON = path.join(current, "package.json")
    if (fs.existsSync(packageJSON)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(packageJSON, "utf8")) as {
          workspaces?: unknown
        }
        if (Array.isArray(parsed.workspaces)) {
          return current
        }
        if (
          typeof parsed.workspaces === "object" &&
          parsed.workspaces !== null &&
          "packages" in parsed.workspaces &&
          Array.isArray((parsed.workspaces as { packages?: unknown }).packages)
        ) {
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
  return [cwd, monorepoRoot, monorepoRoot ? path.resolve(monorepoRoot, "..") : undefined, "/tmp", os.tmpdir()].filter(
    (value): value is string => Boolean(value),
  )
}

function decodeDirectory(raw: string) {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function isInsideRoot(directory: string, root: string) {
  const relative = path.relative(root, directory)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

export function resolveDirectory(raw: string) {
  return path.resolve(decodeDirectory(raw))
}

export function allowedDirectoryRoots() {
  const configured = (process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

  const roots = configured.length > 0 ? configured : defaultAllowedRoots()
  return Array.from(new Set(roots.map((entry) => resolveDirectory(entry))))
}

export function isAllowedDirectory(directory: string, roots: string[] = allowedDirectoryRoots()) {
  return roots.some((root) => isInsideRoot(directory, root))
}
