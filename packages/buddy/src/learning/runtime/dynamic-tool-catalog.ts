import z from "zod"
import type { DynamicToolId } from "../shared/runtime-types"
import type { BuddyTool } from "./create-buddy-tool"
import {
  DYNAMIC_LEARNING_TOOL_USE_CASES,
  type DynamicLearningToolRenderer,
  type DynamicLearningToolSideEffect,
  type DynamicLearningToolUseCase,
} from "./dynamic-tool-metadata"
import { allBuddyTools } from "./feature-registry"

type DynamicLearningToolCatalogEntry = {
  id: DynamicToolId
  title: string
  description: string
  searchText: string
  keywords: readonly string[]
  useCase: DynamicLearningToolUseCase
  requiresActiveWorkspace: boolean
  sideEffects: readonly DynamicLearningToolSideEffect[]
  mutatesLearnerState: boolean
  renderer: DynamicLearningToolRenderer
  tool: BuddyTool
}

const DynamicLearningToolSearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  useCase: z.enum(DYNAMIC_LEARNING_TOOL_USE_CASES),
  reasons: z.array(z.string()),
  score: z.number(),
})

type DynamicLearningToolSearchResultMetadata = z.infer<typeof DynamicLearningToolSearchResultSchema>

const DEFAULT_DYNAMIC_TOOL_SIDE_EFFECTS = ["none"] as const
const DEFAULT_DYNAMIC_TOOL_RENDERER = "generic" as const

function dynamicToolToCatalogEntry(tool: BuddyTool): DynamicLearningToolCatalogEntry {
  if (!tool.dynamic) {
    throw new Error(`Dynamic learning tool "${tool.id}" must define dynamic metadata`)
  }

  return {
    id: tool.id,
    title: tool.dynamic.title,
    description: tool.dynamic.description ?? tool.description,
    searchText: tool.dynamic.searchText ?? "",
    keywords: [...tool.dynamic.keywords],
    useCase: tool.dynamic.useCase,
    requiresActiveWorkspace: tool.constraints?.teachingWorkspace === "active",
    sideEffects: tool.dynamic.sideEffects ?? [...DEFAULT_DYNAMIC_TOOL_SIDE_EFFECTS],
    mutatesLearnerState: tool.dynamic.mutatesLearnerState ?? false,
    renderer: tool.dynamic.renderer ?? DEFAULT_DYNAMIC_TOOL_RENDERER,
    tool,
  }
}

function allDynamicLearningToolCatalogEntries(): readonly DynamicLearningToolCatalogEntry[] {
  return allBuddyTools()
    .filter((tool) => Boolean(tool.dynamic))
    .map(dynamicToolToCatalogEntry)
}

function allDynamicLearningToolIds(): DynamicToolId[] {
  return allDynamicLearningToolCatalogEntries().map((entry) => entry.id)
}

function isDynamicLearningToolID(value: string): value is DynamicToolId {
  return allDynamicLearningToolCatalogEntries().some((entry) => entry.id === value)
}

export {
  DynamicLearningToolSearchResultSchema,
  allDynamicLearningToolCatalogEntries,
  allDynamicLearningToolIds,
  isDynamicLearningToolID,
}

export type {
  DynamicLearningToolCatalogEntry,
  DynamicLearningToolSearchResultMetadata,
  DynamicLearningToolRenderer,
  DynamicLearningToolSideEffect,
  DynamicLearningToolUseCase,
}
