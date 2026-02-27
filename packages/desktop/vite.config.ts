import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  clearScreen: false,
  esbuild: {
    keepNames: true,
  },
  resolve: {
    alias: [
      {
        find: /^@\/lib\//,
        replacement: `${path.resolve(__dirname, "../ui/src/lib")}/`,
      },
      {
        find: /^@\/components\/ui\//,
        replacement: `${path.resolve(__dirname, "../ui/src/components/ui")}/`,
      },
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
