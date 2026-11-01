declare const BUDDY_COMPILED_BACKEND: boolean | undefined

function readCompiledBackend(): boolean {
  try {
    return BUDDY_COMPILED_BACKEND === true
  } catch {
    return false
  }
}

export const isCompiledBackend = readCompiledBackend()

export function compiledWorkerPath(filename: string, importerURL: string): string {
  const { pathname } = new URL(`./${filename}`, importerURL)
  return decodeURIComponent(pathname).replace(/^\/([A-Za-z]:)/u, "$1")
}
