import z from "zod"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
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

const LearnerMemoryRememberInputSchema = z.object({
  operation: z.literal("remember"),
  type: LearnerMemoryTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  projectPath: z.string().optional(),
  reason: z.string().min(1),
})

const LearnerMemoryCorrectInputSchema = z.object({
  operation: z.literal("correct"),
  memoryId: z.string().min(1),
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  projectPath: z.string().optional(),
  reason: z.string().min(1),
})

const LearnerMemoryForgetInputSchema = z.object({
  operation: z.literal("forget"),
  memoryId: z.string().min(1),
  reason: z.string().min(1),
})

const LearnerMemoryRejectInputSchema = z.object({
  operation: z.literal("reject"),
  memoryId: z.string().min(1),
  reason: z.string().min(1),
})

const LearnerMemoryResolveInputSchema = z.object({
  operation: z.literal("resolve"),
  memoryId: z.string().min(1),
  reason: z.string().min(1),
})

const LearnerMemoryPinInputSchema = z.object({
  operation: z.literal("pin"),
  memoryId: z.string().min(1),
  pinned: z.boolean(),
  reason: z.string().min(1),
})

const LEARNER_MEMORY_UPDATE_OPERATIONS = [
  "remember",
  "correct",
  "forget",
  "reject",
  "resolve",
  "pin",
] as const
const LearnerMemoryUpdateOperationSchema = z.enum(LEARNER_MEMORY_UPDATE_OPERATIONS)

type LearnerMemoryUpdateOperation = z.infer<typeof LearnerMemoryUpdateOperationSchema>

const LearnerMemoryUpdateOperationSchemaByOperation = {
  remember: LearnerMemoryRememberInputSchema,
  correct: LearnerMemoryCorrectInputSchema,
  forget: LearnerMemoryForgetInputSchema,
  reject: LearnerMemoryRejectInputSchema,
  resolve: LearnerMemoryResolveInputSchema,
  pin: LearnerMemoryPinInputSchema,
} satisfies Record<LearnerMemoryUpdateOperation, z.ZodTypeAny>

const LearnerMemoryUpdateInputSchema = z
  .object({
    operation: LearnerMemoryUpdateOperationSchema,
    type: LearnerMemoryTypeSchema.optional(),
    title: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    projectPath: z.string().optional(),
    memoryId: z.string().min(1).optional(),
    pinned: z.boolean().optional(),
    reason: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    const schema = LearnerMemoryUpdateOperationSchemaByOperation[value.operation]
    const result = schema.safeParse(value)
    if (result.success) {
      return
    }

    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue })
    }
  })

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
      const rememberParams = LearnerMemoryRememberInputSchema.parse(params)
      const memory = await createLearnerMemory({
        directory: ctx.directory,
        type: rememberParams.type,
        title: rememberParams.title,
        body: rememberParams.body,
        tags: rememberParams.tags,
        projectPath: rememberParams.projectPath ?? ctx.directory,
        source: "learner_authored",
        reason: rememberParams.reason,
      })
      await regenerateLearnerMemoryMarkdown(ctx.directory)
      return {
        title: "Learner memory created",
        metadata: {},
        output: JSON.stringify({ memory }, null, 2),
      }
    }

    if (params.operation === "correct") {
      const correctParams = LearnerMemoryCorrectInputSchema.parse(params)
      const memory = await editLearnerMemory({
        directory: ctx.directory,
        memoryId: correctParams.memoryId,
        ...(correctParams.title ? { title: correctParams.title } : {}),
        ...(correctParams.body ? { body: correctParams.body } : {}),
        ...(correctParams.tags ? { tags: correctParams.tags } : {}),
        ...(correctParams.projectPath ? { projectPath: correctParams.projectPath } : {}),
        reason: correctParams.reason,
      })
      await regenerateLearnerMemoryMarkdown(ctx.directory)
      return {
        title: memory ? "Learner memory corrected" : "Learner memory not found",
        metadata: {},
        output: JSON.stringify({ memory }, null, 2),
      }
    }

    if (params.operation === "reject") {
      const rejectParams = LearnerMemoryRejectInputSchema.parse(params)
      const memory = await rejectLearnerMemory({
        directory: ctx.directory,
        memoryId: rejectParams.memoryId,
        reason: rejectParams.reason,
      })
      await regenerateLearnerMemoryMarkdown(ctx.directory)
      return {
        title: memory ? "Learner memory rejected" : "Learner memory not found",
        metadata: {},
        output: JSON.stringify({ memory }, null, 2),
      }
    }

    if (params.operation === "resolve") {
      const resolveParams = LearnerMemoryResolveInputSchema.parse(params)
      const memory = await resolveLearnerMemory({
        directory: ctx.directory,
        memoryId: resolveParams.memoryId,
        reason: resolveParams.reason,
      })
      await regenerateLearnerMemoryMarkdown(ctx.directory)
      return {
        title: memory ? "Learner memory resolved" : "Learner memory not found",
        metadata: {},
        output: JSON.stringify({ memory }, null, 2),
      }
    }

    if (params.operation === "pin") {
      const pinParams = LearnerMemoryPinInputSchema.parse(params)
      const memory = await pinLearnerMemory({
        directory: ctx.directory,
        memoryId: pinParams.memoryId,
        pinned: pinParams.pinned,
        reason: pinParams.reason,
      })
      await regenerateLearnerMemoryMarkdown(ctx.directory)
      return {
        title: memory
          ? pinParams.pinned
            ? "Learner memory pinned"
            : "Learner memory unpinned"
          : "Learner memory not found",
        metadata: {},
        output: JSON.stringify({ memory }, null, 2),
      }
    }

    const forgetParams = LearnerMemoryForgetInputSchema.parse(params)
    const memory = await hideLearnerMemory({
      directory: ctx.directory,
      memoryId: forgetParams.memoryId,
      reason: forgetParams.reason,
    })
    await regenerateLearnerMemoryMarkdown(ctx.directory)
    const remaining = await searchLearnerMemory({
      directory: ctx.directory,
      query: forgetParams.memoryId,
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
