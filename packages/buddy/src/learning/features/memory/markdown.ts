import fs from "node:fs/promises"
import { writeTextFileAtomic } from "../../../storage/atomic-file"
import {
  parseLearnerMemoryRegistry,
  renderRegistryMarkdown,
  renderSummaryMarkdown,
} from "./memory-registry-markdown"
import { LearnerMemoryPath } from "./paths"
import { ensureLearnerMemoryLayout, listLearnerMemories } from "./storage"

async function regenerateLearnerMemoryMarkdown(directory: string): Promise<{
  summaryPath: string
  registryPath: string
}> {
  await ensureLearnerMemoryLayout(directory)
  const memories = await listLearnerMemories(directory)
  const summaryPath = LearnerMemoryPath.workingSummaryFile(directory)
  const registryPath = LearnerMemoryPath.workingMemoryFile(directory)
  const registryMarkdown = await fs.readFile(registryPath, "utf8").catch(() => "")
  const { invalidBlocks } = parseLearnerMemoryRegistry(registryMarkdown)

  await Promise.all([
    writeTextFileAtomic(summaryPath, renderSummaryMarkdown(memories)),
    writeTextFileAtomic(registryPath, renderRegistryMarkdown(memories, { invalidBlocks })),
  ])

  return {
    summaryPath,
    registryPath,
  }
}

export { regenerateLearnerMemoryMarkdown, renderRegistryMarkdown, renderSummaryMarkdown }
