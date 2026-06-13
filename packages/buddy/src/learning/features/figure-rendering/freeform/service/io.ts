import {
  ARTIFACT_KINDS,
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_MANIFEST_VERSION,
  readArtifactTextFile,
  writeArtifactRecord,
} from "../../../../../artifacts"
import { FreeformFigureArtifactManifestSchema } from "../types"

async function writeFreeformFigure(input: {
  directory: string,
  artifactID: string,
  svg: string,
  sourceHash: string,
  alt: string,
  caption?: string,
}): Promise<void> {
  const now = new Date().toISOString()
  const manifest = FreeformFigureArtifactManifestSchema.parse({
    version: ARTIFACT_MANIFEST_VERSION,
    artifactID: input.artifactID,
    kind: ARTIFACT_KINDS.freeformFigure,
    title: input.alt,
    ...(input.caption ? { description: input.caption } : {}),
    createdAt: now,
    updatedAt: now,
    sourceHash: input.sourceHash,
    summary: {
      mime: "image/svg+xml",
      alt: input.alt,
      ...(input.caption ? { caption: input.caption } : {}),
      repairAttempts: 0,
    },
  })
  await writeArtifactRecord({
    directory: input.directory,
    kind: ARTIFACT_KINDS.freeformFigure,
    artifactID: input.artifactID,
    manifest,
    files: [
      {
        relativePath: ARTIFACT_CONTENT_FILES.figureSvg,
        format: "text",
        content: input.svg,
      },
    ],
  })
}

async function readFreeformFigure(directory: string, artifactID: string): Promise<string> {
  return readArtifactTextFile({
    directory,
    kind: ARTIFACT_KINDS.freeformFigure,
    artifactID,
    relativePath: ARTIFACT_CONTENT_FILES.figureSvg,
  })
}

export { readFreeformFigure, writeFreeformFigure }
