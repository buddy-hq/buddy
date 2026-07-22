import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { parentPort, workerData } from "node:worker_threads"
import { RESOURCE_PACK_UNIT_KIND_SECTION } from "./chunking-config"
import {
  RESOURCE_PACK_STATUS_READY,
  type ResourceExtractionResult,
  type ResourceChunkUnitSeed,
} from "./contracts"
import { extractSpreadsheetResourceInWorker } from "./spreadsheet-parser"
import {
  isSpreadsheetParserWorkerInput,
  spreadsheetParserStagedArtifactFilename,
  SPREADSHEET_PARSER_EXTRACTOR_NAME,
  SPREADSHEET_PARSER_FULL_TEXT_SEPARATOR,
  SPREADSHEET_PARSER_STAGED_ARTIFACTS_DIRECTORY,
  SPREADSHEET_PARSER_STAGED_FULL_TEXT_FILENAME,
  type SpreadsheetParserWorkerChunk,
  type SpreadsheetParserWorkerOutput,
} from "./spreadsheet-parser-worker-protocol"

const input: unknown = workerData
if (!isSpreadsheetParserWorkerInput(input)) {
  throw new Error("Spreadsheet parser worker received invalid input.")
}
if (!parentPort) {
  throw new Error("Spreadsheet parser worker requires a parent message port.")
}

const result = await extractSpreadsheetResourceInWorker(input.sourcePath, input.format)
const output = await stageSpreadsheetExtraction(result, input.outputDirectory)
// oxlint-disable-next-line unicorn(require-post-message-target-origin): Node MessagePort does not accept a target origin.
parentPort.postMessage(output)
parentPort.close()

async function stageSpreadsheetExtraction(
  result: ResourceExtractionResult,
  outputDirectory: string,
): Promise<SpreadsheetParserWorkerOutput> {
  if (result.status !== RESOURCE_PACK_STATUS_READY) {
    throw new Error("Spreadsheet parser produced a non-ready extraction.")
  }
  if (result.extractor !== SPREADSHEET_PARSER_EXTRACTOR_NAME) {
    throw new Error("Spreadsheet parser produced an unexpected extractor name.")
  }

  const chunkUnits = result.chunkUnits ?? []
  const textArtifacts = result.textArtifacts ?? []
  const stagedChunks = stagedChunkDescriptors(result.fullText, chunkUnits)
  const artifactsDirectory = path.join(
    outputDirectory,
    SPREADSHEET_PARSER_STAGED_ARTIFACTS_DIRECTORY,
  )
  await mkdir(artifactsDirectory, { recursive: true })
  await writeFile(
    path.join(outputDirectory, SPREADSHEET_PARSER_STAGED_FULL_TEXT_FILENAME),
    result.fullText,
    "utf8",
  )
  for (const [index, artifact] of textArtifacts.entries()) {
    await writeFile(
      path.join(artifactsDirectory, spreadsheetParserStagedArtifactFilename(index)),
      artifact.content,
      "utf8",
    )
  }

  return {
    status: RESOURCE_PACK_STATUS_READY,
    warnings: result.warnings,
    extractor: SPREADSHEET_PARSER_EXTRACTOR_NAME,
    tocMarkdown: result.tocMarkdown ?? "",
    ...(result.title ? { title: result.title } : {}),
    chunkUnits: stagedChunks,
    textArtifacts: textArtifacts.map((artifact) => ({ relativePath: artifact.relativePath })),
  }
}

function stagedChunkDescriptors(
  fullText: string,
  chunkUnits: ResourceChunkUnitSeed[],
): SpreadsheetParserWorkerChunk[] {
  const chunkTextCharacters = chunkUnits.reduce((total, unit) => total + unit.text.length, 0)
  const workbookIndexCharacters =
    fullText.length -
    chunkTextCharacters -
    chunkUnits.length * SPREADSHEET_PARSER_FULL_TEXT_SEPARATOR.length
  if (workbookIndexCharacters < 0) {
    throw new Error("Spreadsheet parser produced an invalid full-text layout.")
  }

  let cursor = workbookIndexCharacters
  const stagedChunks = chunkUnits.map((unit): SpreadsheetParserWorkerChunk => {
    if (
      unit.unitKind !== RESOURCE_PACK_UNIT_KIND_SECTION ||
      typeof unit.unitTitle !== "string" ||
      typeof unit.unitIndex !== "number"
    ) {
      throw new Error("Spreadsheet parser produced invalid chunk metadata.")
    }
    cursor += SPREADSHEET_PARSER_FULL_TEXT_SEPARATOR.length
    const textStart = cursor
    const textLength = unit.text.length
    cursor += textLength
    if (fullText.slice(textStart, cursor) !== unit.text) {
      throw new Error("Spreadsheet parser chunk text does not match the staged full text.")
    }
    return {
      unitKind: RESOURCE_PACK_UNIT_KIND_SECTION,
      unitTitle: unit.unitTitle,
      unitIndex: unit.unitIndex,
      textStart,
      textLength,
    }
  })
  if (cursor !== fullText.length) {
    throw new Error("Spreadsheet parser did not consume the staged full text.")
  }
  return stagedChunks
}
