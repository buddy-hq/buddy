import z from "zod"
import { createBuddyTool } from "../../tools/create-buddy-tool"
import {
  createLearnerMemory,
  editLearnerMemory,
  hideLearnerMemory,
  pinLearnerMemory,
  rejectLearnerMemory,
  resolveLearnerMemory,
} from "../storage"
import { regenerateLearnerMemoryMarkdown } from "../markdown"
import { searchLearnerMemory } from "../retrieval"
import { LearnerMemoryTypeSchema } from "../types"

const LearnerMemoryUpdateInputSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("remember"),
    type: LearnerMemoryTypeSchema,
    title: z.string().min(1),
    body: z.string().min(1),
    tags: z.array(z.string().min(1)).default([]),
    projectPath: z.string().optional(),
    reason: z.string().min(1),
  }),
  z.object({
    operation: z.literal("correct"),
    memoryId: z.string().min(1),
    title: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    projectPath: z.string().optional(),
    reason: z.string().min(1),
  }),
  z.object({
    operation: z.literal("forget"),
    memoryId: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    operation: z.literal("reject"),
    memoryId: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    operation: z.literal("resolve"),
    memoryId: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    operation: z.literal("pin"),
    memoryId: z.string().min(1),
    pinned: z.boolean(),
    reason: z.string().min(1),
  }),
])

const learnerMemoryUpdateTool = createBuddyTool({
  id: "learner_memory_update",
  description:
    "Update Buddy's learner memory only when the learner explicitly asks Buddy to remember, correct, forget, or reject learner context. Do not use this for inferred memories; background extraction handles inference.",
  parameters: LearnerMemoryUpdateInputSchema,
  ui: {
    presentation: "hidden-summary",
    labels: {
      idle: "Update learner memory",
    },
  },
  async execute(params, ctx) {
    if (params.operation === "remember") {
      const memory = await createLearnerMemory({
        directory: ctx.directory,
        type: params.type,
        title: params.title,
        body: params.body,
        tags: params.tags,
        projectPath: params.projectPath ?? ctx.directory,
        source: "learner_authored",
        reason: params.reason,
      })
      await regenerateLearnerMemoryMarkdown(ctx.directory)
      return {
        title: "Learner memory created",
        metadata: {},
        output: JSON.stringify({ memory }, null, 2),
      }
    }

    if (params.operation === "correct") {
      const memory = await editLearnerMemory({
        directory: ctx.directory,
        memoryId: params.memoryId,
        ...(params.title ? { title: params.title } : {}),
        ...(params.body ? { body: params.body } : {}),
        ...(params.tags ? { tags: params.tags } : {}),
        ...(params.projectPath ? { projectPath: params.projectPath } : {}),
        reason: params.reason,
      })
      await regenerateLearnerMemoryMarkdown(ctx.directory)
      return {
        title: memory ? "Learner memory corrected" : "Learner memory not found",
        metadata: {},
        output: JSON.stringify({ memory }, null, 2),
      }
    }

    if (params.operation === "reject") {
      const memory = await rejectLearnerMemory({
        directory: ctx.directory,
        memoryId: params.memoryId,
        reason: params.reason,
      })
      await regenerateLearnerMemoryMarkdown(ctx.directory)
      return {
        title: memory ? "Learner memory rejected" : "Learner memory not found",
        metadata: {},
        output: JSON.stringify({ memory }, null, 2),
      }
    }

    if (params.operation === "resolve") {
      const memory = await resolveLearnerMemory({
        directory: ctx.directory,
        memoryId: params.memoryId,
        reason: params.reason,
      })
      await regenerateLearnerMemoryMarkdown(ctx.directory)
      return {
        title: memory ? "Learner memory resolved" : "Learner memory not found",
        metadata: {},
        output: JSON.stringify({ memory }, null, 2),
      }
    }

    if (params.operation === "pin") {
      const memory = await pinLearnerMemory({
        directory: ctx.directory,
        memoryId: params.memoryId,
        pinned: params.pinned,
        reason: params.reason,
      })
      await regenerateLearnerMemoryMarkdown(ctx.directory)
      return {
        title: memory
          ? params.pinned
            ? "Learner memory pinned"
            : "Learner memory unpinned"
          : "Learner memory not found",
        metadata: {},
        output: JSON.stringify({ memory }, null, 2),
      }
    }

    const memory = await hideLearnerMemory({
      directory: ctx.directory,
      memoryId: params.memoryId,
      reason: params.reason,
    })
    await regenerateLearnerMemoryMarkdown(ctx.directory)
    const remaining = await searchLearnerMemory({
      directory: ctx.directory,
      query: params.memoryId,
      projectPath: ctx.directory,
      recordUsage: false,
    })
    return {
      title: memory ? "Learner memory hidden" : "Learner memory not found",
      metadata: {},
      output: JSON.stringify({ memory, remainingMatches: remaining.length }, null, 2),
    }
  },
})

export { learnerMemoryUpdateTool }
