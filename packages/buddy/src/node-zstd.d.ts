declare module "node:zlib" {
  import type { Transform } from "node:stream"

  export function createZstdDecompress(): Transform
  export function zstdDecompressSync(buffer: Uint8Array): Buffer
}
