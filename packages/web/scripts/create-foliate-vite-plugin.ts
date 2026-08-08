import type { PluginOption } from "vite"

const FOLIATE_VIEW_MODULE_SEGMENT = "/node_modules/foliate-js/view.js"
const FOLIATE_PAGINATOR_MODULE_SEGMENT = "/node_modules/foliate-js/paginator.js"
const FOLIATE_PDF_FALLBACK_IMPORT = "import('./pdf.js')"
const FOLIATE_PDF_FALLBACK_SNIPPET = `else if (await isPDF(file)) {
        const { makePDF } = await import('./pdf.js')
        book = await makePDF(file)
    }`
const BUDDY_PDF_ROUTING_SNIPPET = `else if (await isPDF(file)) {
        throw new UnsupportedTypeError('PDF input must be opened with the Buddy PDF reader')
    }`
const FOLIATE_PAGINATOR_BACKGROUND_SNIPPET = `requestAnimationFrame(() =>
            this.#background.style.background = getBackground(this.#view.document))`
const SAFE_FOLIATE_PAGINATOR_BACKGROUND_SNIPPET = `requestAnimationFrame(() => {
            const doc = this.#view?.document
            if (!doc) return
            this.#background.style.background = getBackground(doc)
        })`

export function disableFoliatePdfFallback(source: string): string {
  return source.replace(FOLIATE_PDF_FALLBACK_SNIPPET, BUDDY_PDF_ROUTING_SNIPPET)
}

export const createFoliateVitePlugin = (): PluginOption => ({
  name: "buddy-foliate-vite-plugin",
  enforce: "pre",
  transform(code, id) {
    if (id.includes(FOLIATE_VIEW_MODULE_SEGMENT)) {
      const transformed = disableFoliatePdfFallback(code)
      if (transformed.includes(FOLIATE_PDF_FALLBACK_IMPORT)) {
        throw new Error("Foliate's PDF fallback could not be disabled")
      }
      return transformed === code ? null : transformed
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
