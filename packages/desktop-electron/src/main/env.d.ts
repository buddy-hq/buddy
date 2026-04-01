interface ImportMetaEnv {
  readonly BUDDY_CHANNEL?: "dev" | "beta" | "prod"
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
