/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BUDDY_CHANNEL?: "dev" | "beta" | "prod"
  readonly VITE_BUDDY_DEV_REPOSITORY_ROOT?: string
}

declare module "@buddy/ui/styles"
