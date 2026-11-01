declare const BUDDY_COMPILED_BACKEND: boolean | undefined

function readCompiledBackend(): boolean {
  try {
    return BUDDY_COMPILED_BACKEND === true
  } catch {
    return false
  }
}

export const isCompiledBackend = readCompiledBackend()
