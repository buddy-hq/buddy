import cloudflare from "@astrojs/cloudflare"
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"

export default defineConfig({
  output: "server",
  adapter: cloudflare({ imageService: "compile" }),
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
  ],
})
