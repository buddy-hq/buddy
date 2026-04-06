declare module "node:zlib" {
  export function zstdDecompressSync(buffer: Uint8Array): Buffer
}
