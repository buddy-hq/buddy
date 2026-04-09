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

export const createFoliatePdfVitePlugin = (): PluginOption => ({
  name: "buddy-foliate-pdf-vite-plugin",
  enforce: "pre",
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
