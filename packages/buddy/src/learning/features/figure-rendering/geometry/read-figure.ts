import {
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  readArtifactTextFile,
} from "../../../../artifacts"

async function readGeometryFigure(directory: string, artifactID: string): Promise<string> {
  return readArtifactTextFile({
    directory,
    kind: ARTIFACT_KINDS.figure,
    artifactID,
    relativePath: ARTIFACT_CONTENT_FILES.figureSvg,
  })
}

export { readGeometryFigure }
