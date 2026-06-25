#!/usr/bin/env bun

const TARGET_FLAG = "--target" as const

type PackageTarget = "mac" | "win"

type TargetRuntime = {
  electronBuilderFlag: string
  platform: NodeJS.Platform
}

const TARGET_RUNTIMES = {
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
  const target = args[args.indexOf(TARGET_FLAG) + 1]
  if (target === "mac" || target === "win") return target
  throw new Error(`Expected ${TARGET_FLAG} mac|win`)
}

const target = readTarget()
const runtime = TARGET_RUNTIMES[target]

if (process.platform !== runtime.platform) {
  throw new Error(
    [
      `Cannot run electron-builder ${runtime.electronBuilderFlag} on ${process.platform}.`,
      "The Electron main output embeds target-native utility-process dependencies.",
      `Build and package ${target} on ${runtime.platform}.`,
    ].join(" "),
  )
}
