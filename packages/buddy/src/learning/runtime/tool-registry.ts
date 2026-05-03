import type { BuddyTool } from "./create-buddy-tool"
import { allBuddyTools } from "./feature-registry"
import { dynamicToolSearchTools } from "../runtime/dynamic-tool-discovery"

type RegisteredLearningTool = BuddyTool

function collectAllTools(): BuddyTool[] {
  const seen = new Set<string>()
  const tools: BuddyTool[] = [...dynamicToolSearchTools]

  for (const tool of tools) {
    seen.add(tool.id)
  }

  for (const tool of allBuddyTools()) {
    if (seen.has(tool.id)) continue
    seen.add(tool.id)
    tools.push(tool)
  }

  return tools
}

function assertUniqueToolIds(tools: readonly BuddyTool[]): void {
  const seen = new Set<string>()
  for (const tool of tools) {
    if (seen.has(tool.id)) {
      throw new Error(`Duplicate tool ID: ${tool.id}`)
    }
    seen.add(tool.id)
  }
}

const ALL_TOOLS = collectAllTools()
assertUniqueToolIds(ALL_TOOLS)

function allKnownLearningTools(): BuddyTool[] {
  return [...ALL_TOOLS]
}

function allRegisteredLearningTools(): RegisteredLearningTool[] {
  return ALL_TOOLS
}

export { allKnownLearningTools, allRegisteredLearningTools }

export type { RegisteredLearningTool }
