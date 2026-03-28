import { $ } from "bun"

const releaseArtifactDir = Bun.env.BUDDY_SIDECAR_ARTIFACT_DIR?.trim()
const skipPredev = Boolean(releaseArtifactDir) || Bun.env.CI === "true"

if (skipPredev) {
  console.log(
    releaseArtifactDir
      ? `Skipping predev because release sidecars are already staged from ${releaseArtifactDir}`
      : "Skipping predev in CI; release packaging uses prebuild + prepare:release instead",
  )
} else {
  await $`bun run predev`
}
