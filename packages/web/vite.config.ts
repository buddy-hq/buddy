import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"

// https://vitejs.dev/config/
export default defineConfig(() => {
  const backendUrl = process.env.VITE_BUDDY_BACKEND_URL?.trim() || "http://localhost:3000"
  const webPort = Number(process.env.VITE_BUDDY_WEB_PORT ?? "1420")

  return {
    plugins: [TanStackRouterVite(), react(), tailwindcss()],
    resolve: {
      alias: [
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
      ],
    },
    server: {
      port: Number.isFinite(webPort) ? webPort : 1420,
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
