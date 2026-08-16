export const RELEASE_SMOKE_TARGET_NAMES = ["macos-arm64", "macos-x64", "windows-x64"] as const

export type ReleaseSmokeTargetName = (typeof RELEASE_SMOKE_TARGET_NAMES)[number]

type ReleaseSmokeTarget = {
  architecture: "arm64" | "x64"
  electronBuilderArguments: readonly string[]
  installArguments: readonly string[]
  platform: "darwin" | "win32"
}

export type ReleaseTargetEnvironment = {
  BUDDY_NODE_ARTIFACT_TARGET_ARCH: ReleaseSmokeTarget["architecture"]
  BUDDY_NODE_ARTIFACT_TARGET_PLATFORM: ReleaseSmokeTarget["platform"]
}

export type ReleaseTargetSelectionEnvironment = {
  BUDDY_RELEASE_TARGET_MACOS_ARM64: "true" | "false"
  BUDDY_RELEASE_TARGET_MACOS_X64: "true" | "false"
  BUDDY_RELEASE_TARGET_WINDOWS_X64: "true" | "false"
}

export const RELEASE_SMOKE_TARGETS = {
  "macos-arm64": {
    architecture: "arm64",
    electronBuilderArguments: ["--mac", "--arm64"],
    installArguments: ["--os=darwin", "--cpu=arm64"],
    platform: "darwin",
  },
  "macos-x64": {
    architecture: "x64",
    electronBuilderArguments: ["--mac", "--x64"],
    installArguments: ["--os=darwin", "--cpu=x64"],
    platform: "darwin",
  },
  "windows-x64": {
    architecture: "x64",
    electronBuilderArguments: ["--win", "--x64"],
    installArguments: [],
    platform: "win32",
  },
} as const satisfies Record<ReleaseSmokeTargetName, ReleaseSmokeTarget>

export function isReleaseSmokeTargetName(value: string): value is ReleaseSmokeTargetName {
  return RELEASE_SMOKE_TARGET_NAMES.some((target) => target === value)
}

export function resolveNativeReleaseSmokeTarget(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): ReleaseSmokeTargetName {
  if (platform === "darwin" && architecture === "arm64") return "macos-arm64"
  if (platform === "darwin" && architecture === "x64") return "macos-x64"
  if (platform === "win32" && architecture === "x64") return "windows-x64"

  throw new Error(`Unsupported local release smoke host: ${platform}-${architecture}`)
}

export function releaseTargetEnvironment(
  targetName: ReleaseSmokeTargetName,
): ReleaseTargetEnvironment {
  const target = RELEASE_SMOKE_TARGETS[targetName]
  return {
    BUDDY_NODE_ARTIFACT_TARGET_ARCH: target.architecture,
    BUDDY_NODE_ARTIFACT_TARGET_PLATFORM: target.platform,
  }
}

export function releaseTargetSelectionEnvironment(
  targetName: ReleaseSmokeTargetName,
): ReleaseTargetSelectionEnvironment {
  return {
    BUDDY_RELEASE_TARGET_MACOS_ARM64: targetName === "macos-arm64" ? "true" : "false",
    BUDDY_RELEASE_TARGET_MACOS_X64: targetName === "macos-x64" ? "true" : "false",
    BUDDY_RELEASE_TARGET_WINDOWS_X64: targetName === "windows-x64" ? "true" : "false",
  }
}
