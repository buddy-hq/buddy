import path from "node:path"
import { MERMAID_ARTIFACT_KIND, MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX } from "./v2-types"

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u
const REPAIR_REQUEST_ID_PATTERN = new RegExp(
  `^${MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX}[A-Za-z0-9_-]+$`,
  "u",
)

class InvalidMermaidArtifactIDError extends Error {
  constructor(artifactID: string) {
    super(`Invalid ${MERMAID_ARTIFACT_KIND} artifact id '${artifactID}'.`)
    this.name = "InvalidMermaidArtifactIDError"
  }
}

class InvalidMermaidRenderKeyError extends Error {
  constructor(renderKey: string) {
    super(`Invalid Mermaid render key '${renderKey}'.`)
    this.name = "InvalidMermaidRenderKeyError"
  }
}

class InvalidMermaidRepairRequestIDError extends Error {
  constructor(repairRequestID: string) {
    super(`Invalid Mermaid repair request id '${repairRequestID}'.`)
    this.name = "InvalidMermaidRepairRequestIDError"
  }
}

function root(directory: string): string {
  return path.join(directory, ".buddy", "mermaid-artifacts-v2")
}

function sanitizeArtifactID(artifactID: string): string {
  if (!SHA256_HEX_PATTERN.test(artifactID)) {
    throw new InvalidMermaidArtifactIDError(artifactID)
  }
  return artifactID
}

function sanitizeRenderKey(renderKey: string): string {
  if (!SHA256_HEX_PATTERN.test(renderKey)) {
    throw new InvalidMermaidRenderKeyError(renderKey)
  }
  return renderKey
}

function sanitizeRepairRequestID(repairRequestID: string): string {
  if (!REPAIR_REQUEST_ID_PATTERN.test(repairRequestID)) {
    throw new InvalidMermaidRepairRequestIDError(repairRequestID)
  }
  return repairRequestID
}

function artifactDirectory(directory: string, artifactID: string): string {
  return path.join(root(directory), sanitizeArtifactID(artifactID))
}

function manifestFile(directory: string, artifactID: string): string {
  return path.join(artifactDirectory(directory, artifactID), "manifest.json")
}

function sourceFile(directory: string, artifactID: string): string {
  return path.join(artifactDirectory(directory, artifactID), "source.mmd")
}

function rendersDirectory(directory: string, artifactID: string): string {
  return path.join(artifactDirectory(directory, artifactID), "renders")
}

function renderRecordFile(directory: string, artifactID: string, renderKey: string): string {
  return path.join(rendersDirectory(directory, artifactID), `${sanitizeRenderKey(renderKey)}.json`)
}

function repairRequestsDirectory(directory: string): string {
  return path.join(root(directory), "_repair-requests")
}

function repairRequestFile(directory: string, repairRequestID: string): string {
  return path.join(
    repairRequestsDirectory(directory),
    `${sanitizeRepairRequestID(repairRequestID)}.json`,
  )
}

const MermaidArtifactPathV2 = {
  artifactDirectory,
  manifestFile,
  renderRecordFile,
  rendersDirectory,
  repairRequestFile,
  repairRequestsDirectory,
  root,
  sanitizeArtifactID,
  sanitizeRenderKey,
  sanitizeRepairRequestID,
  sourceFile,
}

export {
  InvalidMermaidArtifactIDError,
  InvalidMermaidRenderKeyError,
  InvalidMermaidRepairRequestIDError,
  MermaidArtifactPathV2,
}
