import path from "node:path"

export namespace CurriculumPath {
  export function directory(rootDirectory: string) {
    return path.join(rootDirectory, ".buddy")
  }

  export function file(rootDirectory: string) {
    return path.join(directory(rootDirectory), "curriculum.md")
  }
}
