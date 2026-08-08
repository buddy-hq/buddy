import { readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import type { PluginOption } from "vite"

const PDFJS_VIRTUAL_RUNTIME_MODULE_ID = "virtual:buddy-pdfjs-runtime"
const PDFJS_RESOLVED_VIRTUAL_RUNTIME_MODULE_ID = `\0${PDFJS_VIRTUAL_RUNTIME_MODULE_ID}`
const PDFJS_OUTPUT_DIRECTORY = "assets/pdfjs"
const PDFJS_REQUEST_PREFIX = `/${PDFJS_OUTPUT_DIRECTORY}/`
const PDFJS_WORKER_FILE_NAME = "pdf.worker.min.mjs"
const PDFJS_OUTPUT_WORKER_PATH = `${PDFJS_OUTPUT_DIRECTORY}/${PDFJS_WORKER_FILE_NAME}`
const PDFJS_RUNTIME_DIRECTORY_NAMES = [
  "cmaps",
  "standard_fonts",
  "wasm",
  "iccs",
] as const
const PDFJS_IMAGE_DIRECTORY_NAME = "images"
const PDFJS_VIEWER_SCOPE_SELECTOR = ".buddy-pdfjs-scope"
const PDFJS_VIEWER_CONTAINER_HEIGHT_DECLARATION = "--viewer-container-height:0;"
const PDFJS_POLYFILL_MARKER = "/* buddy-pdfjs-get-or-insert-computed */"
const PDFJS_JAVASCRIPT_MODULE_SUFFIXES = [
  "/pdfjs-dist/build/pdf.mjs",
  "/pdfjs-dist/web/pdf_viewer.mjs",
] as const
const PDFJS_VIEWER_STYLESHEET_SUFFIX = "/pdfjs-dist/web/pdf_viewer.css"
const JAVASCRIPT_CONTENT_TYPE = "text/javascript; charset=utf-8"
const JSON_CONTENT_TYPE = "application/json; charset=utf-8"
const SVG_CONTENT_TYPE = "image/svg+xml"
const GIF_CONTENT_TYPE = "image/gif"
const TRUE_TYPE_FONT_CONTENT_TYPE = "font/ttf"
const WASM_CONTENT_TYPE = "application/wasm"
const BINARY_CONTENT_TYPE = "application/octet-stream"
const MAP_GET_OR_INSERT_COMPUTED_POLYFILL = `${PDFJS_POLYFILL_MARKER}
const ensureBuddyPdfJsGetOrInsertComputed = Ctor => {
  if (typeof Ctor !== "function") return
  const { prototype } = Ctor
  if (typeof prototype.getOrInsertComputed === "function") return
  Object.defineProperty(prototype, "getOrInsertComputed", {
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
ensureBuddyPdfJsGetOrInsertComputed(Map)
ensureBuddyPdfJsGetOrInsertComputed(WeakMap)
`

type PdfJsRuntimeAsset = {
  fileName: string
  source: string | Uint8Array
}

const require = createRequire(import.meta.url)
const PDFJS_PACKAGE_DIRECTORY = path.dirname(require.resolve("pdfjs-dist/package.json"))
const PDFJS_WORKER_PATH = path.join(
  PDFJS_PACKAGE_DIRECTORY,
  "build",
  PDFJS_WORKER_FILE_NAME,
)

function toOutputPath(...segments: readonly string[]): string {
  return segments.join("/")
}

function normalizedModuleId(id: string): string {
  return id.split("?", 1)[0]?.replaceAll("\\", "/") ?? id.replaceAll("\\", "/")
}

export function prependPdfJsRuntimePolyfill(source: string): string {
  if (source.includes(PDFJS_POLYFILL_MARKER)) return source
  return `${MAP_GET_OR_INSERT_COMPUTED_POLYFILL}\n${source}`
}

export function scopePdfJsViewerCss(source: string): string {
  const scopedSource = source
    .replaceAll(":root", ":scope")
    // PDFViewer updates this variable on documentElement. Leaving the local
    // fallback in place would hide the inherited live value inside the scope.
    .replace(PDFJS_VIEWER_CONTAINER_HEIGHT_DECLARATION, "")
  return `@scope (${PDFJS_VIEWER_SCOPE_SELECTOR}) {\n${scopedSource}\n}\n`
}

function readDirectoryAssets(
  sourceDirectory: string,
  outputDirectory: string,
): PdfJsRuntimeAsset[] {
  const assets: PdfJsRuntimeAsset[] = []

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

function readPdfJsWorkerSource(): string {
  return prependPdfJsRuntimePolyfill(readFileSync(PDFJS_WORKER_PATH, "utf8"))
}

function readPdfJsRuntimeAssets(): PdfJsRuntimeAsset[] {
  const worker: PdfJsRuntimeAsset = {
    fileName: PDFJS_OUTPUT_WORKER_PATH,
    source: readPdfJsWorkerSource(),
  }
  const runtimeDirectories = PDFJS_RUNTIME_DIRECTORY_NAMES.flatMap((directoryName) =>
    readDirectoryAssets(
      path.join(PDFJS_PACKAGE_DIRECTORY, directoryName),
      toOutputPath(PDFJS_OUTPUT_DIRECTORY, directoryName),
    ),
  )
  const images = readDirectoryAssets(
    path.join(PDFJS_PACKAGE_DIRECTORY, "web", PDFJS_IMAGE_DIRECTORY_NAME),
    toOutputPath(PDFJS_OUTPUT_DIRECTORY, PDFJS_IMAGE_DIRECTORY_NAME),
  )

  return [worker, ...runtimeDirectories, ...images]
}

function resolveRuntimeSourcePath(relativePath: string): string | undefined {
  if (relativePath === PDFJS_WORKER_FILE_NAME) return PDFJS_WORKER_PATH

  const [directoryName, ...remainingSegments] = relativePath.split("/")
  if (!directoryName || remainingSegments.length === 0) return undefined

  const sourceRoot =
    directoryName === PDFJS_IMAGE_DIRECTORY_NAME
      ? path.join(PDFJS_PACKAGE_DIRECTORY, "web", PDFJS_IMAGE_DIRECTORY_NAME)
      : PDFJS_RUNTIME_DIRECTORY_NAMES.some((candidate) => candidate === directoryName)
        ? path.join(PDFJS_PACKAGE_DIRECTORY, directoryName)
        : undefined
  if (!sourceRoot) return undefined

  const sourcePath = path.resolve(sourceRoot, ...remainingSegments)
  const sourceRootPrefix = `${path.resolve(sourceRoot)}${path.sep}`
  return sourcePath.startsWith(sourceRootPrefix) ? sourcePath : undefined
}

function contentTypeForPath(filePath: string): string {
  if (filePath.endsWith(".mjs") || filePath.endsWith(".js")) {
    return JAVASCRIPT_CONTENT_TYPE
  }
  if (filePath.endsWith(".json")) return JSON_CONTENT_TYPE
  if (filePath.endsWith(".svg")) return SVG_CONTENT_TYPE
  if (filePath.endsWith(".gif")) return GIF_CONTENT_TYPE
  if (filePath.endsWith(".ttf")) return TRUE_TYPE_FONT_CONTENT_TYPE
  if (filePath.endsWith(".wasm")) return WASM_CONTENT_TYPE
  return BINARY_CONTENT_TYPE
}

function developmentRuntimeModuleSource(): string {
  return `const pdfJsRuntimeBaseUrl = new URL(${JSON.stringify(PDFJS_REQUEST_PREFIX)}, globalThis.location.href).toString()
const pdfJsWorkerSrc = new URL(${JSON.stringify(PDFJS_WORKER_FILE_NAME)}, pdfJsRuntimeBaseUrl).toString()
export { pdfJsRuntimeBaseUrl, pdfJsWorkerSrc }
`
}

function buildRuntimeModuleSource(workerReferenceId: string): string {
  return `const pdfJsWorkerSrc = import.meta.ROLLUP_FILE_URL_${workerReferenceId}
const pdfJsRuntimeBaseUrl = new URL(".", pdfJsWorkerSrc).toString()
export { pdfJsRuntimeBaseUrl, pdfJsWorkerSrc }
`
}

function isPdfJsJavaScriptModule(id: string): boolean {
  return PDFJS_JAVASCRIPT_MODULE_SUFFIXES.some((suffix) => id.endsWith(suffix))
}

export const createPdfJsVitePlugin = (): PluginOption => {
  let isBuild = false
  let workerReferenceId: string | undefined

  return {
    name: "buddy-pdfjs-vite-plugin",
    enforce: "pre",
    configResolved(config) {
      isBuild = config.command === "build"
    },
    buildStart() {
      if (!isBuild) return
      workerReferenceId = undefined
      for (const asset of readPdfJsRuntimeAssets()) {
        const referenceId = this.emitFile({
          type: "asset",
          fileName: asset.fileName,
          source: asset.source,
        })
        if (asset.fileName === PDFJS_OUTPUT_WORKER_PATH) {
          workerReferenceId = referenceId
        }
      }
    },
    resolveId(source) {
      if (source === PDFJS_VIRTUAL_RUNTIME_MODULE_ID) {
        return PDFJS_RESOLVED_VIRTUAL_RUNTIME_MODULE_ID
      }
      return null
    },
    load(id) {
      if (id !== PDFJS_RESOLVED_VIRTUAL_RUNTIME_MODULE_ID) return null
      if (!isBuild) return developmentRuntimeModuleSource()
      if (!workerReferenceId) {
        throw new Error("PDF.js worker asset was not registered before runtime module loading")
      }
      return buildRuntimeModuleSource(workerReferenceId)
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = request.url
        if (!requestUrl) {
          next()
          return
        }

        const pathname = new URL(requestUrl, "http://buddy.local").pathname
        if (!pathname.startsWith(PDFJS_REQUEST_PREFIX)) {
          next()
          return
        }

        const relativePath = decodeURIComponent(pathname.slice(PDFJS_REQUEST_PREFIX.length))
        const sourcePath = resolveRuntimeSourcePath(relativePath)
        if (!sourcePath) {
          response.statusCode = 404
          response.end()
          return
        }

        try {
          response.statusCode = 200
          response.setHeader("Content-Type", contentTypeForPath(sourcePath))
          response.end(
            relativePath === PDFJS_WORKER_FILE_NAME
              ? readPdfJsWorkerSource()
              : readFileSync(sourcePath),
          )
        } catch {
          response.statusCode = 404
          response.end()
        }
      })
    },
    transform(source, id) {
      const normalizedId = normalizedModuleId(id)
      if (isPdfJsJavaScriptModule(normalizedId)) {
        return prependPdfJsRuntimePolyfill(source)
      }
      if (normalizedId.endsWith(PDFJS_VIEWER_STYLESHEET_SUFFIX)) {
        return scopePdfJsViewerCss(source)
      }
      return null
    },
  }
}
