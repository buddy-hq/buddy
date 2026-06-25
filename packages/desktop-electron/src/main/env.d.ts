interface ImportMetaEnv {
  readonly BUDDY_CHANNEL?: "dev" | "beta" | "prod"
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:buddy-server" {
  type Listener = {
    stop: (close?: boolean) => Promise<void>
  }

  export function listen(config: { hostname: string; port: number }): Listener | Promise<Listener>
}
