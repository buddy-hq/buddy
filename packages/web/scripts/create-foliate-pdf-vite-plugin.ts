import { readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import type { PluginOption } from "vite"

const FOLIATE_PDF_MODULE_SEGMENT = "/node_modules/foliate-js/pdf.js"
const FOLIATE_PDF_BUNDLE_SEGMENTS = [
  "/node_modules/foliate-js/vendor/pdfjs/pdf.mjs",
  "/node_modules/foliate-js/vendor/pdfjs/pdf.worker.mjs",
] as const
const FOLIATE_PAGINATOR_MODULE_SEGMENT = "/node_modules/foliate-js/paginator.js"
const FOLIATE_PDF_URL_EXPRESSION = "new URL(`vendor/pdfjs/${path}`, import.meta.url).toString()"
const VITE_COMPATIBLE_PDF_URL_EXPRESSION =
  'new URL("./vendor/pdfjs/" + path, import.meta.url).toString()'
const FOLIATE_PDF_OUTPUT_DIRECTORY = "assets/vendor/pdfjs"
const FOLIATE_PDF_RUNTIME_FILE_NAMES = [
  "annotation_layer_builder.css",
  "pdf.worker.mjs",
  "pdf.worker.mjs.map",
  "text_layer_builder.css",
] as const
const FOLIATE_PDF_RUNTIME_DIRECTORY_NAMES = ["cmaps", "standard_fonts"] as const
const FOLIATE_PAGINATOR_BACKGROUND_SNIPPET = `requestAnimationFrame(() =>
            this.#background.style.background = getBackground(this.#view.document))`
const SAFE_FOLIATE_PAGINATOR_BACKGROUND_SNIPPET = `requestAnimationFrame(() => {
            const doc = this.#view?.document
            if (!doc) return
            this.#background.style.background = getBackground(doc)
        })`
const MAP_GET_OR_INSERT_COMPUTED_POLYFILL = `const ensureGetOrInsertComputed = Ctor => {
    if (typeof Ctor !== 'function') return
    const { prototype } = Ctor
    if (typeof prototype.getOrInsertComputed === 'function') return
    Object.defineProperty(prototype, 'getOrInsertComputed', {
        value(key, factory) {
            if (this.has(key)) return this.get(key)
            const value = factory(key)
            this.set(key, value)
            return value
        },
        configurable: true,
        writable: true,
    })
}
ensureGetOrInsertComputed(Map)
ensureGetOrInsertComputed(WeakMap)
`

const require = createRequire(import.meta.url)
const FOLIATE_PACKAGE_DIRECTORY = path.dirname(require.resolve("foliate-js/pdf.js"))
const FOLIATE_PDF_VENDOR_DIRECTORY = path.join(FOLIATE_PACKAGE_DIRECTORY, "vendor", "pdfjs")

function toOutputPath(...segments: readonly string[]) {
  return segments.join("/")
}

function readDirectoryAssets(
  sourceDirectory: string,
  outputDirectory: string,
): Array<{ fileName: string; source: Uint8Array }> {
  const assets: Array<{ fileName: string; source: Uint8Array }> = []

  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDirectory, entry.name)
    const outputPath = toOutputPath(outputDirectory, entry.name)

    if (entry.isDirectory()) {
      assets.push(...readDirectoryAssets(sourcePath, outputPath))
      continue
    }

    if (!entry.isFile()) continue

    assets.push({
      fileName: outputPath,
      source: readFileSync(sourcePath),
    })
  }

  return assets
}

function readFoliatePdfRuntimeAssets() {
  const runtimeFiles = FOLIATE_PDF_RUNTIME_FILE_NAMES.map((fileName) => ({
    fileName: toOutputPath(FOLIATE_PDF_OUTPUT_DIRECTORY, fileName),
    source: readFileSync(path.join(FOLIATE_PDF_VENDOR_DIRECTORY, fileName)),
  }))

  const runtimeDirectories = FOLIATE_PDF_RUNTIME_DIRECTORY_NAMES.flatMap((directoryName) =>
    readDirectoryAssets(
      path.join(FOLIATE_PDF_VENDOR_DIRECTORY, directoryName),
      toOutputPath(FOLIATE_PDF_OUTPUT_DIRECTORY, directoryName),
    ),
  )

  return [...runtimeFiles, ...runtimeDirectories]
}

export const createFoliatePdfVitePlugin = (): PluginOption => ({
  name: "buddy-foliate-pdf-vite-plugin",
  enforce: "pre",
  generateBundle() {
    for (const asset of readFoliatePdfRuntimeAssets()) {
      this.emitFile({
        type: "asset",
        fileName: asset.fileName,
        source: asset.source,
      })
    }
  },
  transform(code, id) {
    if (id.includes(FOLIATE_PDF_MODULE_SEGMENT) && code.includes(FOLIATE_PDF_URL_EXPRESSION)) {
      return code.replace(FOLIATE_PDF_URL_EXPRESSION, VITE_COMPATIBLE_PDF_URL_EXPRESSION)
    }

    if (FOLIATE_PDF_BUNDLE_SEGMENTS.some((segment) => id.includes(segment))) {
      if (code.includes("ensureGetOrInsertComputed(Map)")) {
        return null
      }
      return `${MAP_GET_OR_INSERT_COMPUTED_POLYFILL}\n${code}`
    }

    if (
      id.includes(FOLIATE_PAGINATOR_MODULE_SEGMENT) &&
      code.includes(FOLIATE_PAGINATOR_BACKGROUND_SNIPPET)
    ) {
      return code.replace(
        FOLIATE_PAGINATOR_BACKGROUND_SNIPPET,
        SAFE_FOLIATE_PAGINATOR_BACKGROUND_SNIPPET,
      )
    }

    return null
  },
})
