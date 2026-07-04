#!/usr/bin/env bun

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import {
  RELEASE_SMOKE_TARGETS,
  releaseTargetEnvironment,
  releaseTargetSelectionEnvironment,
  resolveNativeReleaseSmokeTarget,
} from "../packages/desktop-electron/scripts/release-smoke-target"
import { releaseRepository } from "./release-repositories"

const VERSION_FLAG = "--version"
const COMMIT_FLAG = "--commit"
const SELECTED_TARGETS_FLAG = "--selected-targets"
const DEVELOPMENT_CHANNEL = "dev"
const PRODUCTION_CHANNEL = "prod"
const LOCAL_KEY_DIRECTORY_SEGMENTS = [".config", "buddy"] as const
const LOCAL_KEY_FILENAME = "tauri-updater.key"
const LOCAL_KEY_PASSWORD_FILENAME = "tauri-updater.key.password"
const repositoryRoot = path.resolve(import.meta.dir, "..")

function readRequiredFlag(name: string): string {
  const index = Bun.argv.indexOf(name)
  const value = index < 0 ? undefined : Bun.argv[index + 1]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function run(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    quiet?: boolean
  } = {},
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  })
  if (result.status !== 0) {
    const detail = options.quiet ? result.stderr.trim() || result.stdout.trim() : undefined
    throw new Error(`${[command, ...args].join(" ")} failed${detail ? `: ${detail}` : ""}`)
  }
  return options.quiet ? result.stdout.trim() : ""
}

function resolveCommit(commit: string): string {
  return run("git", ["rev-parse", "--verify", `${commit}^{commit}`], {
    quiet: true,
  })
}

function updaterSigningEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  if (
    environment.TAURI_SIGNING_PRIVATE_KEY?.trim() ||
    environment.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()
  ) {
    return environment
  }

  const keyDirectory = path.join(os.homedir(), ...LOCAL_KEY_DIRECTORY_SEGMENTS)
  const keyPath = path.join(keyDirectory, LOCAL_KEY_FILENAME)
  if (!existsSync(keyPath)) {
    throw new Error(
      `Local updater signing key not found at ${keyPath}. Configure TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH.`,
    )
  }

  environment.TAURI_SIGNING_PRIVATE_KEY_PATH = keyPath
  const passwordPath = path.join(keyDirectory, LOCAL_KEY_PASSWORD_FILENAME)
  if (!environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD?.trim() && existsSync(passwordPath)) {
    environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = readFileSync(passwordPath, "utf8").trim()
  }
  return environment
}

function runBuddyDevSpotCheck(
  version: string,
  targetName: ReturnType<typeof resolveNativeReleaseSmokeTarget>,
): void {
  const target = resolveNativeReleaseSmokeTarget()
  if (target !== targetName) {
    throw new Error(`Native target changed from ${targetName} to ${target}`)
  }

  const environment = {
    ...process.env,
    ...releaseTargetEnvironment(target),
    BUDDY_CHANNEL: DEVELOPMENT_CHANNEL,
    BUDDY_VERSION: version,
  }

  console.log(`\n== Buddy Dev installable spot-check (${target}) ==`)
  run("bun", ["run", "build:installable:electron"], {
    env: environment,
  })
  run(
    "bun",
    ["./packages/desktop-electron/scripts/spot-check-installable.ts", VERSION_FLAG, version],
    {
      env: environment,
    },
  )
}

function runProductionTargetSmoke(input: {
  commit: string
  signingEnvironment: NodeJS.ProcessEnv
  targetName: ReturnType<typeof resolveNativeReleaseSmokeTarget>
  version: string
}): void {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-release-smoke-"))
  const worktreeDirectory = path.join(temporaryRoot, "checkout")
  const manifestDirectory = path.join(temporaryRoot, "manifests")
  const target = RELEASE_SMOKE_TARGETS[input.targetName]
  let worktreeAdded = false

  console.log(`\n== Production release smoke (${input.targetName}) ==`)
  try {
    run("git", ["worktree", "add", "--detach", worktreeDirectory, input.commit])
    worktreeAdded = true

    run("bun", ["install", ...target.installArguments], {
      cwd: worktreeDirectory,
    })

    const releaseEnvironment = {
      ...input.signingEnvironment,
      ...releaseTargetEnvironment(input.targetName),
      BUDDY_CHANNEL: PRODUCTION_CHANNEL,
      BUDDY_VERSION: input.version,
    }
    run(
      "bun",
      ["./packages/desktop-electron/scripts/build-release-target.ts", "--target", input.targetName],
      {
        cwd: worktreeDirectory,
        env: releaseEnvironment,
      },
    )

    run("bun", ["./packages/desktop-electron/scripts/finalize-target-update-manifests.ts"], {
      cwd: worktreeDirectory,
      env: {
        ...releaseEnvironment,
        ...releaseTargetSelectionEnvironment(input.targetName),
        BUDDY_RELEASE_DRY_RUN: "1",
        BUDDY_RELEASE_REPO: releaseRepository(),
        BUDDY_RELEASE_SELECTED_TARGETS_ONLY: "1",
        BUDDY_RELEASE_TAG: `v${input.version}`,
        BUDDY_UPDATE_OUTPUT_DIR: manifestDirectory,
        ELECTRON_DIST_DIR: path.join(worktreeDirectory, "packages", "desktop-electron", "dist"),
      },
    })
  } finally {
    if (worktreeAdded) {
      spawnSync("git", ["worktree", "remove", "--force", worktreeDirectory], {
        cwd: repositoryRoot,
        stdio: "ignore",
      })
    }
    rmSync(temporaryRoot, { force: true, recursive: true })
    spawnSync("git", ["worktree", "prune"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    })
  }
}

const version = readRequiredFlag(VERSION_FLAG)
const commit = resolveCommit(readRequiredFlag(COMMIT_FLAG))
const selectedTargets = new Set(
  readRequiredFlag(SELECTED_TARGETS_FLAG)
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean),
)
const targetName = resolveNativeReleaseSmokeTarget()
const signingEnvironment = updaterSigningEnvironment()

if (!selectedTargets.has(targetName)) {
  console.warn(
    `Native target ${targetName} is not selected for this release; running it as a host smoke only.`,
  )
}

run("bun", ["run", "--cwd", "packages/desktop-electron", "verify:update-signing"], {
  env: signingEnvironment,
})
runBuddyDevSpotCheck(version, targetName)
runProductionTargetSmoke({
  commit,
  signingEnvironment,
  targetName,
  version,
})

console.log(`\nLocal release gates passed for ${targetName} at ${commit.slice(0, 12)}`)
