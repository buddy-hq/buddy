import z from "zod"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import { buildLearnerMemorySourcePointers } from "../evidence"
import { searchLearnerMemory } from "../retrieval"
import { LearnerMemoryTypeSchema } from "../types"
import { loadProjectConfig } from "../../../../config/store/read-config"
import { readLearnerMemorySettings } from "../settings"

const LearnerMemorySearchInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
  projectPath: z.string().optional(),
  memoryTypes: z.array(LearnerMemoryTypeSchema).optional(),
  includeSources: z.boolean().optional(),
})

const learnerMemorySearchTool = createBuddyTool({
  id: "learner_memory_search",
  description:
    "Search Buddy's memory for relevant preferences, goals, evidence, fragile skills, misconceptions, and project context. Use this only when prior learner context would materially improve the current answer.",
  parameters: LearnerMemorySearchInputSchema,
  ui: {
    presentation: "hidden-summary",
    labels: {
      idle: "Search memory",
    },
  },
  async execute(params, ctx) {
    const settings = readLearnerMemorySettings(await loadProjectConfig(ctx.directory))
    if (!settings.enabled) {
      throw new Error("Memory is not enabled for this notebook")
    }

    const results = await searchLearnerMemory({
      directory: ctx.directory,
      query: params.query,
      limit: params.limit,
      projectPath: params.projectPath ?? ctx.directory,
      recordUsage: true,
    })

    const filteredResults = params.memoryTypes
      ? results.filter((result) => params.memoryTypes?.includes(result.memory.type) ?? false)
      : results
    const sourcePointers = params.includeSources
      ? await Promise.all(
          filteredResults.map((result) =>
            buildLearnerMemorySourcePointers({
              directory: ctx.directory,
              memory: result.memory,
            }),
          ),
        )
      : []

    return {
      title: "Memory search",
      metadata: {
        query: params.query,
        resultCount: filteredResults.length,
      },
      output: JSON.stringify(
        {
          memories: filteredResults.map((result, index) => ({
            id: result.memory.id,
            title: result.memory.title,
            body: result.memory.body,
            memoryType: result.memory.memoryType,
            pedagogyKind: result.memory.pedagogyKind,
            type: result.memory.type,
            pinned: result.memory.pinned,
            confidence: result.memory.confidence,
            strength: result.memory.strength,
            sourceEventIds: result.memory.sourceEventIds,
            sources: sourcePointers[index] ?? [],
            score: result.score,
            reasons: result.reasons,
          })),
        },
        null,
        2,
      ),
    }
  },
})

export { learnerMemorySearchTool }
