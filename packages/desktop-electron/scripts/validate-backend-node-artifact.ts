#!/usr/bin/env bun

import path from "node:path"
import {
  assertBackendNodeArtifactRuntimeFiles,
  currentBackendNodeArtifactTarget,
  type BackendNodeArtifactTarget,
} from "../../../script/backend-node-artifact"

const PACKAGE_DIR = path.resolve(import.meta.dir, "..")
const BACKEND_NODE_RESOURCES_DIR = path.resolve(PACKAGE_DIR, "resources/backend-node")
const TARGET_PLATFORM_ENV = "BUDDY_NODE_ARTIFACT_TARGET_PLATFORM"
const TARGET_ARCH_ENV = "BUDDY_NODE_ARTIFACT_TARGET_ARCH"

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index < 0) return undefined
  return args[index + 1]
}

function resolveTarget(): BackendNodeArtifactTarget {
  const args = Bun.argv.slice(2)
  const currentTarget = currentBackendNodeArtifactTarget()
  return {
    arch: readFlagValue(args, "--arch") ?? process.env[TARGET_ARCH_ENV] ?? currentTarget.arch,
    platform:
      readFlagValue(args, "--platform") ?? process.env[TARGET_PLATFORM_ENV] ?? currentTarget.platform,
  }
}

function assertLocalTargetMatchesHost(target: BackendNodeArtifactTarget): void {
  const currentTarget = currentBackendNodeArtifactTarget()
  if (target.platform === currentTarget.platform && target.arch === currentTarget.arch) return

  throw new Error(
    `Buddy backend-node resources are native. Refusing to package target ${target.platform}-${target.arch} from host ${currentTarget.platform}-${currentTarget.arch}. Run packaging on the matching host/arch so resources/backend-node contains the matching native packages.`,
  )
}

const target = resolveTarget()
assertLocalTargetMatchesHost(target)
assertBackendNodeArtifactRuntimeFiles({
  artifactDir: BACKEND_NODE_RESOURCES_DIR,
  target,
})

console.log(`Validated Buddy backend-node artifact for ${target.platform}-${target.arch}`)
