import fs from "node:fs/promises"
import { describe, expect, test } from "bun:test"
import {
  createConsolidationStagingTargets,
  validateAndPublishConsolidation,
} from "../../src/learning/features/memory/consolidation"
import { runWithLearnerMemoryLabContext } from "../../src/learning/features/memory/lab-context"
import { LearnerMemoryPath } from "../../src/learning/features/memory/paths"
import { consolidationPublicationJournalFile } from "../../src/learning/features/memory/consolidation-publication"
import { tmpdir } from "../helpers/tmpdir"

describe("learner-memory consolidation publication", () => {
  test("rolls a journaled generation forward after an interrupted publication", async () => {
    await using project = await tmpdir({ git: true })
    const memoryRoot = `${project.path}/learner-memory`

    await runWithLearnerMemoryLabContext({ memoryRoot }, async () => {
      const initialStaging = await createConsolidationStagingTargets(project.path)
      await fs.rm(initialStaging.root, { recursive: true, force: true })
      const registryMarkdown = "# Memory Registry\n\nRecovered registry generation.\n"
      const summaryMarkdown = "# Memory Summary\n\nRecovered summary generation.\n"
      await fs.writeFile(
        consolidationPublicationJournalFile(project.path),
        `${JSON.stringify({
          schemaVersion: 1,
          registryMarkdown,
          summaryMarkdown,
        })}\n`,
        "utf8",
      )
      await fs.writeFile(
        LearnerMemoryPath.memoryRegistryFile(project.path),
        registryMarkdown,
        "utf8",
      )

      const recoveredStaging = await createConsolidationStagingTargets(project.path)
      try {
        expect(recoveredStaging.baseMemoryRegistry).toBe(registryMarkdown)
        expect(recoveredStaging.baseMemorySummary).toBe(summaryMarkdown)
        await expect(
          fs.access(consolidationPublicationJournalFile(project.path)),
        ).rejects.toMatchObject({ code: "ENOENT" })
      } finally {
        await fs.rm(recoveredStaging.root, { recursive: true, force: true })
      }
    })
  })

  test("does not publish a stale staged generation", async () => {
    await using project = await tmpdir({ git: true })
    const memoryRoot = `${project.path}/learner-memory`

    await runWithLearnerMemoryLabContext({ memoryRoot }, async () => {
      const staging = await createConsolidationStagingTargets(project.path)
      try {
        const newerSummary = "# Memory Summary\n\nNewer canonical change.\n"
        await fs.writeFile(LearnerMemoryPath.summaryFile(project.path), newerSummary, "utf8")
        await fs.writeFile(
          staging.memorySummaryPath,
          "# Memory Summary\n\nStale staged change.\n",
          "utf8",
        )

        await expect(
          validateAndPublishConsolidation({ directory: project.path, staging }),
        ).rejects.toThrow("changed while consolidation was running")
        expect(await fs.readFile(LearnerMemoryPath.summaryFile(project.path), "utf8")).toBe(
          newerSummary,
        )
      } finally {
        await fs.rm(staging.root, { recursive: true, force: true })
      }
    })
  })

  test("validates staged files before replacing canonical memory", async () => {
    await using project = await tmpdir({ git: true })
    const memoryRoot = `${project.path}/learner-memory`

    await runWithLearnerMemoryLabContext({ memoryRoot }, async () => {
      const staging = await createConsolidationStagingTargets(project.path)
      try {
        await fs.writeFile(
          staging.memoryRegistryPath,
          "# Memory Registry\n\n## Invalid memory\n\n- id: missing-required-fields\n",
          "utf8",
        )

        await expect(
          validateAndPublishConsolidation({ directory: project.path, staging }),
        ).rejects.toThrow("invalid memory registry")
        expect(await fs.readFile(LearnerMemoryPath.memoryRegistryFile(project.path), "utf8")).toBe(
          staging.baseMemoryRegistry,
        )
      } finally {
        await fs.rm(staging.root, { recursive: true, force: true })
      }
    })
  })
})
