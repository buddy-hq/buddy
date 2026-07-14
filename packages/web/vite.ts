import { fileURLToPath } from "node:url"
import type { PluginOption, UserConfig } from "vite"
import { createFoliatePdfVitePlugin } from "./scripts/create-foliate-pdf-vite-plugin"

const BUDDY_WEB_PACKAGE_NAME = "@buddy/web"
const BUDDY_WEB_SOURCE_ALIAS = "@"
const WEB_SOURCE_DIRECTORY = fileURLToPath(new URL("./src", import.meta.url))
// TanStack Router auto-splits route components, so Vite's initial crawl cannot
// reliably discover component-only dependencies before the first navigation.
const WEB_OPTIMIZE_DEPS_INCLUDES = [
  "@mdxeditor/editor",
  "lexical",
  // Markdown highlighting starts its worker on the first code block. Vite does
  // not discover worker-only imports during its initial dependency crawl, so
  // discovering these later would rebuild the prebundle and reload the app.
  "@shikijs/stream",
  "shiki",
  // Chemistry diagrams start Indigo in a worker, while the Ketcher editor is
  // loaded only when an editable chemistry fence is opened. Neither lazy
  // boundary participates reliably in Vite's initial dependency crawl.
  "indigo-ketcher",
  "ketcher-react",
  "ketcher-standalone",
  // CJS-only UMD package. Excalidraw's exportToBlob -> loadSceneFonts path
  // does `new PromisePool(...)`. Without pre-bundling, Vite's runtime CJS
  // interop exposes the constructor on the wrong slot, so `default` is not a
  // constructor and sketch export fails with "Could not prepare the sketch."
  "es6-promise-pool",
]
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
