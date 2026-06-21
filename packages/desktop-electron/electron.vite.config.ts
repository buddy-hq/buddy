import path from "node:path"
import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import buddyWebVitePlugin from "../web/vite"

const webDir = path.resolve(__dirname, "../web")

const channel = (() => {
  const raw = process.env.BUDDY_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

export default defineConfig({
  main: {
    define: {
      "import.meta.env.BUDDY_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: {
          index: "src/main/index.ts",
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: "src/preload/index.ts",
        },
      },
    },
  },
  renderer: {
    plugins: [
      ...buddyWebVitePlugin({ resolveOptimizeDepsFromLinkedWebPackage: true }),
      tanstackRouter({
        target: "react",
        routesDirectory: path.resolve(webDir, "src/routes"),
        generatedRouteTree: path.resolve(webDir, "src/routeTree.gen.ts"),
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
    ],
    root: "src/renderer",
    publicDir: path.resolve(__dirname, "public"),
    build: {
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
          loading: "src/renderer/loading.html",
        },
      },
    },
  },
})
