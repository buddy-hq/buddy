import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { writeJsonFileAtomic, writeTextFileAtomic } from "../../../storage/atomic-file"
import { withLearnerMemoryMutationLock } from "./mutation-lock"
import { LearnerMemoryPath } from "./paths"

const CONSOLIDATION_PUBLICATION_JOURNAL_FILE_NAME = ".consolidation-publication.json"

const ConsolidationPublicationJournalSchema = z.object({
  schemaVersion: z.literal(1),
  registryMarkdown: z.string(),
  summaryMarkdown: z.string(),
})

function consolidationPublicationJournalFile(directory: string): string {
  return path.join(
    LearnerMemoryPath.root(directory),
    CONSOLIDATION_PUBLICATION_JOURNAL_FILE_NAME,
  )
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  )
}

async function readPublicationJournal(
  directory: string,
): Promise<z.infer<typeof ConsolidationPublicationJournalSchema> | undefined> {
  const filePath = consolidationPublicationJournalFile(directory)
  const raw = await fs.readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFileError(error)) return undefined
    throw error
  })
  if (raw === undefined) return undefined
  const parsed: unknown = JSON.parse(raw)
  return ConsolidationPublicationJournalSchema.parse(parsed)
}

async function recoverConsolidationPublicationUnlocked(directory: string): Promise<void> {
  const journal = await readPublicationJournal(directory)
  if (!journal) return

  await writeTextFileAtomic(
    LearnerMemoryPath.memoryRegistryFile(directory),
    journal.registryMarkdown,
  )
  await writeTextFileAtomic(LearnerMemoryPath.summaryFile(directory), journal.summaryMarkdown)
  await fs.rm(consolidationPublicationJournalFile(directory), { force: true })
}

async function withRecoveredConsolidationPublication<T>(
  directory: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withLearnerMemoryMutationLock(directory, async () => {
    await recoverConsolidationPublicationUnlocked(directory)
    return operation()
  })
}

async function publishConsolidationGeneration(input: {
  directory: string
  expectedRegistryMarkdown: string
  expectedSummaryMarkdown: string
  registryMarkdown: string
  summaryMarkdown: string
}): Promise<void> {
  await withRecoveredConsolidationPublication(input.directory, async () => {
    const registryPath = LearnerMemoryPath.memoryRegistryFile(input.directory)
    const summaryPath = LearnerMemoryPath.summaryFile(input.directory)
    const [currentRegistry, currentSummary] = await Promise.all([
      fs.readFile(registryPath, "utf8"),
      fs.readFile(summaryPath, "utf8"),
    ])
    if (
      currentRegistry !== input.expectedRegistryMarkdown ||
      currentSummary !== input.expectedSummaryMarkdown
    ) {
      throw new Error(
        "Learner memory changed while consolidation was running; the staged generation was not published.",
      )
    }

    await writeJsonFileAtomic(
      consolidationPublicationJournalFile(input.directory),
      ConsolidationPublicationJournalSchema.parse({
        schemaVersion: 1,
        registryMarkdown: input.registryMarkdown,
        summaryMarkdown: input.summaryMarkdown,
      }),
    )
    await writeTextFileAtomic(registryPath, input.registryMarkdown)
    await writeTextFileAtomic(summaryPath, input.summaryMarkdown)
    await fs.rm(consolidationPublicationJournalFile(input.directory), { force: true })
  })
}

export {
  consolidationPublicationJournalFile,
  publishConsolidationGeneration,
  withRecoveredConsolidationPublication,
}
