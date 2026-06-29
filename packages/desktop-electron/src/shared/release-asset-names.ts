const VERSION_MACRO = "${version}"
const EXTENSION_MACRO = "${ext}"

export const MACOS_RELEASE_ARCHS = ["arm64", "x64"] as const
export const WINDOWS_RELEASE_ARCHS = ["x64"] as const

export type MacOsReleaseArch = (typeof MACOS_RELEASE_ARCHS)[number]
export type WindowsReleaseArch = (typeof WINDOWS_RELEASE_ARCHS)[number]

export function isMacOsReleaseArch(value: string): value is MacOsReleaseArch {
  return value === "arm64" || value === "x64"
}

export function isWindowsReleaseArch(value: string): value is WindowsReleaseArch {
  return value === "x64"
}

export function resolveConfiguredDesktopReleaseTargetArch(
  environment: NodeJS.ProcessEnv = process.env,
): MacOsReleaseArch | WindowsReleaseArch {
  const configured = environment.BUDDY_NODE_ARTIFACT_TARGET_ARCH?.trim()
  if (configured && (isMacOsReleaseArch(configured) || isWindowsReleaseArch(configured))) {
    return configured
  }

  if (process.arch === "arm64" || process.arch === "x64") {
    return process.arch
  }

  throw new Error(`Unsupported desktop release architecture: ${process.arch}`)
}

export function resolveMacOsReleaseArchLabel(arch: MacOsReleaseArch): "apple-silicon" | "intel" {
  return arch === "arm64" ? "apple-silicon" : "intel"
}

export function resolveWindowsReleaseArchLabel(arch: WindowsReleaseArch): WindowsReleaseArch {
  return arch
}

export function resolveMacOsUpdateManifestFilename(arch: MacOsReleaseArch): string {
  return `latest-macos-${arch}.json`
}

export function resolveWindowsUpdateManifestFilename(arch: WindowsReleaseArch): string {
  return `latest-windows-${arch}.yml`
}

export function resolveMacOsReleaseArtifactFilename(
  version: string,
  arch: MacOsReleaseArch,
  extension: string,
): string {
  return `buddy-v${version}-macos-${resolveMacOsReleaseArchLabel(arch)}.${extension}`
}

export function resolveWindowsReleaseArtifactFilename(
  version: string,
  arch: WindowsReleaseArch,
  extension: string,
): string {
  return `buddy-v${version}-windows-${resolveWindowsReleaseArchLabel(arch)}.${extension}`
}

export function resolveMacOsReleaseArtifactPattern(
  arch = resolveConfiguredDesktopReleaseTargetArch(),
): string {
  if (!isMacOsReleaseArch(arch)) {
    throw new Error(`Unsupported macOS release architecture: ${arch}`)
  }

  return `buddy-v${VERSION_MACRO}-macos-${resolveMacOsReleaseArchLabel(arch)}.${EXTENSION_MACRO}`
}

export function resolveWindowsReleaseArtifactPattern(
  arch = resolveConfiguredDesktopReleaseTargetArch(),
): string {
  if (!isWindowsReleaseArch(arch)) {
    throw new Error(`Unsupported Windows release architecture: ${arch}`)
  }

  return `buddy-v${VERSION_MACRO}-windows-${resolveWindowsReleaseArchLabel(arch)}.${EXTENSION_MACRO}`
}

export function resolveAllMacOsReleaseArchiveFilenames(version: string): string[] {
  return MACOS_RELEASE_ARCHS.map((arch) =>
    resolveMacOsReleaseArtifactFilename(version, arch, "zip"),
  )
}
