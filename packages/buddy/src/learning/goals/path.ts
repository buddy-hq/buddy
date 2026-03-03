import path from "node:path"

export namespace GoalsV1Path {
  export function directory(rootDirectory: string) {
    return path.join(rootDirectory, ".buddy")
  }

  export function file(rootDirectory: string) {
    return path.join(directory(rootDirectory), "goals.v1.json")
  }

  export function tempFile(rootDirectory: string) {
    return path.join(directory(rootDirectory), "goals.v1.json.tmp")
  }
}

