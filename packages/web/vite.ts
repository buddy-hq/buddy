import { fileURLToPath } from "node:url"
import type { PluginOption, UserConfig } from "vite"
import { createFoliatePdfVitePlugin } from "./scripts/create-foliate-pdf-vite-plugin.ts"

const BUDDY_WEB_PACKAGE_NAME = "@buddy/web"
const BUDDY_WEB_SOURCE_ALIAS = "@"
const WEB_SOURCE_DIRECTORY = fileURLToPath(new URL("./src", import.meta.url))
const WEB_OPTIMIZE_DEPS_EXCLUDES = [
  "foliate-js/view.js",
  "foliate-js/pdf.js",
  "foliate-js/vendor/pdfjs/pdf.mjs",
]
const WEB_DEDUPE_MODULES = ["react", "react-dom"]

export type BuddyWebVitePluginOptions = {
  includeRootAlias?: boolean
}

function createBuddyWebResolveAlias(includeRootAlias: boolean) {
  return [
    {
      find: BUDDY_WEB_PACKAGE_NAME,
      replacement: WEB_SOURCE_DIRECTORY,
    },
    ...(includeRootAlias
      ? [
          {
            find: BUDDY_WEB_SOURCE_ALIAS,
            replacement: WEB_SOURCE_DIRECTORY,
          },
        ]
      : []),
  ] satisfies NonNullable<UserConfig["resolve"]>["alias"]
}

export function buddyWebVitePlugin(options: BuddyWebVitePluginOptions = {}): PluginOption[] {
  const includeRootAlias = options.includeRootAlias ?? true

  return [
    {
      name: "buddy-web:vite-config",
      config() {
        return {
          optimizeDeps: {
            exclude: WEB_OPTIMIZE_DEPS_EXCLUDES,
          },
          resolve: {
            dedupe: WEB_DEDUPE_MODULES,
            alias: createBuddyWebResolveAlias(includeRootAlias),
          },
        } satisfies UserConfig
      },
    },
    createFoliatePdfVitePlugin(),
  ]
}

export default buddyWebVitePlugin
