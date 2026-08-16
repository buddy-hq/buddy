import { createHash } from "node:crypto"
import { constants, cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const APP_BUNDLE_NAME = "Electron.app"
const APP_CONTENTS_DIRECTORY_NAME = "Contents"
const APP_EXECUTABLE_DIRECTORY_NAME = "MacOS"
const APP_EXECUTABLE_NAME = "Electron"
const APP_INFO_PLIST_NAME = "Info.plist"
const CACHE_DIRECTORY_NAME = "buddy-electron-dev"
const CACHE_KEY_LENGTH = 16
const CACHE_FORMAT_VERSION = "2"
const CODESIGN_PATH = "/usr/bin/codesign"
const PLUTIL_PATH = "/usr/bin/plutil"

export function prepareMacDevElectronExecutable(input: {
  appName: string
  electronExecutablePath: string
  repositoryRoot: string
}): string | undefined {
  if (process.platform !== "darwin") return undefined

  const sourceAppPath = path.resolve(path.dirname(input.electronExecutablePath), "..", "..")
  const cacheKey = createHash("sha256")
    .update(CACHE_FORMAT_VERSION)
    .update("\0")
    .update(input.repositoryRoot)
    .update("\0")
    .update(sourceAppPath)
    .update("\0")
    .update(input.appName)
    .digest("hex")
    .slice(0, CACHE_KEY_LENGTH)
  const cacheRoot = path.join(tmpdir(), CACHE_DIRECTORY_NAME, cacheKey)
  const distPath = path.join(cacheRoot, "dist")
  const destinationAppPath = path.join(distPath, APP_BUNDLE_NAME)
  const executablePath = path.join(
    destinationAppPath,
    APP_CONTENTS_DIRECTORY_NAME,
    APP_EXECUTABLE_DIRECTORY_NAME,
    APP_EXECUTABLE_NAME,
  )

  if (!existsSync(executablePath)) {
    prepareAppBundle({
      appName: input.appName,
      cacheKey,
      cacheRoot,
      destinationAppPath,
      sourceAppPath,
    })
  }

  return executablePath
}

function prepareAppBundle(input: {
  appName: string
  cacheKey: string
  cacheRoot: string
  destinationAppPath: string
  sourceAppPath: string
}): void {
  const stagingRoot = `${input.cacheRoot}-${String(process.pid)}`
  const stagingAppPath = path.join(stagingRoot, "dist", APP_BUNDLE_NAME)

  rmSync(stagingRoot, { force: true, recursive: true })
  mkdirSync(path.dirname(stagingAppPath), { recursive: true })

  try {
    cpSync(input.sourceAppPath, stagingAppPath, {
      mode: constants.COPYFILE_FICLONE,
      recursive: true,
    })
    const infoPlistPath = path.join(
      stagingAppPath,
      APP_CONTENTS_DIRECTORY_NAME,
      APP_INFO_PLIST_NAME,
    )
    replacePlistString(infoPlistPath, "CFBundleDisplayName", input.appName)
    replacePlistString(infoPlistPath, "CFBundleName", input.appName)
    replacePlistString(
      infoPlistPath,
      "CFBundleIdentifier",
      `ai.buddy.desktop.dev.${input.cacheKey}`,
    )
    execFileSync(CODESIGN_PATH, ["--force", "--deep", "--sign", "-", stagingAppPath], {
      stdio: "ignore",
    })

    rmSync(input.cacheRoot, { force: true, recursive: true })
    renameSync(stagingRoot, input.cacheRoot)
  } catch (error) {
    rmSync(stagingRoot, { force: true, recursive: true })
    throw error
  }
}

function replacePlistString(plistPath: string, key: string, value: string): void {
  execFileSync(PLUTIL_PATH, ["-replace", key, "-string", value, plistPath], {
    stdio: "ignore",
  })
}
