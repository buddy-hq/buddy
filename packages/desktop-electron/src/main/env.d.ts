interface ImportMetaEnv {
  readonly BUDDY_CHANNEL?: "dev" | "beta" | "prod"
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "node:http" {
  export function setGlobalProxyFromEnv(): void
}

declare module "node:tls" {
  export function getCACertificates(type: "default" | "system"): string[]
  export function setDefaultCACertificates(certificates: string[]): void
}

declare module "virtual:buddy-server" {
  type Listener = {
    stop: (close?: boolean) => Promise<void>
  }

  export function listen(config: { hostname: string; port: number }): Listener | Promise<Listener>
}
