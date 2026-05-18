declare module "mime-types" {
  export function lookup(path: string): string | false
}

declare module "@silvia-odwyer/photon-node/photon_rs_bg.wasm" {
  const wasmPath: string
  export default wasmPath
}

declare module "*.md" {
  const content: string
  export default content
}
