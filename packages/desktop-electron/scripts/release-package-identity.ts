import { execFileSync } from "node:child_process"
import path from "node:path"
import { z } from "zod"
import type { BuddyDistribution } from "@buddy/script/distribution"

export async function verifyReleasePackageIdentity(input: {
  architecture: "arm64" | "x64"
  directory: string
  distribution: BuddyDistribution
  platform: "darwin" | "win32"
}): Promise<void> {
  if (input.platform === "darwin") {
    const macDirectory = input.architecture === "arm64" ? "mac-arm64" : "mac"
    const plist = path.join(
      input.directory,
      macDirectory,
      `${input.distribution.productName}.app`,
      "Contents",
      "Info.plist",
    )
    const appId = execFileSync("plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", plist], {
      encoding: "utf8",
      env: { ...process.env },
    }).trim()
    if (appId !== input.distribution.appId) {
      throw new Error(`Packaged bundle id ${appId} does not match ${input.distribution.appId}`)
    }
    return
  }
  const resources = path.join(input.directory, "win-unpacked", "resources")
  const update = z.object({ owner: z.string(), repo: z.string() }).parse(
    Bun.YAML.parse(await Bun.file(path.join(resources, "app-update.yml")).text()),
  )
  if (
    update.owner !== input.distribution.releaseOwner ||
    update.repo !== input.distribution.releaseRepository
  ) {
    throw new Error(`Packaged Windows updater destination does not match ${input.distribution.productName}`)
  }
  const executable = path.join(input.directory, "win-unpacked", `${input.distribution.productName}.exe`)
  if (!(await Bun.file(executable).exists())) {
    throw new Error(`Packaged Windows product name does not match ${input.distribution.productName}`)
  }
}
