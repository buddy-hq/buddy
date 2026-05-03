import path from "node:path"
import { BUDDY_HOME_DIRECTORY_NAME, Global } from "../../../storage"
import { learnerMemoryLabRootOverride } from "./lab-context"
import { LEARNER_MEMORY_FILE_TUNING } from "./tuning"

function learnerMemoryRoot(_directory: string): string {
  const labRootOverride = learnerMemoryLabRootOverride()
  if (labRootOverride) {
    return labRootOverride
  }
  return path.join(
    Global.Path.home,
    BUDDY_HOME_DIRECTORY_NAME,
    LEARNER_MEMORY_FILE_TUNING.rootDirectoryName,
  )
}

function memoriesDirectory(directory: string): string {
  return path.join(
    learnerMemoryRoot(directory),
    LEARNER_MEMORY_FILE_TUNING.legacyMemoriesDirectoryName,
  )
}

function eventsDirectory(directory: string): string {
  return path.join(learnerMemoryRoot(directory), LEARNER_MEMORY_FILE_TUNING.eventsDirectoryName)
}

function evidenceDirectory(directory: string): string {
  return path.join(learnerMemoryRoot(directory), LEARNER_MEMORY_FILE_TUNING.evidenceDirectoryName)
}

function reportsDirectory(directory: string): string {
  return path.join(learnerMemoryRoot(directory), LEARNER_MEMORY_FILE_TUNING.reportsDirectoryName)
}

function sessionSummariesDirectory(directory: string): string {
  return path.join(
    learnerMemoryRoot(directory),
    LEARNER_MEMORY_FILE_TUNING.sessionSummariesDirectoryName,
  )
}

function stageOneOutputsDirectory(directory: string): string {
  return path.join(
    learnerMemoryRoot(directory),
    LEARNER_MEMORY_FILE_TUNING.stageOneOutputsDirectoryName,
  )
}

function rolloutSummariesDirectory(directory: string): string {
  return path.join(
    learnerMemoryRoot(directory),
    LEARNER_MEMORY_FILE_TUNING.rolloutSummariesDirectoryName,
  )
}

function memoryFile(directory: string, memoryId: string): string {
  return path.join(
    memoriesDirectory(directory),
    `${memoryId}${LEARNER_MEMORY_FILE_TUNING.jsonFileExtension}`,
  )
}

function eventFile(directory: string, yearMonth: string): string {
  return path.join(
    eventsDirectory(directory),
    `${yearMonth}${LEARNER_MEMORY_FILE_TUNING.jsonlFileExtension}`,
  )
}

function evidenceFile(directory: string, eventId: string): string {
  return path.join(
    evidenceDirectory(directory),
    `${eventId}${LEARNER_MEMORY_FILE_TUNING.jsonFileExtension}`,
  )
}

function summaryFile(directory: string): string {
  return path.join(learnerMemoryRoot(directory), LEARNER_MEMORY_FILE_TUNING.summaryFileName)
}

function memoryRegistryFile(directory: string): string {
  return path.join(learnerMemoryRoot(directory), LEARNER_MEMORY_FILE_TUNING.memoryRegistryFileName)
}

function workingMemoryFile(directory: string): string {
  return path.join(learnerMemoryRoot(directory), LEARNER_MEMORY_FILE_TUNING.workingMemoryFileName)
}

function workingSummaryFile(directory: string): string {
  return path.join(learnerMemoryRoot(directory), LEARNER_MEMORY_FILE_TUNING.workingSummaryFileName)
}

function candidatePatchesFile(directory: string): string {
  return path.join(
    learnerMemoryRoot(directory),
    LEARNER_MEMORY_FILE_TUNING.candidatePatchesFileName,
  )
}

function evaluationReportFile(directory: string): string {
  return path.join(reportsDirectory(directory), LEARNER_MEMORY_FILE_TUNING.evaluationReportFileName)
}

function sessionSummaryMarkdownFile(directory: string, sessionID: string): string {
  return path.join(
    sessionSummariesDirectory(directory),
    `${sessionID}${LEARNER_MEMORY_FILE_TUNING.markdownFileExtension}`,
  )
}

function sessionSummaryJsonFile(directory: string, sessionID: string): string {
  return path.join(
    sessionSummariesDirectory(directory),
    `${sessionID}${LEARNER_MEMORY_FILE_TUNING.jsonFileExtension}`,
  )
}

function stageOneOutputFile(directory: string, sessionID: string): string {
  return path.join(
    stageOneOutputsDirectory(directory),
    `${sessionID}${LEARNER_MEMORY_FILE_TUNING.jsonFileExtension}`,
  )
}

function rolloutSummaryFile(directory: string, sessionID: string): string {
  return path.join(
    rolloutSummariesDirectory(directory),
    `${sessionID}${LEARNER_MEMORY_FILE_TUNING.markdownFileExtension}`,
  )
}

function rawMemoriesFile(directory: string): string {
  return path.join(learnerMemoryRoot(directory), LEARNER_MEMORY_FILE_TUNING.rawMemoriesFileName)
}

function indexFile(directory: string): string {
  return path.join(learnerMemoryRoot(directory), LEARNER_MEMORY_FILE_TUNING.indexFileName)
}

function jobLedgerFile(directory: string): string {
  return path.join(learnerMemoryRoot(directory), LEARNER_MEMORY_FILE_TUNING.jobLedgerFileName)
}

export const LearnerMemoryPath = {
  root: learnerMemoryRoot,
  memoriesDirectory,
  eventsDirectory,
  evidenceDirectory,
  reportsDirectory,
  sessionSummariesDirectory,
  stageOneOutputsDirectory,
  rolloutSummariesDirectory,
  memoryFile,
  eventFile,
  evidenceFile,
  summaryFile,
  memoryRegistryFile,
  workingMemoryFile,
  workingSummaryFile,
  candidatePatchesFile,
  evaluationReportFile,
  sessionSummaryMarkdownFile,
  sessionSummaryJsonFile,
  stageOneOutputFile,
  rolloutSummaryFile,
  rawMemoriesFile,
  indexFile,
  jobLedgerFile,
}
