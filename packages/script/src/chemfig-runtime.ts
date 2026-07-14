export const CHEMFIG_RUNTIME_DIRECTORY_NAME = "chemfig-runtime" as const
export const ELECTRON_CHEMFIG_RUNTIME_PATH_SEGMENTS = [
  "chunks",
  CHEMFIG_RUNTIME_DIRECTORY_NAME,
] as const
export const CHEMFIG_CHILD_FILENAME = "chemfig-child.cjs" as const
export const CHEMFIG_TEX_DIRECTORY_NAME = "tex" as const
export const CHEMFIG_TEX_ASSET_FILENAMES = [
  "core.dump.gz",
  "tex.wasm.gz",
  "tex_files.tar.gz",
] as const
