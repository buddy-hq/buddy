import path from "node:path"
import fs from "node:fs/promises"
import { $ } from "bun"
import { tanstackRouterGenerator } from "@tanstack/router-plugin/vite"
import type { Plugin } from "vite"

type ConfigResolvedPlugin = Plugin & {
  configResolved: (config: { root: string }) => void | Promise<void>
}

function hasConfigResolved(plugin: Plugin): plugin is ConfigResolvedPlugin {
  return typeof plugin.configResolved === "function"
}

const webDir = path.resolve(import.meta.dir, "..")
const sdkDir = path.resolve(webDir, "../sdk")
const uiDir = path.resolve(webDir, "../ui")
const sdkEntryPath = path.resolve(sdkDir, "src/gen/sdk.gen.ts")
const mode = process.argv[2] ?? "full"

async function ensureSdkGenerated() {
  try {
    await fs.access(sdkEntryPath)
  } catch {
    throw new Error(
      "Buddy SDK is not generated. Run `bun run sdk:generate` or `bun run prepare:web` first.",
    )
  }
}

if (mode === "full") {
  await $`bun run --cwd ${sdkDir} generate`
  await $`bun run --cwd ${uiDir} build`
} else if (mode === "typecheck") {
  await ensureSdkGenerated()
} else {
  throw new Error(`Unknown prepare:web mode: ${mode}`)
}

const generatedPlugins = tanstackRouterGenerator()
const plugins = Array.isArray(generatedPlugins) ? generatedPlugins : [generatedPlugins]

for (const plugin of plugins) {
  if (!hasConfigResolved(plugin)) continue
  await plugin.configResolved({ root: webDir })
}
