import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import type { StorybookConfig } from "@storybook/react-vite"

const here = path.dirname(fileURLToPath(import.meta.url))
const ui = path.resolve(here, "../../ui")
const uiSrc = path.resolve(ui, "src")
const web = path.resolve(here, "../../web")
const webSrc = path.resolve(web, "src")

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  addons: ["@storybook/addon-a11y"],
  stories: [
    "../../ui/src/components/ui/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../../web/src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  async viteFinal(config) {
    const { mergeConfig, searchForWorkspaceRoot } = await import("vite")
    return mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
        alias: [
          { find: "@buddy/ui/styles", replacement: path.resolve(uiSrc, "index.css") },
          { find: "@buddy/ui", replacement: uiSrc },
          { find: "@", replacement: webSrc },
        ],
      },
      optimizeDeps: {
        include: [
          "react",
          "react-dom",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "react-dom/client",
        ],
      },
      worker: {
        format: "es",
      },
      server: {
        fs: {
          allow: [searchForWorkspaceRoot(process.cwd()), ui, uiSrc, web, webSrc],
        },
      },
    })
  },
}

export default config
