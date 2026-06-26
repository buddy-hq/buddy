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

export default defineConfig({
  site: "https://hibuddy.in",
  output: "server",
  adapter: cloudflare({ imageService: "compile" }),
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
      sidebar: [
        {
          label: "Documentation",
          items: [{ label: "Introduction", slug: "docs" }],
        },
      ],
    }),
    sitemap(),
  ],
})
