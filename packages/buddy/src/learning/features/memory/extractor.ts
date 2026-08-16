import { ulid } from "ulid"
import z from "zod"
import { LLM } from "@buddy/opencode-adapter/llm"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  CandidateMemoryPatchSchema,
  type CandidateMemoryPatch,
  type EvaluationFixture,
} from "./types"
import type { TruncatedSessionSource } from "./session-source"
import { redactSecrets } from "./redaction"
import { resolveLearnerMemoryModel } from "./models"
import { LEARNER_MEMORY_EXTRACTION_TUNING } from "./tuning"
import LEARNER_MEMORY_EXTRACTOR_PROMPT from "./extractor.md"

const MODEL_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    session_summary: { type: "string" },
    session_slug: { type: ["string", "null"] },
    raw_learner_memory: { type: "string" },
    candidates: {
      type: "array",
      maxItems: LEARNER_MEMORY_EXTRACTION_TUNING.maxModelCandidates,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          operation: { type: "string", enum: ["create"] },
          memoryType: {
            type: "string",
            enum: [
              "preference",
              "constraint",
              "goal",
              "evidence",
              "fragile_skill",
              "misconception",
              "project_context",
              "open_loop",
            ],
          },
          title: { type: "string" },
          body: { type: "string" },
          tags: {
            type: "array",
            items: { type: "string" },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string" },
        },
        required: ["operation", "memoryType", "title", "body", "tags", "confidence", "rationale"],
      },
    },
  },
  required: ["session_summary", "session_slug", "raw_learner_memory", "candidates"],
} satisfies Record<string, unknown>

const ModelCandidateSchema = z.object({
  operation: z.literal("create"),
  memoryType: CandidateMemoryPatchSchema.shape.memoryType,
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
})

const ModelExtractionSchema = z.object({
  session_summary: z.string().default(""),
  session_slug: z.string().nullable().default(null),
  raw_learner_memory: z.string().default(""),
  candidates: z
    .array(ModelCandidateSchema)
    .max(LEARNER_MEMORY_EXTRACTION_TUNING.maxModelCandidates),
})

type TModelExtractionCandidates = {
  patches: CandidateMemoryPatch[]
  sessionSummary: string
  sessionSlug?: string
  rawLearnerMemory: string
}

type ModelExtractionResult = {
  patches: CandidateMemoryPatch[]
  sessionSummary: string
  sessionSlug?: string
  rawLearnerMemory: string
  model: {
    providerID: string
    modelID: string
  }
  usage?: {
    cost: number
    tokens: {
      total?: number
      input: number
      output: number
      reasoning: number
      cache: {
        read: number
        write: number
      }
    }
  }
}

function combinedUserText(fixture: EvaluationFixture): string {
  return fixture.messages
    .filter((message) => message.role === "user")
    .map((message) => message.text)
    .join("\n")
}

function sourceMessageIds(fixture: EvaluationFixture): string[] {
  return fixture.messages
    .filter((message) => message.role === "user")
    .slice(0, LEARNER_MEMORY_EXTRACTION_TUNING.sourceMessageLimit)
    .map((message) => message.id)
}

function sourceEventIds(fixture: EvaluationFixture): string[] {
  return fixture.learningEvents.map((event) => event.id)
}

function createCandidate(input: {
  fixture: EvaluationFixture
  memoryType: CandidateMemoryPatch["memoryType"]
  title: string
  body: string
  tags: string[]
  confidence: number
  rationale: string
}): CandidateMemoryPatch {
  return CandidateMemoryPatchSchema.parse({
    id: `cand_${ulid()}`,
    schemaVersion: 1,
    fixtureId: input.fixture.id,
    operation: "create",
    memoryType: input.memoryType,
    title: input.title,
    body: input.body,
    tags: input.tags,
    confidence: input.confidence,
    sourceMessageIds: sourceMessageIds(input.fixture),
    sourceEventIds: sourceEventIds(input.fixture),
    rationale: input.rationale,
  })
}

function extractCandidatePatchesDeterministic(fixture: EvaluationFixture): CandidateMemoryPatch[] {
  const text = combinedUserText(fixture).toLowerCase()
  const patches: CandidateMemoryPatch[] = []

  if (text.includes("bridge validation") || text.includes("validation should live")) {
    patches.push(
      createCandidate({
        fixture,
        memoryType: "fragile_skill",
        title: "Bridge validation boundary decisions need practice",
        body: "The learner can wire UI actions but still needs practice deciding which validation belongs in UI, backend route, or Electron bridge layers.",
        tags: ["buddy", "electron", "validation", "bridge", "structured-errors"],
        confidence: 0.82,
        rationale:
          "The learner explicitly named confusion and asked for more practice across multiple turns.",
      }),
    )
  }

  if (text.includes("theory-first") && fixture.projectPath) {
    patches.push(
      createCandidate({
        fixture,
        memoryType: "preference",
        title: "Theory-first explanations helped in database indexing project",
        body: "In an unrelated database indexing project, the learner said theory-first explanations helped.",
        tags: ["database", "indexing", "explanation-style"],
        confidence: 0.66,
        rationale:
          "The preference is explicit but project-scoped, so retrieval should not treat it as global.",
      }),
    )
  }

  if (text.includes("structured errors") && text.includes("test passes")) {
    patches.push(
      createCandidate({
        fixture,
        memoryType: "evidence",
        title: "Verified bridge structured error validation",
        body: "The learner implemented Electron bridge structured errors and verified the invalid payload path with a passing validation test.",
        tags: ["buddy", "electron", "validation", "structured-errors", "evidence"],
        confidence: 0.86,
        rationale:
          "The fixture includes explicit success evidence and a learning event tied to a passing validation test.",
      }),
    )
  }

  if (
    text.includes("renderer validation") &&
    text.includes("route still needs schema validation")
  ) {
    patches.push(
      createCandidate({
        fixture,
        memoryType: "misconception",
        title: "Renderer validation does not protect backend route boundaries",
        body: "The learner initially thought renderer validation let the backend route trust payloads, then corrected the model after testing a direct route call.",
        tags: ["buddy", "renderer", "route", "validation", "trust-boundary"],
        confidence: 0.78,
        rationale:
          "The learner stated the misconception, tested it, and corrected the boundary model in the same session.",
      }),
    )
  }

  return patches.slice(0, LEARNER_MEMORY_EXTRACTION_TUNING.maxModelCandidates)
}

function buildModelPrompt(fixture: EvaluationFixture): string {
  return redactSecrets(
    JSON.stringify(
      {
        projectPath: fixture.projectPath ?? "unknown",
        source: {
          kind: "buddy_learner_memory_evaluation_fixture",
          messages: fixture.messages,
          learningEvents: fixture.learningEvents.map((event) => ({
            id: event.id,
            type: event.type,
            sourceKind: event.sourceKind,
            createdAt: event.createdAt,
            text: event.searchableText,
          })),
        },
      },
      null,
      2,
    ),
  )
}

function candidatesFromModelOutput(input: {
  fixture: EvaluationFixture
  structured: unknown
}): TModelExtractionCandidates {
  const parsed = ModelExtractionSchema.parse(input.structured)

  return Object.assign(
    {
      sessionSummary: redactSecrets(parsed.session_summary),
    },
    parsed.session_slug ? { sessionSlug: parsed.session_slug } : undefined,
    {
      rawLearnerMemory: redactSecrets(parsed.raw_learner_memory),
      patches: parsed.candidates.map((candidate) =>
        createCandidate({
          fixture: input.fixture,
          memoryType: candidate.memoryType,
          title: redactSecrets(candidate.title),
          body: redactSecrets(candidate.body),
          tags: candidate.tags,
          confidence: candidate.confidence,
          rationale: redactSecrets(candidate.rationale),
        }),
      ),
    },
  )
}

function resolveLearnerMemoryExtractionModel(
  directory: string,
  allowGenericFallback = true,
): ReturnType<typeof resolveLearnerMemoryModel> {
  return resolveLearnerMemoryModel({ directory, purpose: "extract", allowGenericFallback })
}

async function extractCandidatePatchesWithModel(input: {
  directory: string
  fixture: EvaluationFixture
  sessionID: string
  messageID?: string
}): Promise<ModelExtractionResult> {
  const extractionModel = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => resolveLearnerMemoryExtractionModel(input.directory),
  })
  if (!extractionModel) {
    throw new Error("Memory extraction model resolution failed")
  }
  const response = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () =>
      LLM.generateStructuredText({
        sessionID: input.sessionID,
        messageID: input.messageID ?? `msg_learner_memory_${input.fixture.id}`,
        providerID: extractionModel.providerID,
        modelID: extractionModel.modelID,
        model: extractionModel.model,
        system: LEARNER_MEMORY_EXTRACTOR_PROMPT,
        prompt: buildModelPrompt(input.fixture),
        schema: MODEL_EXTRACTION_JSON_SCHEMA,
        retries: LEARNER_MEMORY_EXTRACTION_TUNING.modelRetries,
        timeoutMs: LEARNER_MEMORY_EXTRACTION_TUNING.modelTimeoutMs,
      }),
  })

  return Object.assign(
    candidatesFromModelOutput({
      fixture: input.fixture,
      structured: response.structured,
    }),
    {
      model: {
        providerID: response.providerID,
        modelID: response.modelID,
      },
    },
    response.usage ? { usage: response.usage } : undefined,
  )
}

function buildStageOneModelPrompt(input: {
  projectPath: string
  sessionID: string
  source: TruncatedSessionSource
}): string {
  return redactSecrets(
    [
      `Project path: ${input.projectPath}`,
      `Session ID: ${input.sessionID}`,
      `Source updated at: ${input.source.sourceUpdatedAt}`,
      `Source fingerprint: ${input.source.sourceFingerprint}`,
      `Filtered message count: ${input.source.sourceMessageCount}`,
      `Transcript truncated: ${input.source.truncation.truncated ? "true" : "false"}`,
      "",
      input.source.transcript,
    ].join("\n"),
  )
}

async function extractLearnerMemoryStageOneWithModel(input: {
  directory: string
  fixture: EvaluationFixture
  source: TruncatedSessionSource
  sessionID: string
  messageID?: string
}): Promise<ModelExtractionResult> {
  const extractionModel = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => resolveLearnerMemoryExtractionModel(input.directory),
  })
  if (!extractionModel) {
    throw new Error("Memory extraction model resolution failed")
  }
  const response = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () =>
      LLM.generateStructuredText({
        sessionID: input.sessionID,
        messageID: input.messageID ?? `msg_learner_memory_${input.fixture.id}`,
        providerID: extractionModel.providerID,
        modelID: extractionModel.modelID,
        model: extractionModel.model,
        system: LEARNER_MEMORY_EXTRACTOR_PROMPT,
        prompt: buildStageOneModelPrompt({
          projectPath: input.directory,
          sessionID: input.fixture.id,
          source: input.source,
        }),
        schema: MODEL_EXTRACTION_JSON_SCHEMA,
        retries: LEARNER_MEMORY_EXTRACTION_TUNING.modelRetries,
        timeoutMs: LEARNER_MEMORY_EXTRACTION_TUNING.modelTimeoutMs,
      }),
  })

  return Object.assign(
    candidatesFromModelOutput({
      fixture: input.fixture,
      structured: response.structured,
    }),
    {
      model: {
        providerID: response.providerID,
        modelID: response.modelID,
      },
    },
    response.usage ? { usage: response.usage } : undefined,
  )
}

export {
  extractCandidatePatchesDeterministic,
  extractCandidatePatchesWithModel,
  extractLearnerMemoryStageOneWithModel,
  resolveLearnerMemoryExtractionModel,
}

export type { ModelExtractionResult }
