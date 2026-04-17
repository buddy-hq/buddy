import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import buddyWebVitePlugin from "./vite.ts"

// https://vitejs.dev/config/
export default defineConfig(() => {
  const backendUrl = process.env.VITE_BUDDY_BACKEND_URL?.trim() || "http://localhost:3000"
  const webPort = Number(process.env.VITE_BUDDY_WEB_PORT ?? "1420")

  return {
    plugins: [...buddyWebVitePlugin(), tanstackRouter(), react(), tailwindcss()],
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
