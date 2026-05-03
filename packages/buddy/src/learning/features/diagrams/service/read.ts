import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import { MermaidArtifactPath } from "./path"
import { MermaidArtifactManifestSchema } from "./types"
import { MermaidArtifactNotFoundError } from "../errors"

type MermaidArtifactReadResult = {
  artifactID: string
  kind: "mermaid.v1"
  diagramType: string
  alt: string
  caption?: string
  repairAttempts: number
  repairLog: string[]
  source: string
  createdAt: string
}

type MermaidArtifactListResult = MermaidArtifactReadResult[]

async function readMermaidArtifact(
  directory: string,
  artifactID: string,
): Promise<MermaidArtifactReadResult> {
  const safeArtifactID = MermaidArtifactPath.sanitizeArtifactID(artifactID)

  try {
    const [manifestText, source] = await Promise.all([
      fs.readFile(MermaidArtifactPath.manifestFile(directory, safeArtifactID), "utf8"),
      fs.readFile(MermaidArtifactPath.diagramFile(directory, safeArtifactID), "utf8"),
    ])

    const parsedManifest = MermaidArtifactManifestSchema.parse(JSON.parse(manifestText) as unknown)

    return {
      artifactID: parsedManifest.artifactID,
      kind: parsedManifest.kind,
      diagramType: parsedManifest.diagramType,
      alt: parsedManifest.alt,
      ...(parsedManifest.caption ? { caption: parsedManifest.caption } : {}),
      repairAttempts: parsedManifest.repairAttempts,
      repairLog: [...parsedManifest.repairLog],
      source,
      createdAt: parsedManifest.createdAt,
    }
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new MermaidArtifactNotFoundError(safeArtifactID)
    }
    throw error
  }
}

async function listMermaidArtifacts(directory: string): Promise<MermaidArtifactListResult> {
  let entries: Dirent[] = []

  try {
    entries = await fs.readdir(MermaidArtifactPath.root(directory), {
      withFileTypes: true,
    })
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      return []
    }
    throw error
  }

  const artifacts = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await readMermaidArtifact(directory, entry.name)
        } catch {
          return undefined
        }
      }),
  )

  return artifacts
    .filter((artifact): artifact is MermaidArtifactReadResult => artifact !== undefined)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export { readMermaidArtifact, listMermaidArtifacts }
