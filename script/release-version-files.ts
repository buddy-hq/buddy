import { $ } from "bun"
import path from "node:path"
import { z } from "zod"

const PackageManifestSchema = z.looseObject({ version: z.string() })

export const RELEASE_VERSION_PACKAGE_FILES = [
  "packages/desktop-electron/package.json",
  "packages/buddy/package.json",
  "packages/web/package.json",
  "packages/ui/package.json",
  "packages/sdk/package.json",
  "packages/opencode-adapter/package.json",
] as const

export const RELEASE_VERSION_GIT_FILES = [...RELEASE_VERSION_PACKAGE_FILES, "bun.lock"] as const

export async function updateReleaseVersionPackageFiles(rootDir: string, version: string) {
  for (const relativePath of RELEASE_VERSION_PACKAGE_FILES) {
    const target = path.join(rootDir, relativePath)
    const pkg = PackageManifestSchema.parse(await Bun.file(target).json())
    pkg.version = version
    await Bun.write(target, `${JSON.stringify(pkg, null, 2)}\n`)
  }

  await $`bun install --lockfile-only`.cwd(rootDir)
}

export async function stageReleaseVersionPackageFiles(rootDir: string) {
  for (const relativePath of RELEASE_VERSION_GIT_FILES) {
    await $`git add ${relativePath}`.cwd(rootDir)
  }
}
