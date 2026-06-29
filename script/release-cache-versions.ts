#!/usr/bin/env bun

const LOCKFILE_PATH = "bun.lock"
const ELECTRON_PACKAGE_NAME = "electron"
const ELECTRON_BUILDER_PACKAGE_NAME = "electron-builder"

type CacheVersions = {
  electron: string
  electronBuilder: string
}

const lockfile = await Bun.file(LOCKFILE_PATH).text()
const versions: CacheVersions = {
  electron: resolveLockedPackageVersion(lockfile, ELECTRON_PACKAGE_NAME),
  electronBuilder: resolveLockedPackageVersion(lockfile, ELECTRON_BUILDER_PACKAGE_NAME),
}

const output = [
  `electron=${versions.electron}`,
  `electron_builder=${versions.electronBuilder}`,
].join("\n")

if (process.env.GITHUB_OUTPUT) {
  await Bun.write(process.env.GITHUB_OUTPUT, `${output}\n`)
} else {
  console.log(output)
}

function resolveLockedPackageVersion(lockfileContent: string, packageName: string): string {
  const escapedPackageName = escapeRegularExpression(packageName)
  const match = lockfileContent.match(
    new RegExp(`"${escapedPackageName}": \\["${escapedPackageName}@([^"]+)"`),
  )
  const version = match?.[1]
  if (!version) {
    throw new Error(`Could not resolve locked ${packageName} version from ${LOCKFILE_PATH}`)
  }

  return version
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}
