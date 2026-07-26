import { $ } from "bun"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { BUDDY_CHANNEL_ENV, readBuddyReleaseChannel } from "@buddy/script/channel"
import { ensureGeneratedSdk, generatedSdkFreshnessInput } from "./dev-sdk"
import { backendDevelopmentWatchRoots } from "./electron-vite-build-policy"

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
const sdkDir = path.resolve(packageDir, "../sdk")
const sdkFreshness = generatedSdkFreshnessInput({
  backendSourcePaths: backendDevelopmentWatchRoots(repositoryRoot),
  repositoryRoot,
  sdkDir,
})

const mainCacheDir = resolveMainRepoAdvancedMathCacheDir(packageDir)
if (mainCacheDir) {
  process.env.BUDDY_ADVANCED_MATH_RUNTIME_CACHE_DIR = mainCacheDir
}

async function prepareGeneratedSdk(): Promise<void> {
  const generated = await ensureGeneratedSdk(sdkFreshness, async () => {
    await $`bun run --cwd ${sdkDir} generate`
  })
  if (!generated) console.log("Buddy SDK is current")
}

await Promise.all([
  $`bun ./scripts/copy-icons.ts ${desktopChannel}`,
  $`bun run --cwd ${backendDir} ensure:advanced-math-runtime`,
  $`bun run --cwd ${backendDir} build:node`.env({
    ...process.env,
    [BUDDY_CHANNEL_ENV]: desktopChannel,
  }),
  prepareGeneratedSdk(),
])
