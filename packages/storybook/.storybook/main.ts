import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import type { StorybookConfig } from "@storybook/react-vite"

const here = path.dirname(fileURLToPath(import.meta.url))
const ui = path.resolve(here, "../../ui")
const uiSrc = path.resolve(ui, "src")

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  addons: ["@storybook/addon-a11y"],
  stories: ["../../ui/src/components/ui/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  async viteFinal(config) {
    const { mergeConfig, searchForWorkspaceRoot } = await import("vite")
    return mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
        alias: [{ find: "@", replacement: uiSrc }],
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
          allow: [searchForWorkspaceRoot(process.cwd()), ui, uiSrc],
        },
      },
    })
  },
}

export default config
