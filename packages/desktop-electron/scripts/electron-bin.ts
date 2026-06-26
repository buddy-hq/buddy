import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const ELECTRON_OVERRIDE_DIST_PATH_ENV = "ELECTRON_OVERRIDE_DIST_PATH" as const
const ELECTRON_PACKAGE_NAME = "electron" as const
const ELECTRON_PATH_FILE = "path.txt" as const
const ELECTRON_DIST_DIR = "dist" as const

export function resolveElectronBin(packageDir: string): string {
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve(`${ELECTRON_PACKAGE_NAME}/package.json`, {
    paths: [packageDir],
  })
  const electronDir = path.dirname(manifestPath)
  const overrideDistPath = process.env[ELECTRON_OVERRIDE_DIST_PATH_ENV]?.trim()

  if (overrideDistPath) {
    const candidate = path.join(overrideDistPath, electronExecutablePathWithinDist())
    if (existsSync(candidate)) return candidate
  }

  const directCandidate = path.join(
    electronDir,
    ELECTRON_DIST_DIR,
    electronExecutablePathWithinDist(),
  )
  if (existsSync(directCandidate)) return directCandidate

  const pathFileCandidate = readElectronPathFileCandidate(electronDir)
  if (pathFileCandidate && existsSync(pathFileCandidate)) return pathFileCandidate

  throw new Error(
    `Electron binary missing under ${electronDir}. Run bun install with trusted electron dependencies enabled.`,
  )
}

function readElectronPathFileCandidate(electronDir: string): string | undefined {
  const pathFile = path.join(electronDir, ELECTRON_PATH_FILE)
  if (!existsSync(pathFile)) return undefined

  const executablePath = readFileSync(pathFile, "utf8").trim()
  if (!executablePath) return undefined
  return path.join(electronDir, ELECTRON_DIST_DIR, executablePath)
}

function electronExecutablePathWithinDist(): string {
  switch (process.platform) {
    case "darwin":
      return path.join("Electron.app", "Contents", "MacOS", "Electron")
    case "win32":
      return "electron.exe"
    case "linux":
      return "electron"
    default:
      throw new Error(`Unsupported Electron smoke platform: ${process.platform}`)
  }
}
