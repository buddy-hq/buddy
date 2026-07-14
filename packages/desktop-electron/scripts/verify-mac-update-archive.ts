#!/usr/bin/env bun

import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const APP_BUNDLE_SUFFIX = ".app"
const CODESIGN_COMMAND = "/usr/bin/codesign"
const DITTO_COMMAND = "/usr/bin/ditto"
const EXTRACTION_DIRECTORY_PREFIX = "buddy-mac-update-verification-"
const MACOS_PLATFORM = "darwin"

function runRequiredCommand(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, { encoding: "utf8" })
  if (result.error) throw result.error
  if (result.status === 0) return

  const detail = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n")
  throw new Error(
    `${command} failed with exit code ${result.status ?? "unknown"}${detail ? `\n${detail}` : ""}`,
  )
}

export function resolveExtractedMacAppPath(extractionDirectory: string): string {
  const appBundles = readdirSync(extractionDirectory, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name.endsWith(APP_BUNDLE_SUFFIX),
  )
  if (appBundles.length !== 1) {
    throw new Error(
      `Expected exactly one macOS app bundle in ${extractionDirectory}, found ${appBundles.length}`,
    )
  }
  return path.join(extractionDirectory, appBundles[0].name)
}

export function verifyMacUpdateArchive(archivePath: string): void {
  if (process.platform !== MACOS_PLATFORM) {
    throw new Error(`macOS update archive verification requires ${MACOS_PLATFORM}`)
  }
  if (!existsSync(archivePath)) {
    throw new Error(`macOS update archive missing at ${archivePath}`)
  }

  const extractionDirectory = mkdtempSync(path.join(os.tmpdir(), EXTRACTION_DIRECTORY_PREFIX))
  try {
    runRequiredCommand(DITTO_COMMAND, ["-x", "-k", archivePath, extractionDirectory])
    const appPath = resolveExtractedMacAppPath(extractionDirectory)
    runRequiredCommand(CODESIGN_COMMAND, ["--verify", "--deep", "--strict", appPath])
    console.log(`Verified macOS updater app signature in ${path.basename(archivePath)}`)
  } finally {
    rmSync(extractionDirectory, { force: true, recursive: true })
  }
}
