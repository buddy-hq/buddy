import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { createFoliatePdfVitePlugin } from "../web/scripts/create-foliate-pdf-vite-plugin"

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [createFoliatePdfVitePlugin(), react(), tailwindcss()],
  clearScreen: false,
  esbuild: {
    keepNames: true,
  },
  optimizeDeps: {
    exclude: ["foliate-js/view.js", "foliate-js/pdf.js", "foliate-js/vendor/pdfjs/pdf.mjs"],
  },
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "../web/src"),
      },
    ],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
})
