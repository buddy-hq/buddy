import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { readProjectConfig } from "../../config/runtime"
import { decideLearnerMemoryAttention } from "./attention-gate"
import { runLearnerMemoryConsolidation } from "./consolidation"
import { listLearnerEventRecords } from "./evidence"
import {
  extractLearnerMemoryStageOneWithModel,
  resolveLearnerMemoryExtractionModel,
} from "./extractor"
import { internalLearnerMemorySession } from "./internal-session"
import { readLearnerMemorySettings } from "./settings"
import { buildFilteredSessionSource, truncateSessionSource } from "./session-source"
import {
  markLearnerMemoryStageOneJobFailed,
  markLearnerMemoryStageOneJobSucceeded,
  markLearnerMemoryStageOneJobSucceededNoOutput,
  releaseLearnerMemoryStageOneJobSkipped,
  tryClaimLearnerMemoryExtractionBudget,
  tryClaimLearnerMemoryStageOneJob,
} from "./stage-one-store"
import {
  appendLearnerEvent,
  createLearnerEvent,
  ensureLearnerMemoryLayout,
  writeCandidatePatches,
} from "./storage"
import { tokenBudgetFromContextWindow } from "./text-budget"
import type { AttentionDecision, EvaluationFixture, EvaluationMessage, LearnerEvent } from "./types"
import { EvaluationFixtureSchema } from "./types"

const SESSION_ID_SAFE_CHARACTER_PATTERN = /[^a-zA-Z0-9_-]/gu
const SESSION_EXTRACTION_LEARNING_EVENT_TYPES = new Set<LearnerEvent["type"]>([
  "question_set_attempt_ingested",
  "flashcard_review_ingested",
  "task_checkpoint_ingested",
  "goal_committed",
])

type SessionExtractionResult = {
  enabled: boolean
  sessionID: string
  decision?: AttentionDecision
  candidateCount: number
  approvedCount: number
  memoryIds: string[]
  skippedReason?: string
  consolidationError?: string
}

function learnerMemoryEnabled(config: Awaited<ReturnType<typeof readProjectConfig>>): boolean {
  return readLearnerMemorySettings(config).enabled
}

function safeExtractionSessionId(sessionID: string): string {
  return sessionID.replace(SESSION_ID_SAFE_CHARACTER_PATTERN, "_")
}

async function loadSessionMessages(input: {
  directory: string
  sessionID: string
}): Promise<MessageV2.WithParts[]> {
  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () =>
      OpenCodeSession.messages({
        sessionID: SessionID.make(input.sessionID),
      }),
  })
}

function toEvaluationMessagesFromFilteredSource(
  source: ReturnType<typeof buildFilteredSessionSource>,
): EvaluationMessage[] {
  return source.messages.map((message) => ({
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    text: message.text,
    toolNames: message.toolNames.length > 0 ? message.toolNames : undefined,
    ...(message.outputTokens !== undefined ? { outputTokens: message.outputTokens } : {}),
  }))
}

async function buildSessionExtractionSource(input: {
  directory: string
  sessionID: string
}): Promise<{
  fixture: EvaluationFixture
  source: ReturnType<typeof buildFilteredSessionSource>
}> {
  const messages = await loadSessionMessages(input)
  const learningEvents = (await listLearnerEventRecords(input.directory))
    .filter(
      (record) =>
        record.event.sessionId === input.sessionID &&
        SESSION_EXTRACTION_LEARNING_EVENT_TYPES.has(record.event.type),
    )
    .map((record) => record.event)
  const source = buildFilteredSessionSource({
    messages,
    learningEvents,
  })

  return {
    source,
    fixture: EvaluationFixtureSchema.parse({
      id: input.sessionID,
      title: `Buddy session ${input.sessionID}`,
      projectPath: input.directory,
      expected: {
        shouldExtract: true,
        notes: ["Real session extraction is governed by the attention gate."],
      },
      messages: toEvaluationMessagesFromFilteredSource(source),
      learningEvents,
    }),
  }
}

async function extractLearnerMemoryFromSession(input: {
  directory: string
  sessionID: string
  force?: boolean
}): Promise<SessionExtractionResult> {
  const config = await readProjectConfig(input.directory)
  const settings = readLearnerMemorySettings(config)
  if (!input.force && !learnerMemoryEnabled(config)) {
    return {
      enabled: false,
      sessionID: input.sessionID,
      candidateCount: 0,
      approvedCount: 0,
      memoryIds: [],
      skippedReason: "learner_memory_disabled",
    }
  }
  const sessionInfo = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => OpenCodeSession.get(SessionID.make(input.sessionID)),
  }).catch(() => undefined)
  if (
    !input.force &&
    internalLearnerMemorySession({
      sessionID: input.sessionID,
      title: sessionInfo?.title,
      parentID: sessionInfo?.parentID,
    })
  ) {
    return {
      enabled: true,
      sessionID: input.sessionID,
      candidateCount: 0,
      approvedCount: 0,
      memoryIds: [],
      skippedReason: "internal_learner_memory_session",
    }
  }

  await ensureLearnerMemoryLayout(input.directory)
  const { fixture, source } = await buildSessionExtractionSource({
    directory: input.directory,
    sessionID: input.sessionID,
  })
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "session_extraction_scanned",
      sessionId: input.sessionID,
      projectPath: input.directory,
      sourceKind: "real_session",
      sourceId: input.sessionID,
      searchableText: `Real Buddy session ${input.sessionID}`,
    }),
  )

  const claimOutcome = await tryClaimLearnerMemoryStageOneJob({
    directory: input.directory,
    sessionID: input.sessionID,
    workerID: `buddy_session_${safeExtractionSessionId(input.sessionID)}`,
    sourceUpdatedAt: source.sourceUpdatedAt,
    sourceFingerprint: source.sourceFingerprint,
    sourceMessageCount: source.sourceMessageCount,
    force: input.force,
  })
  if (!claimOutcome.claimed) {
    return {
      enabled: true,
      sessionID: input.sessionID,
      candidateCount: 0,
      approvedCount: 0,
      memoryIds: [],
      skippedReason: claimOutcome.reason,
    }
  }

  const decision = decideLearnerMemoryAttention(fixture, settings)
  if (!input.force && decision.decision === "skip") {
    await markLearnerMemoryStageOneJobSucceededNoOutput({
      directory: input.directory,
      claim: claimOutcome.claim,
    })
    await appendLearnerEvent(
      input.directory,
      createLearnerEvent({
        type: "session_extraction_skipped",
        sessionId: input.sessionID,
        projectPath: input.directory,
        sourceKind: "attention_gate",
        sourceId: input.sessionID,
        searchableText: `Learner memory extraction skipped for ${input.sessionID}: ${decision.reasons.join(", ")}`,
        payload: {
          score: decision.score,
          reasons: decision.reasons,
        },
      }),
    )
    return {
      enabled: true,
      sessionID: input.sessionID,
      decision,
      candidateCount: 0,
      approvedCount: 0,
      memoryIds: [],
      skippedReason: "attention_gate_skip",
    }
  }

  if (!input.force) {
    const budget = await tryClaimLearnerMemoryExtractionBudget({
      ...input,
      maxExtractionCallsPerSession: settings.maxExtractionCallsPerSession,
      maxExtractionCallsPerDay: settings.maxExtractionCallsPerDay,
    })
    if (!budget.claimed) {
      await releaseLearnerMemoryStageOneJobSkipped({
        directory: input.directory,
        claim: claimOutcome.claim,
      })
      await appendLearnerEvent(
        input.directory,
        createLearnerEvent({
          type: "session_extraction_skipped",
          sessionId: input.sessionID,
          projectPath: input.directory,
          sourceKind: "extraction_budget",
          sourceId: input.sessionID,
          searchableText: `Learner memory extraction skipped for ${input.sessionID}: ${budget.reason}`,
          payload: { reason: budget.reason },
        }),
      )
      return {
        enabled: true,
        sessionID: input.sessionID,
        decision,
        candidateCount: 0,
        approvedCount: 0,
        memoryIds: [],
        skippedReason: budget.reason,
      }
    }
  }

  const safeSessionID = safeExtractionSessionId(input.sessionID)
  try {
    const extractionModel = await OpenCodeInstance.provide({
      directory: input.directory,
      fn: async () => resolveLearnerMemoryExtractionModel(input.directory),
    })
    const truncatedSource = truncateSessionSource({
      source,
      tokenBudget: tokenBudgetFromContextWindow({
        contextWindow: extractionModel.model.limit.context,
        inputWindow: extractionModel.model.limit.input,
      }),
    })
    const extraction = await extractLearnerMemoryStageOneWithModel({
      directory: input.directory,
      fixture,
      source: truncatedSource,
      sessionID: `ses_learner_memory_${safeSessionID}`,
      messageID: `msg_learner_memory_${safeSessionID}`,
    })
    await appendLearnerEvent(
      input.directory,
      createLearnerEvent({
        type: "candidate_generated",
        sessionId: input.sessionID,
        projectPath: input.directory,
        sourceKind: "learner_memory_extraction",
        sourceId: input.sessionID,
        searchableText: `Learner memory extraction generated ${extraction.patches.length} candidates for ${input.sessionID}.`,
        payload: {
          candidateIds: extraction.patches.map((patch) => patch.id),
          model: extraction.model,
          sourceFingerprint: source.sourceFingerprint,
        },
      }),
    )
    await writeCandidatePatches(input.directory, extraction.patches)

    if (
      extraction.patches.length === 0 &&
      extraction.sessionSummary.trim().length === 0 &&
      extraction.rawLearnerMemory.trim().length === 0
    ) {
      await markLearnerMemoryStageOneJobSucceededNoOutput({
        directory: input.directory,
        claim: claimOutcome.claim,
      })
    } else {
      const now = new Date().toISOString()
      await markLearnerMemoryStageOneJobSucceeded({
        directory: input.directory,
        claim: claimOutcome.claim,
        output: {
          id: `stage1_${safeSessionID}`,
          schemaVersion: 1,
          sessionId: input.sessionID,
          projectPath: input.directory,
          sourceUpdatedAt: source.sourceUpdatedAt,
          sourceMessageCount: source.sourceMessageCount,
          sourceFingerprint: source.sourceFingerprint,
          attentionDecision: decision,
          truncation: {
            truncated: truncatedSource.truncation.truncated,
            estimatedOriginalTokens: truncatedSource.truncation.estimatedOriginalTokens,
            estimatedKeptTokens: truncatedSource.truncation.estimatedKeptTokens,
          },
          rolloutSummary: extraction.sessionSummary,
          ...(extraction.sessionSlug ? { rolloutSlug: extraction.sessionSlug } : {}),
          rawMemory: extraction.rawLearnerMemory,
          candidatePatches: extraction.patches,
          extractionModel: extraction.model,
          ...(extraction.usage ? { extractionUsage: extraction.usage } : {}),
          createdAt: now,
          updatedAt: now,
        },
      })
    }
    const consolidation = await runLearnerMemoryConsolidation({
      directory: input.directory,
      force: input.force,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      return {
        claimed: true,
        selectedCandidateCount: 0,
        memoryIds: [],
        consolidationError: message,
      }
    })

    return {
      enabled: true,
      sessionID: input.sessionID,
      decision,
      candidateCount: extraction.patches.length,
      approvedCount: consolidation.selectedCandidateCount,
      memoryIds: consolidation.memoryIds,
      ...("consolidationError" in consolidation
        ? { consolidationError: consolidation.consolidationError }
        : {}),
    }
  } catch (error) {
    await markLearnerMemoryStageOneJobFailed({
      directory: input.directory,
      claim: claimOutcome.claim,
      error,
    })
    throw error
  }
}

export { extractLearnerMemoryFromSession, learnerMemoryEnabled }
export type { SessionExtractionResult }
