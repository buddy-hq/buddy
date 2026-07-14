import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

export const PACKAGED_RESOURCES_DIRECTORY_ENV = "BUDDY_PACKAGED_RESOURCES_DIR" as const
export const ELECTRON_ASAR_FILENAME = "app.asar" as const

const PACKAGED_RESOURCES_SCAN_MAX_DEPTH = 4

type PackagedResourcesFingerprint = {
  ctimeMs: number
  mtimeMs: number
  size: number
}

export type PackagedResourcesSnapshot = ReadonlyMap<string, PackagedResourcesFingerprint>

function collectPackagedResourcesDirectories(directory: string, depth = 0): string[] {
  if (!existsSync(directory) || depth > PACKAGED_RESOURCES_SCAN_MAX_DEPTH) return []
  const resourcesDirectories: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const entryPath = path.join(directory, entry.name)
    if (
      entry.name.toLowerCase() === "resources" &&
      existsSync(path.join(entryPath, ELECTRON_ASAR_FILENAME))
    ) {
      resourcesDirectories.push(entryPath)
      continue
    }
    resourcesDirectories.push(...collectPackagedResourcesDirectories(entryPath, depth + 1))
  }
  return resourcesDirectories
}

export function capturePackagedResourcesSnapshot(distDirectory: string): PackagedResourcesSnapshot {
  return new Map(
    collectPackagedResourcesDirectories(distDirectory).map((resourcesDirectory) => {
      const stats = statSync(path.join(resourcesDirectory, ELECTRON_ASAR_FILENAME))
      return [
        resourcesDirectory,
        {
          ctimeMs: stats.ctimeMs,
          mtimeMs: stats.mtimeMs,
          size: stats.size,
        },
      ]
    }),
  )
}

function fingerprintsMatch(
  left: PackagedResourcesFingerprint,
  right: PackagedResourcesFingerprint,
): boolean {
  return (
    left.ctimeMs === right.ctimeMs && left.mtimeMs === right.mtimeMs && left.size === right.size
  )
}

export function resolveChangedPackagedResourcesDirectory(input: {
  before: PackagedResourcesSnapshot
  after: PackagedResourcesSnapshot
}): string {
  const changedDirectories = [...input.after].flatMap(([directory, fingerprint]) => {
    const previous = input.before.get(directory)
    return !previous || !fingerprintsMatch(previous, fingerprint) ? [directory] : []
  })
  const changedDirectory = changedDirectories[0]
  if (changedDirectories.length === 1 && changedDirectory) return changedDirectory
  throw new Error(
    changedDirectories.length === 0
      ? "Electron packaging did not create or update a packaged resources directory."
      : `Electron packaging updated multiple resources directories: ${changedDirectories.join(", ")}`,
  )
}

export function resolvePackagedResourcesDirectory(input: {
  distDirectory: string
  explicitDirectory?: string
}): string {
  const explicitDirectory = input.explicitDirectory?.trim()
  if (explicitDirectory) {
    if (!path.isAbsolute(explicitDirectory)) {
      throw new Error(`${PACKAGED_RESOURCES_DIRECTORY_ENV} must be an absolute path`)
    }
    if (!existsSync(path.join(explicitDirectory, ELECTRON_ASAR_FILENAME))) {
      throw new Error(`${explicitDirectory} does not contain ${ELECTRON_ASAR_FILENAME}`)
    }
    return explicitDirectory
  }

  const candidates = [...capturePackagedResourcesSnapshot(input.distDirectory).keys()]
  const candidate = candidates[0]
  if (candidates.length === 1 && candidate) return candidate
  throw new Error(
    candidates.length === 0
      ? "No packaged Electron resources directory was found. Build the package before --packaged."
      : `Multiple packaged Electron resources directories were found. Set ${PACKAGED_RESOURCES_DIRECTORY_ENV} explicitly.`,
  )
}
