/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BUDDY_CHANNEL?: "dev" | "beta" | "prod"
}

declare module "@buddy/ui/styles"
