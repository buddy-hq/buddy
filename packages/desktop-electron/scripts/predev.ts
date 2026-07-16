import { $ } from "bun"
import { existsSync, readFileSync } from "node:fs"
import { rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { BUDDY_CHANNEL_ENV, readBuddyReleaseChannel } from "@buddy/script/channel"
import { generatedSdkNeedsRefresh, generatedSdkSourcePaths } from "./dev-sdk"

function resolveMainRepoAdvancedMathCacheDir(packageDir: string): string | undefined {
  const gitFile = path.resolve(packageDir, "../../.git")
  if (!existsSync(gitFile)) return undefined

  try {
    const content = readFileSync(gitFile, "utf8").trim()
    if (!content.startsWith("gitdir: ")) return undefined

    const gitdirPath = content.slice("gitdir: ".length).trim()
    const resolvedGitdir = path.resolve(path.dirname(gitFile), gitdirPath)
    const mainRepoRoot = path.resolve(resolvedGitdir, "..", "..", "..")
    const mainCacheDir = path.join(
      mainRepoRoot,
      "packages",
      "buddy",
      "dist",
      "advanced-math-runtime",
    )
    if (existsSync(mainCacheDir)) {
      return mainCacheDir
    }
  } catch {
    // noop
  }

  return undefined
}

const desktopChannel = readBuddyReleaseChannel()
const packageDir = path.resolve(import.meta.dir, "..")
const repositoryRoot = path.resolve(packageDir, "../..")
const backendDir = path.resolve(packageDir, "../buddy")
const adapterDir = path.resolve(packageDir, "../opencode-adapter")
const sdkDir = path.resolve(packageDir, "../sdk")
const generatedSdkDir = path.resolve(sdkDir, "src/gen")
const generatedSdkOutputs = [
  path.resolve(generatedSdkDir, "sdk.gen.ts"),
  path.resolve(generatedSdkDir, "types.gen.ts"),
  path.resolve(generatedSdkDir, "client/index.ts"),
] as const
const generatedSdkSuccessMarker = path.resolve(generatedSdkDir, ".generation-complete")
const sdkSourcePaths = generatedSdkSourcePaths({
  repositoryRoot,
  backendDir,
  adapterDir,
  sdkDir,
})

const mainCacheDir = resolveMainRepoAdvancedMathCacheDir(packageDir)
if (mainCacheDir) {
  process.env.BUDDY_ADVANCED_MATH_RUNTIME_CACHE_DIR = mainCacheDir
}

async function ensureGeneratedSdk(): Promise<void> {
  if (
    !generatedSdkNeedsRefresh({
      generatedOutputs: generatedSdkOutputs,
      successMarker: generatedSdkSuccessMarker,
      sourcePaths: sdkSourcePaths,
    })
  ) {
    console.log("Buddy SDK is current")
    return
  }

  await rm(generatedSdkSuccessMarker, { force: true })
  await $`bun run --cwd ${sdkDir} generate`
  await writeFile(generatedSdkSuccessMarker, "")
}

await Promise.all([
  $`bun ./scripts/copy-icons.ts ${desktopChannel}`,
  $`bun run --cwd ${backendDir} ensure:advanced-math-runtime`,
  $`bun run --cwd ${backendDir} build:node`.env({
    ...process.env,
    [BUDDY_CHANNEL_ENV]: desktopChannel,
  }),
  ensureGeneratedSdk(),
])
