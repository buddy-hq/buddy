#!/usr/bin/env bun

export const PACKAGE_TARGET_FLAG = "--target" as const

export type PackageTarget = "mac" | "win"

type TargetRuntime = {
  electronBuilderFlag: string
  platform: NodeJS.Platform
}

export const PACKAGE_TARGETS = {
  mac: {
    electronBuilderFlag: "--mac",
    platform: "darwin",
  },
  win: {
    electronBuilderFlag: "--win",
    platform: "win32",
  },
} satisfies Record<PackageTarget, TargetRuntime>

function readTarget(): PackageTarget {
  const args = Bun.argv.slice(2)
  const target = args[args.indexOf(PACKAGE_TARGET_FLAG) + 1]
  if (target === "mac" || target === "win") return target
  throw new Error(`Expected ${PACKAGE_TARGET_FLAG} mac|win`)
}

export function assertPackageTarget(
  target: PackageTarget,
  platform: NodeJS.Platform = process.platform,
): void {
  const runtime = PACKAGE_TARGETS[target]
  if (platform === runtime.platform) return
  throw new Error(
    [
      `Cannot run electron-builder ${runtime.electronBuilderFlag} on ${platform}.`,
      "The Electron main output embeds target-native utility-process dependencies.",
      `Build and package ${target} on ${runtime.platform}.`,
    ].join(" "),
  )
}

if (import.meta.main) {
  assertPackageTarget(readTarget())
}
