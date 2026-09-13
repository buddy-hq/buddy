import path from "node:path"

/** Lexically checks containment. Resolve real paths separately when symlinks are relevant. */
export function isPathInsideDirectory(parentDirectory: string, candidatePath: string): boolean {
  const relative = path.relative(parentDirectory, candidatePath)
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
}
