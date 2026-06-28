import { fileURLToPath } from "node:url"
import type { PluginOption, UserConfig } from "vite"
import { createFoliatePdfVitePlugin } from "./scripts/create-foliate-pdf-vite-plugin.ts"

const BUDDY_WEB_PACKAGE_NAME = "@buddy/web"
const BUDDY_WEB_SOURCE_ALIAS = "@"
const WEB_SOURCE_DIRECTORY = fileURLToPath(new URL("./src", import.meta.url))
// TanStack Router auto-splits route components, so Vite's initial crawl cannot
// reliably discover component-only dependencies before the first navigation.
const WEB_OPTIMIZE_DEPS_INCLUDES = ["@mdxeditor/editor", "lexical"]
const WEB_OPTIMIZE_DEPS_EXCLUDES = [
  "foliate-js/view.js",
  "foliate-js/pdf.js",
  "foliate-js/overlayer.js",
  "foliate-js/vendor/pdfjs/pdf.mjs",
]
const WEB_DEDUPE_MODULES = ["react", "react-dom"]

export type BuddyWebVitePluginOptions = {
  includeRootAlias?: boolean
  resolveOptimizeDepsFromLinkedWebPackage?: boolean
}

function resolveOptimizeDepsIncludes(fromLinkedWebPackage: boolean): string[] {
  if (!fromLinkedWebPackage) return WEB_OPTIMIZE_DEPS_INCLUDES
  return WEB_OPTIMIZE_DEPS_INCLUDES.map((dependency) => `${BUDDY_WEB_PACKAGE_NAME} > ${dependency}`)
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
  const optimizeDepsIncludes = resolveOptimizeDepsIncludes(
    options.resolveOptimizeDepsFromLinkedWebPackage ?? false,
  )

  return [
    {
      name: "buddy-web:vite-config",
      config() {
        return {
          optimizeDeps: {
            include: optimizeDepsIncludes,
            exclude: WEB_OPTIMIZE_DEPS_EXCLUDES,
          },
          resolve: {
            dedupe: WEB_DEDUPE_MODULES,
            alias: createBuddyWebResolveAlias(includeRootAlias),
          },
          worker: {
            format: "es",
          },
        } satisfies UserConfig
      },
    },
    createFoliatePdfVitePlugin(),
  ]
}

export default buddyWebVitePlugin
