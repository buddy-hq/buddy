import { $ } from "bun"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { currentTargetTriple, readDesktopPackageVersion, updateDesktopPackageVersion } from "./utils"

const desktopDir = path.resolve(import.meta.dir, "..")
const backendDir = path.resolve(desktopDir, "../buddy")
const target = currentTargetTriple()
const originalVersion = readDesktopPackageVersion()
const version = Bun.env.BUDDY_VERSION?.trim() || originalVersion
const artifactDir = path.resolve(backendDir, "dist/release-sidecars")
const bundlesDir = path.resolve(desktopDir, "src-tauri/target/bundles")
const localUpdaterKeyPath = path.resolve(process.env.HOME ?? "~", ".config/buddy/tauri-updater.key")
const localUpdaterKeyPasswordPath = path.resolve(process.env.HOME ?? "~", ".config/buddy/tauri-updater.key.password")
const localUpdaterKey =
  process.env.TAURI_SIGNING_PRIVATE_KEY ||
  (process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
    ? readFileSync(process.env.TAURI_SIGNING_PRIVATE_KEY_PATH, "utf8")
    : existsSync(localUpdaterKeyPath)
      ? readFileSync(localUpdaterKeyPath, "utf8")
      : undefined)
const localUpdaterKeyPassword =
  process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ||
  (existsSync(localUpdaterKeyPasswordPath) ? readFileSync(localUpdaterKeyPasswordPath, "utf8").trim() : undefined)

const tauriBuildEnv = {
  ...process.env,
  ...(localUpdaterKey ? { TAURI_SIGNING_PRIVATE_KEY: localUpdaterKey } : {}),
  ...(localUpdaterKeyPassword ? { TAURI_SIGNING_PRIVATE_KEY_PASSWORD: localUpdaterKeyPassword } : {}),
}
const hasUpdaterSigning =
  !!tauriBuildEnv.TAURI_SIGNING_PRIVATE_KEY
const tauriConfig = hasUpdaterSigning
  ? "./src-tauri/tauri.prod.conf.json"
  : "./src-tauri/tauri.prod.noupdater.conf.json"

try {
  await $`bun run --cwd ${backendDir} build:release-sidecar --target ${target}`

  await $`bun ./scripts/prepare.ts`.cwd(desktopDir).env({
    ...process.env,
    BUDDY_RUST_TARGET: target,
    BUDDY_SIDECAR_ARTIFACT_DIR: artifactDir,
    BUDDY_VERSION: version,
  })

  await $`bunx tauri build --target ${target} --config ${tauriConfig}`.cwd(desktopDir).env(tauriBuildEnv)
  await $`bun ./scripts/copy-bundles.ts`.cwd(desktopDir).env({
    ...process.env,
    BUDDY_RUST_TARGET: target,
  })
} finally {
  if (Bun.env.BUDDY_VERSION?.trim() && originalVersion !== version) {
    updateDesktopPackageVersion(originalVersion)
  }
}

console.log(`Installable bundles copied to ${bundlesDir}`)
if (!hasUpdaterSigning) {
  console.log("Updater signing key not found. Built installable without auto-update support.")
}
