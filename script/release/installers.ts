import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import {
  BUDDY_DISTRIBUTIONS,
  formatReleaseRepositorySlug,
  type BuddyDistributionId,
} from "@buddy/script/distribution"
import { releaseDistribution, assertReleaseDestination } from "./distribution-guard"
import { uploadReleaseAssetSafely } from "./assets"

const INSTALLERS = ["install-buddy-macos.sh", "install-buddy-windows.ps1"] as const

/** Artifact names and all prod bytes remain unchanged. Only Beta defaults are rendered. */
export function renderReleaseInstaller(source: string, channel: BuddyDistributionId): string {
  if (channel === "prod") return source
  return source
    .replaceAll(
      formatReleaseRepositorySlug(BUDDY_DISTRIBUTIONS.prod),
      formatReleaseRepositorySlug(BUDDY_DISTRIBUTIONS.beta),
    )
    .replaceAll("Downloads/buddy-release", "Downloads/buddy-beta-release")
    .replaceAll("Buddy", BUDDY_DISTRIBUTIONS.beta.productName)
}

if (import.meta.main) {
  const repository = process.env.RELEASE_REPO?.trim() ?? ""
  const tag = process.env.RELEASE_TAG?.trim() ?? ""
  const distribution = assertReleaseDestination(repository)
  if (!/^v\d+\.\d+\.\d+$/u.test(tag)) throw new Error("RELEASE_TAG must be vX.Y.Z")
  const directory = await mkdtemp(
    path.join(os.tmpdir(), `buddy-${releaseDistribution().id}-installers-`),
  )
  try {
    for (const filename of INSTALLERS) {
      const sourcePath = path.resolve(import.meta.dir, "../../scripts", filename)
      const filePath = distribution.id === "prod" ? sourcePath : path.join(directory, filename)
      if (distribution.id === "beta") {
        await Bun.write(
          filePath,
          renderReleaseInstaller(await Bun.file(sourcePath).text(), distribution.id),
        )
      }
      await uploadReleaseAssetSafely({ filePath, repository, tag })
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
