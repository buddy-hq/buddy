import { $ } from "bun"
import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import {
  logDesktopRuntimeResources,
  syncDesktopRuntimeResources,
} from "./utils"

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

await $`bun ./scripts/copy-icons.ts ${process.env.BUDDY_CHANNEL ?? "dev"}`

const packageDir = path.resolve(import.meta.dir, "..")
const viteCacheDirectory = path.resolve(packageDir, "node_modules/.vite")
const backendDir = path.resolve(packageDir, "../buddy")
const webDir = path.resolve(packageDir, "../web")

const mainCacheDir = resolveMainRepoAdvancedMathCacheDir(packageDir)
if (mainCacheDir) {
  process.env.BUDDY_ADVANCED_MATH_RUNTIME_CACHE_DIR = mainCacheDir
}

// Ensure renderer dependency graph is rebuilt after workspace dependency changes.
rmSync(viteCacheDirectory, { recursive: true, force: true })

await $`bun run --cwd ${webDir} prepare:web`
await $`bun run --cwd ${backendDir} ensure:advanced-math-runtime`
await $`bun run --cwd ${backendDir} build:node`
logDesktopRuntimeResources(syncDesktopRuntimeResources())
