export function resolveCompiledBackendTarget(input: {
  host: { platform: string; arch: string }
  requested: { platform?: string; arch?: string }
}): Bun.Build.CompileTarget {
  const platform = input.requested.platform?.trim() || input.host.platform
  const arch = input.requested.arch?.trim() || input.host.arch
  if (platform !== input.host.platform || arch !== input.host.arch) {
    throw new Error(
      `Backend must be built natively: requested ${platform}-${arch}, host ${input.host.platform}-${input.host.arch}`,
    )
  }
  if (platform === "darwin" && arch === "arm64") return "bun-darwin-arm64"
  if (platform === "darwin" && arch === "x64") return "bun-darwin-x64-baseline"
  if (platform === "win32" && arch === "arm64") return "bun-windows-arm64"
  if (platform === "win32" && arch === "x64") return "bun-windows-x64-baseline"
  if (platform === "linux" && arch === "arm64") return "bun-linux-arm64"
  if (platform === "linux" && arch === "x64") return "bun-linux-x64"
  throw new Error(`Unsupported backend build host: ${platform}-${arch}`)
}

export function baselineRuntimeArchive(target: Bun.Build.CompileTarget, bunVersion: string) {
  if (!target.endsWith("-baseline")) return undefined
  const release = `https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}`
  return {
    name: target,
    archiveURL: `${release}/${target}.zip`,
    checksumsURL: `${release}/SHASUMS256.txt`,
    executable: `${target}/${target.includes("-windows-") ? "bun.exe" : "bun"}`,
  }
}
