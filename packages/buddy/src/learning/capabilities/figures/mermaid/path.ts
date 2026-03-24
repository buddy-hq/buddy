import path from "node:path"

class InvalidMermaidArtifactIDError extends Error {
  constructor(artifactID: string) {
    super(`Invalid Mermaid artifact id '${artifactID}'.`)
    this.name = "InvalidMermaidArtifactIDError"
  }
}

function root(directory: string): string {
  return path.join(directory, ".buddy", "mermaid-artifacts")
}

function sanitizeArtifactID(artifactID: string): string {
  if (!/^[a-f0-9]{64}$/u.test(artifactID)) {
    throw new InvalidMermaidArtifactIDError(artifactID)
  }

  return artifactID
}

function artifactDirectory(directory: string, artifactID: string): string {
  return path.join(root(directory), sanitizeArtifactID(artifactID))
}

function manifestFile(directory: string, artifactID: string): string {
  return path.join(artifactDirectory(directory, artifactID), "manifest.json")
}

function diagramFile(directory: string, artifactID: string): string {
  return path.join(artifactDirectory(directory, artifactID), "diagram.mmd")
}

const MermaidArtifactPath = {
  root,
  sanitizeArtifactID,
  artifactDirectory,
  manifestFile,
  diagramFile,
}

export { InvalidMermaidArtifactIDError, MermaidArtifactPath }
