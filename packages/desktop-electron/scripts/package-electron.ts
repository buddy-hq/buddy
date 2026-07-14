#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import {
  PACKAGE_TARGET_FLAG,
  PACKAGE_TARGETS,
  assertPackageTarget,
  type PackageTarget,
} from "./assert-package-target"
import {
  PACKAGED_RESOURCES_DIRECTORY_ENV,
  capturePackagedResourcesSnapshot,
  resolveChangedPackagedResourcesDirectory,
} from "./packaged-resources"

const packageDirectory = path.resolve(import.meta.dir, "..")
const distDirectory = path.join(packageDirectory, "dist")
const ELECTRON_BUILDER_CONFIG = "electron-builder.config.ts" as const

type ElectronPackageBuildInput = {
  electronBuilderArguments: readonly string[]
  environment: NodeJS.ProcessEnv
}

export async function buildElectronPackageAndSmoke(
  input: ElectronPackageBuildInput,
): Promise<void> {
  const before = capturePackagedResourcesSnapshot(distDirectory)
  await $`bunx --bun electron-builder ${input.electronBuilderArguments} --config ${ELECTRON_BUILDER_CONFIG}`
    .cwd(packageDirectory)
    .env(input.environment)
  const resourcesDirectory = resolveChangedPackagedResourcesDirectory({
    before,
    after: capturePackagedResourcesSnapshot(distDirectory),
  })
  await $`bun run smoke:packaged-backend-utility`
    .cwd(packageDirectory)
    .env({
      ...input.environment,
      [PACKAGED_RESOURCES_DIRECTORY_ENV]: resourcesDirectory,
    })
}

function readOptionalPackageTarget(args: readonly string[]): PackageTarget | undefined {
  const targetIndex = args.indexOf(PACKAGE_TARGET_FLAG)
  if (targetIndex < 0) {
    if (args.length === 0) return undefined
    throw new Error(`Usage: bun ./scripts/package-electron.ts [${PACKAGE_TARGET_FLAG} mac|win]`)
  }
  const target = args[targetIndex + 1]
  if ((target !== "mac" && target !== "win") || args.length !== 2) {
    throw new Error(`Usage: bun ./scripts/package-electron.ts [${PACKAGE_TARGET_FLAG} mac|win]`)
  }
  return target
}

async function runPackageCommand(): Promise<void> {
  const target = readOptionalPackageTarget(Bun.argv.slice(2))
  const environment = { ...process.env }
  const electronBuilderArguments = target
    ? [PACKAGE_TARGETS[target].electronBuilderFlag]
    : []
  if (target) assertPackageTarget(target)

  await $`bun run smoke:backend-utility`.cwd(packageDirectory).env(environment)
  await buildElectronPackageAndSmoke({ electronBuilderArguments, environment })
}

if (import.meta.main) {
  await runPackageCommand()
}
