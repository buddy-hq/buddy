#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import {
  isReleaseSmokeTargetName,
  RELEASE_SMOKE_TARGETS,
  releaseTargetEnvironment,
} from "./release-smoke-target"
import { readDesktopPackageVersion, updateDesktopPackageVersion } from "./utils"

const TARGET_FLAG = "--target"
const PRODUCTION_CHANNEL = "prod"
const packageDirectory = path.resolve(import.meta.dir, "..")
const repositoryRoot = path.resolve(packageDirectory, "../..")

function readTargetName(): string {
  const targetIndex = Bun.argv.indexOf(TARGET_FLAG)
  const targetName = targetIndex < 0 ? undefined : Bun.argv[targetIndex + 1]
  if (!targetName) {
    throw new Error(`Usage: bun ./scripts/build-release-target.ts ${TARGET_FLAG} <target>`)
  }
  return targetName
}

const rawTargetName = readTargetName()
if (!isReleaseSmokeTargetName(rawTargetName)) {
  throw new Error(`Unsupported release target: ${rawTargetName}`)
}

const target = RELEASE_SMOKE_TARGETS[rawTargetName]
if (process.platform !== target.platform || process.arch !== target.architecture) {
  throw new Error(
    `Release target ${rawTargetName} requires ${target.platform}-${target.architecture}, received ${process.platform}-${process.arch}`,
  )
}

const version = process.env.BUDDY_VERSION?.trim()
if (!version) {
  throw new Error("BUDDY_VERSION is required")
}

if (process.env.BUDDY_CHANNEL?.trim() !== PRODUCTION_CHANNEL) {
  throw new Error(`Release target builds require BUDDY_CHANNEL=${PRODUCTION_CHANNEL}`)
}

const originalVersion = readDesktopPackageVersion()
const environment = {
  ...process.env,
  ...releaseTargetEnvironment(rawTargetName),
  BUDDY_CHANNEL: PRODUCTION_CHANNEL,
  BUDDY_VERSION: version,
}

try {
  await $`bun run sdk:generate`.cwd(repositoryRoot).env(environment)
  await $`bun run prepare:release`.cwd(packageDirectory).env(environment)
  await $`bun run build`.cwd(packageDirectory).env(environment)
  await $`bun run smoke:backend-utility`.cwd(packageDirectory).env(environment)
  await $`bunx --bun electron-builder ${target.electronBuilderArguments} --publish never --config electron-builder.config.ts`
    .cwd(packageDirectory)
    .env(environment)
} finally {
  if (readDesktopPackageVersion() !== originalVersion) {
    updateDesktopPackageVersion(originalVersion)
  }
}

console.log(`Built and smoke-tested production Electron target ${rawTargetName}`)
