export type DesktopBunCompileTarget =
  | "bun-darwin-arm64"
  | "bun-darwin-x64"
  | "bun-windows-x64"
  | "bun-linux-x64"
  | "bun-linux-arm64"

export type DesktopSidecarTarget = {
  bunTarget: DesktopBunCompileTarget
  rustTarget: string
  sidecarDir: string
}

export const SIDECAR_BINARIES: DesktopSidecarTarget[] = [
  {
    rustTarget: "aarch64-apple-darwin",
    bunTarget: "bun-darwin-arm64",
    sidecarDir: "buddy-backend-darwin-arm64",
  },
  {
    rustTarget: "x86_64-apple-darwin",
    bunTarget: "bun-darwin-x64",
    sidecarDir: "buddy-backend-darwin-x64",
  },
  {
    rustTarget: "x86_64-pc-windows-msvc",
    bunTarget: "bun-windows-x64",
    sidecarDir: "buddy-backend-windows-x64",
  },
  {
    rustTarget: "x86_64-unknown-linux-gnu",
    bunTarget: "bun-linux-x64",
    sidecarDir: "buddy-backend-linux-x64",
  },
  {
    rustTarget: "aarch64-unknown-linux-gnu",
    bunTarget: "bun-linux-arm64",
    sidecarDir: "buddy-backend-linux-arm64",
  },
]

export const DESKTOP_SIDECAR_TARGETS = SIDECAR_BINARIES

export const RELEASE_SIDECAR_BINARIES = SIDECAR_BINARIES.filter(
  (target) => !target.rustTarget.includes("linux"),
)

export const RELEASE_DESKTOP_SIDECAR_TARGETS = RELEASE_SIDECAR_BINARIES

export function resolveDesktopRustTarget(env: NodeJS.ProcessEnv) {
  const target = env.BUDDY_RUST_TARGET ?? env.RUST_TARGET ?? env.TAURI_ENV_TARGET_TRIPLE
  return target?.trim()
}

export function currentDesktopRustTarget() {
  if (process.platform === "darwin" && process.arch === "arm64") return "aarch64-apple-darwin"
  if (process.platform === "darwin" && process.arch === "x64") return "x86_64-apple-darwin"
  if (process.platform === "linux" && process.arch === "arm64") return "aarch64-unknown-linux-gnu"
  if (process.platform === "linux" && process.arch === "x64") return "x86_64-unknown-linux-gnu"
  if (process.platform === "win32" && process.arch === "x64") return "x86_64-pc-windows-msvc"
  throw new Error(`Unsupported desktop target: ${process.platform}/${process.arch}`)
}

export function getSidecarTargetByRustTarget(target: string) {
  const binary = SIDECAR_BINARIES.find((item) => item.rustTarget === target)
  if (!binary) {
    throw new Error(`Sidecar configuration not available for Rust target '${target}'`)
  }
  return binary
}

export function isWindowsRustTarget(target: string) {
  return target.includes("windows")
}

export function windowsifyBinaryName(filepath: string, target: string) {
  if (filepath.endsWith(".exe")) return filepath
  return isWindowsRustTarget(target) ? `${filepath}.exe` : filepath
}

export const RELEASE_DESKTOP_TARGETS = SIDECAR_BINARIES.filter(
  (target) => !target.rustTarget.includes("linux"),
)
