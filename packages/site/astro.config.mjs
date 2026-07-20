import cloudflare from "@astrojs/cloudflare"
import sitemap from "@astrojs/sitemap"
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import fs from "node:fs"
import path from "node:path"

function rawFonts(extensions) {
  return {
    name: "vite-plugin-raw-fonts",
    enforce: "pre",
    resolveId(id, importer) {
      if (extensions.some((ext) => id.includes(ext))) {
        if (id.startsWith(".")) {
          return path.resolve(path.dirname(importer), id)
        }
        return id
      }
    },
    load(id) {
      if (extensions.some((ext) => id.includes(ext))) {
        const buffer = fs.readFileSync(id)
        return `export default new Uint8Array([${Array.from(buffer).join(",")}]);`
      }
    },
  }
}

const NON_INDEXED_ROUTE_PREFIXES = ["/layouts/", "/mock/", "/404"]

function isPublicSitemapPage(page) {
  const pathname = new URL(page).pathname
  return !NON_INDEXED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/** Old competitor-only slugs → comparison-friendly buddy-vs-* URLs */
const COMPARE_SLUG_REDIRECTS = Object.fromEntries(
  [
    "chatgpt",
    "notebooklm",
    "magicschool",
    "diffit",
    "knowt",
    "claude-teachers",
    "khanmigo",
    "quizlet",
    "remnote",
  ].map((slug) => [`/compare/${slug}`, `/compare/buddy-vs-${slug}/`]),
)

export default defineConfig({
  site: "https://hibuddy.in",
  output: "server",
  prefetch: false,
  adapter: cloudflare({ imageService: "compile" }),
  redirects: COMPARE_SLUG_REDIRECTS,
  vite: {
    plugins: [rawFonts([".otf", ".ttf"])],
    assetsInclude: ["**/*.wasm"],
    assetsExclude: ["**/*.otf", "**/*.ttf"],
    ssr: {
      external: ["buffer", "path", "fs"].map((i) => `node:${i}`),
    },
  },
  integrations: [
    starlight({
      title: "Buddy",
      disable404Route: true,
      sidebar: [
        {
          label: "Documentation",
          items: [{ label: "Introduction", slug: "docs" }],
        },
      ],
    }),
    sitemap({ filter: isPublicSitemapPage }),
  ],
})
