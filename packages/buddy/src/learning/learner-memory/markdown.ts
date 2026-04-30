import fs from "node:fs/promises"
import { renderRegistryMarkdown, renderSummaryMarkdown } from "./memory-registry-markdown"
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

  await Promise.all([
    fs.writeFile(summaryPath, renderSummaryMarkdown(memories), "utf8"),
    fs.writeFile(registryPath, renderRegistryMarkdown(memories), "utf8"),
  ])

  return {
    summaryPath,
    registryPath,
  }
}

export { regenerateLearnerMemoryMarkdown, renderRegistryMarkdown, renderSummaryMarkdown }
