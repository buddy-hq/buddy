import path from "node:path"
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
const uiDir = path.resolve(webDir, "../ui")

await $`bun run --cwd ${uiDir} build`

const generatedPlugins = tanstackRouterGenerator()
const plugins = Array.isArray(generatedPlugins) ? generatedPlugins : [generatedPlugins]

for (const plugin of plugins) {
  if (!hasConfigResolved(plugin)) continue
  await plugin.configResolved({ root: webDir })
}
