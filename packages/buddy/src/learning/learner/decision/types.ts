import z from "zod"
import { ACTIVITY_KINDS, SCAFFOLDING_LEVELS } from "../../runtime/types.js"
import { DecisionDispositionSchema } from "../artifacts/types.js"

export const EvidenceStrengthSchema = z.enum(["none", "weak", "strong"])
export type EvidenceStrength = z.infer<typeof EvidenceStrengthSchema>

export const InterpretMessageDecisionSchema = z.object({
  disposition: DecisionDispositionSchema.default("apply"),
  confidence: z.number().min(0).max(1).default(0.5),
  intent: z.string().min(1),
  affect: z.string().min(1),
  relevantGoalIds: z.array(z.string()).default([]),
  createEvidence: z
    .object({
      strength: EvidenceStrengthSchema,
      summary: z.string().min(1),
    })
    .optional(),
  createMisconception: z
    .object({
      summary: z.string().min(1),
    })
    .optional(),
  resolveMisconceptionIds: z.array(z.string()).default([]),
  requiresClarification: z.boolean().default(false),
  replyMode: z.enum(["reply-only", "update-state", "ask-question"]),
  rationale: z.array(z.string()).default([]),
})
export type InterpretMessageDecision = z.infer<typeof InterpretMessageDecisionSchema>

export const PlanDecisionSchema = z.object({
  disposition: DecisionDispositionSchema.default("apply"),
  confidence: z.number().min(0).max(1).default(0.5),
  primaryGoalId: z.string().optional(),
  suggestedActivity: z.enum(ACTIVITY_KINDS),
  suggestedScaffoldingLevel: z.enum(SCAFFOLDING_LEVELS),
  warmupGoalIds: z.array(z.string()).default([]),
  alternatives: z.array(z.string()).default([]),
  rationale: z.array(z.string()).default([]),
  motivationHook: z.string().optional(),
  riskFlags: z.array(z.string()).default([]),
  followUpQuestions: z.array(z.string()).default([]),
})
export type PlanDecision = z.infer<typeof PlanDecisionSchema>

export const FeedbackDecisionSchema = z.object({
  disposition: DecisionDispositionSchema.default("apply"),
  confidence: z.number().min(0).max(1).default(0.5),
  feedbackRecord: z
    .object({
      strengths: z.array(z.string()).default([]),
      gaps: z.array(z.string()).default([]),
      guidance: z.array(z.string()).default([]),
      requiredAction: z.string().min(1),
      scaffoldingLevel: z.enum(SCAFFOLDING_LEVELS),
    })
    .optional(),
  closeFeedbackIds: z.array(z.string()).default([]),
  closeFeedbackStatus: z.enum(["acted-on", "resolved"]).optional(),
  resolveMisconceptionIds: z.array(z.string()).default([]),
  rationale: z.array(z.string()).default([]),
})
export type FeedbackDecision = z.infer<typeof FeedbackDecisionSchema>

export const InterpretMessageJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    disposition: {
      type: "string",
      enum: ["apply", "abstain"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    intent: {
      type: "string",
    },
    affect: {
      type: "string",
    },
    relevantGoalIds: {
      type: "array",
      items: { type: "string" },
    },
    createEvidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        strength: {
          type: "string",
          enum: [...EvidenceStrengthSchema.options],
        },
        summary: {
          type: "string",
        },
      },
      required: ["strength", "summary"],
    },
    createMisconception: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: {
          type: "string",
        },
      },
      required: ["summary"],
    },
    resolveMisconceptionIds: {
      type: "array",
      items: { type: "string" },
    },
    requiresClarification: {
      type: "boolean",
    },
    replyMode: {
      type: "string",
      enum: ["reply-only", "update-state", "ask-question"],
    },
    rationale: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "disposition",
    "confidence",
    "intent",
    "affect",
    "relevantGoalIds",
    "resolveMisconceptionIds",
    "requiresClarification",
    "replyMode",
    "rationale",
  ],
} as const

export const PlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    disposition: {
      type: "string",
      enum: ["apply", "abstain"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    primaryGoalId: {
      type: "string",
    },
    suggestedActivity: {
      type: "string",
      enum: [...ACTIVITY_KINDS],
    },
    suggestedScaffoldingLevel: {
      type: "string",
      enum: [...SCAFFOLDING_LEVELS],
    },
    warmupGoalIds: {
      type: "array",
      items: {
        type: "string",
      },
    },
    alternatives: {
      type: "array",
      items: {
        type: "string",
      },
    },
    rationale: {
      type: "array",
      items: {
        type: "string",
      },
    },
    motivationHook: {
      type: "string",
    },
    riskFlags: {
      type: "array",
      items: {
        type: "string",
      },
    },
    followUpQuestions: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
  required: [
    "disposition",
    "confidence",
    "suggestedActivity",
    "suggestedScaffoldingLevel",
    "warmupGoalIds",
    "alternatives",
    "rationale",
    "riskFlags",
    "followUpQuestions",
  ],
} as const

export const FeedbackJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    disposition: {
      type: "string",
      enum: ["apply", "abstain"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    feedbackRecord: {
      type: "object",
      additionalProperties: false,
      properties: {
        strengths: {
          type: "array",
          items: { type: "string" },
        },
        gaps: {
          type: "array",
          items: { type: "string" },
        },
        guidance: {
          type: "array",
          items: { type: "string" },
        },
        requiredAction: {
          type: "string",
        },
        scaffoldingLevel: {
          type: "string",
          enum: [...SCAFFOLDING_LEVELS],
        },
      },
      required: ["strengths", "gaps", "guidance", "requiredAction", "scaffoldingLevel"],
    },
    closeFeedbackIds: {
      type: "array",
      items: { type: "string" },
    },
    closeFeedbackStatus: {
      type: "string",
      enum: ["acted-on", "resolved"],
    },
    resolveMisconceptionIds: {
      type: "array",
      items: { type: "string" },
    },
    rationale: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "disposition",
    "confidence",
    "closeFeedbackIds",
    "resolveMisconceptionIds",
    "rationale",
  ],
} as const
