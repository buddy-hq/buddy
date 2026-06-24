import { $ } from "bun"
import path from "node:path"
import { readDesktopPackageVersion, updateDesktopPackageVersion } from "./utils"

const packageDir = path.resolve(import.meta.dir, "..")
const originalVersion = readDesktopPackageVersion()
const version = process.env.BUDDY_VERSION?.trim() || originalVersion

try {
  await $`bun ./scripts/prepare.ts`.cwd(packageDir).env({
    ...process.env,
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
  if (process.env.BUDDY_VERSION?.trim() && originalVersion !== version) {
    updateDesktopPackageVersion(originalVersion)
  }
}

console.log("Electron installable bundles copied to dist/bundles")
