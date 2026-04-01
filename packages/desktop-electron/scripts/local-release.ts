import { $ } from "bun"
import path from "node:path"
import {
  currentTargetTriple,
  readDesktopPackageVersion,
  updateDesktopPackageVersion,
} from "./utils"

const packageDir = path.resolve(import.meta.dir, "..")
const backendDir = path.resolve(packageDir, "../buddy")
const target = currentTargetTriple()
const originalVersion = readDesktopPackageVersion()
const version = Bun.env.BUDDY_VERSION?.trim() || originalVersion
const artifactDir = path.resolve(backendDir, "dist/release-sidecars")

try {
  await $`bun run --cwd ${backendDir} build:release-sidecar --target ${target}`

  await $`bun ./scripts/prepare.ts`.cwd(packageDir).env({
    ...process.env,
    BUDDY_RUST_TARGET: target,
    BUDDY_SIDECAR_ARTIFACT_DIR: artifactDir,
    BUDDY_VERSION: version,
  })

  await $`bun run build`.cwd(packageDir)

  if (process.platform === "darwin") {
    await $`bun run package:mac`.cwd(packageDir)
  } else if (process.platform === "win32") {
    await $`bun run package:win`.cwd(packageDir)
  } else {
    throw new Error("Unsupported local installable target")
  }

  await $`bun ./scripts/copy-bundles.ts`.cwd(packageDir)
} finally {
  if (Bun.env.BUDDY_VERSION?.trim() && originalVersion !== version) {
    updateDesktopPackageVersion(originalVersion)
  }
}

console.log("Electron installable bundles copied to dist/bundles")
