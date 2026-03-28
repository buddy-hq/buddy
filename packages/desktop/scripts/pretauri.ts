import { $ } from "bun"

const releaseArtifactDir = Bun.env.BUDDY_SIDECAR_ARTIFACT_DIR?.trim()

if (releaseArtifactDir) {
  console.log(
    `Skipping predev because release sidecars are already staged from ${releaseArtifactDir}`,
  )
} else {
  await $`bun run predev`
}
