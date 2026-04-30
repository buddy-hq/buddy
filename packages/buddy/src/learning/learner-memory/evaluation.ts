import { LearnerMemoryPath } from "./paths"
import { decideLearnerMemoryAttention } from "./attention-gate"
import { readProjectConfig } from "../../config/runtime"
import {
  extractCandidatePatchesDeterministic,
  extractCandidatePatchesWithModel,
  type ModelExtractionResult,
} from "./extractor"
import { defaultEvaluationFixtures } from "./fixtures/default-fixtures"
import { regenerateLearnerMemoryMarkdown } from "./markdown"
import { searchLearnerMemory } from "./retrieval"
import { LEARNER_MEMORY_EVALUATION_TUNING } from "./tuning"
import { readLearnerMemorySettings } from "./settings"
import {
  appendLearnerEvent,
  createLearnerEvent,
  deleteLearnerMemory,
  editLearnerMemory,
  ensureLearnerMemoryLayout,
  hideLearnerMemory,
  memoryFromCandidate,
  rejectLearnerMemory,
  writeCandidatePatches,
  writeJsonFile,
  writeLearnerMemory,
} from "./storage"
import type {
  AttentionDecision,
  CandidateMemoryPatch,
  EvaluationFixture,
  EvaluationReport,
} from "./types"
import { EvaluationReportSchema } from "./types"

type ExtractionMode = "model" | "deterministic"
type RubricResult = EvaluationReport["rubricResults"][number]
type TeachingEvalResult = EvaluationReport["teachingEvalResults"][number]
type CorrectionResult = EvaluationReport["correctionResults"][number]

function approvedCandidatePatches(
  patches: readonly CandidateMemoryPatch[],
): CandidateMemoryPatch[] {
  return patches.filter(
    (patch) =>
      patch.operation === "create" &&
      patch.confidence >= LEARNER_MEMORY_EVALUATION_TUNING.candidateApprovalConfidenceThreshold,
  )
}

function expectedDecisionFailures(input: {
  fixtures: readonly EvaluationFixture[]
  decisions: readonly AttentionDecision[]
}): string[] {
  const byFixture = new Map(input.fixtures.map((fixture) => [fixture.id, fixture]))
  const failures: string[] = []

  for (const decision of input.decisions) {
    const fixture = byFixture.get(decision.fixtureId)
    if (!fixture) continue
    const expected = fixture.expected.shouldExtract ? "extract" : "skip"
    if (decision.decision !== expected) {
      failures.push(
        `${fixture.id}: expected ${expected}, got ${decision.decision} (${decision.reasons.join(", ")})`,
      )
    }
  }

  return failures
}

function rubricResults(input: {
  fixtures: readonly EvaluationFixture[]
  patches: readonly CandidateMemoryPatch[]
}): RubricResult[] {
  return input.fixtures.map((fixture) => {
    const fixturePatches = input.patches.filter((patch) => patch.fixtureId === fixture.id)
    const reasons: string[] = []

    if (!fixture.expected.shouldExtract && fixturePatches.length > 0) {
      reasons.push("unexpected_candidate")
    }
    if (fixture.expected.shouldExtract && fixturePatches.length === 0) {
      reasons.push("missing_candidate")
    }

    const expectedTypes = fixture.expected.memoryTypes ?? []
    if (
      expectedTypes.length > 0 &&
      !fixturePatches.some((patch) => expectedTypes.includes(patch.memoryType))
    ) {
      reasons.push(`missing_expected_type:${expectedTypes.join(",")}`)
    }

    for (const patch of fixturePatches) {
      if (patch.sourceMessageIds.length === 0 && patch.sourceEventIds.length === 0) {
        reasons.push(`missing_sources:${patch.id}`)
      }
      const text = `${patch.title} ${patch.body}`.toLowerCase()
      const rejectedPhrase = fixture.expected.rejectIfContains?.find((phrase) =>
        text.includes(phrase.toLowerCase()),
      )
      if (rejectedPhrase) {
        reasons.push(`contains_rejected_phrase:${rejectedPhrase}`)
      }
    }

    return {
      fixtureId: fixture.id,
      passed: reasons.length === 0,
      reasons,
    }
  })
}

function teachingEvalResults(input: {
  memories: readonly string[]
  retrievedBridgeMemoryIds: readonly string[]
}): TeachingEvalResult[] {
  const memoryOff =
    "We can explain bridge validation by reviewing UI, bridge, and backend route responsibilities."
  const memoryOn =
    input.retrievedBridgeMemoryIds.length > 0
      ? "Use the learner's prior bridge-validation memory: start with concrete boundary examples, then ask them to classify UI, bridge, and backend route validation before implementation."
      : memoryOff
  const reasons = [
    ...(input.retrievedBridgeMemoryIds.length > 0 ? [] : ["no_retrieved_memory"]),
    ...(input.memories.length > 0 ? [] : ["no_approved_memories"]),
  ]

  return [
    {
      name: "bridge_validation_teaching_adaptation",
      memoryOff,
      memoryOn,
      passed: reasons.length === 0 && memoryOn !== memoryOff,
      reasons,
    },
  ]
}

async function applyApprovedCandidates(input: {
  directory: string
  patches: readonly CandidateMemoryPatch[]
  fixtures: readonly EvaluationFixture[]
}): Promise<string[]> {
  const fixtureById = new Map(input.fixtures.map((fixture) => [fixture.id, fixture]))
  const memoryIds: string[] = []

  for (const patch of input.patches) {
    const fixture = fixtureById.get(patch.fixtureId)
    const memory = memoryFromCandidate({
      patch,
      source: "model_candidate",
      projectPath: fixture?.projectPath,
    })
    await writeLearnerMemory(input.directory, memory)
    await appendLearnerEvent(
      input.directory,
      createLearnerEvent({
        type: "memory_applied",
        sourceKind: "candidate_memory_patch",
        sourceId: patch.id,
        searchableText: `Applied candidate learner memory: ${memory.title}`,
        payload: {
          memoryId: memory.id,
          fixtureId: patch.fixtureId,
        },
      }),
    )
    memoryIds.push(memory.id)
  }

  return memoryIds
}

async function runCorrectionChecks(input: {
  directory: string
  memoryIds: readonly string[]
}): Promise<CorrectionResult[]> {
  const results: CorrectionResult[] = []
  const hiddenMemoryId = input.memoryIds[0]
  if (hiddenMemoryId) {
    await hideLearnerMemory({
      directory: input.directory,
      memoryId: hiddenMemoryId,
      reason: "Correction dominance check",
    })
    const hiddenSearchResults = await searchLearnerMemory({
      directory: input.directory,
      query: "bridge validation boundary structured errors",
      projectPath: "/Users/prashantbhudwal/Code/buddy",
      limit: 5,
    })
    const passed = hiddenSearchResults.every((result) => result.memory.id !== hiddenMemoryId)
    results.push({
      action: "hide",
      memoryId: hiddenMemoryId,
      passed,
      reasons: passed ? [] : ["hidden_memory_returned"],
    })
  }

  const rejectedMemoryId = input.memoryIds[1]
  if (rejectedMemoryId) {
    await rejectLearnerMemory({
      directory: input.directory,
      memoryId: rejectedMemoryId,
      reason: "Correction dominance check",
    })
    const rejectedSearchResults = await searchLearnerMemory({
      directory: input.directory,
      query: "examples theory database indexing",
      projectPath: "/Users/prashantbhudwal/Code/buddy",
      limit: 5,
    })
    const passed = rejectedSearchResults.every((result) => result.memory.id !== rejectedMemoryId)
    results.push({
      action: "reject",
      memoryId: rejectedMemoryId,
      passed,
      reasons: passed ? [] : ["rejected_memory_returned"],
    })
  }

  const editedMemoryId = input.memoryIds[2]
  if (editedMemoryId) {
    const edited = await editLearnerMemory({
      directory: input.directory,
      memoryId: editedMemoryId,
      title: "Edited learner memory check",
      reason: "Correction dominance check",
    })
    results.push({
      action: "edit",
      memoryId: editedMemoryId,
      passed: edited?.title === "Edited learner memory check",
      reasons: edited?.title === "Edited learner memory check" ? [] : ["edit_not_applied"],
    })
  }

  const deletedMemoryId = input.memoryIds[3]
  if (deletedMemoryId) {
    const deleted = await deleteLearnerMemory({
      directory: input.directory,
      memoryId: deletedMemoryId,
      reason: "Correction dominance check",
    })
    const deletedSearchResults = await searchLearnerMemory({
      directory: input.directory,
      query: "renderer route schema validation",
      projectPath: "/Users/prashantbhudwal/Code/buddy",
      limit: 5,
    })
    const passed =
      deleted && deletedSearchResults.every((result) => result.memory.id !== deletedMemoryId)
    results.push({
      action: "delete",
      memoryId: deletedMemoryId,
      passed,
      reasons: passed ? [] : ["deleted_memory_returned"],
    })
  }

  return results
}

async function runLearnerMemoryEvaluation(input: {
  directory: string
  fixtures?: readonly EvaluationFixture[]
  extractionMode?: ExtractionMode
}): Promise<EvaluationReport> {
  const extractionMode = input.extractionMode ?? "model"
  const fixtures = [...(input.fixtures ?? defaultEvaluationFixtures)]
  const settings = readLearnerMemorySettings(await readProjectConfig(input.directory))
  await ensureLearnerMemoryLayout(input.directory)

  for (const fixture of fixtures) {
    for (const event of fixture.learningEvents) {
      await appendLearnerEvent(input.directory, event)
    }
  }

  const attentionDecisions = fixtures.map((fixture) =>
    decideLearnerMemoryAttention(fixture, settings),
  )
  const eligibleFixtures = fixtures.filter((fixture) =>
    attentionDecisions.some(
      (decision) => decision.fixtureId === fixture.id && decision.decision === "extract",
    ),
  )
  const modelExtractions: ModelExtractionResult[] = []
  const candidatePatches: CandidateMemoryPatch[] = []
  if (extractionMode === "model") {
    for (const fixture of eligibleFixtures) {
      const result = await extractCandidatePatchesWithModel({
        directory: input.directory,
        fixture,
        sessionID: `ses_learner_memory_${fixture.id}`,
      })
      modelExtractions.push(result)
      candidatePatches.push(...result.patches)
    }
  } else {
    candidatePatches.push(
      ...eligibleFixtures.flatMap((fixture) => extractCandidatePatchesDeterministic(fixture)),
    )
  }
  await writeCandidatePatches(input.directory, candidatePatches)

  const approved = approvedCandidatePatches(candidatePatches)
  const approvedMemoryIds = await applyApprovedCandidates({
    directory: input.directory,
    patches: approved,
    fixtures,
  })
  await regenerateLearnerMemoryMarkdown(input.directory)

  const retrievalQueries = [
    "bridge validation boundary structured errors",
    "examples before theory explanation preference",
    "database indexing theory first",
  ]
  const retrievalResults = []
  let bridgeRetrievalMemoryIds: string[] = []
  for (const query of retrievalQueries) {
    const results = await searchLearnerMemory({
      directory: input.directory,
      query,
      projectPath: "/Users/prashantbhudwal/Code/buddy",
      limit: 3,
      recordUsage: true,
    })
    retrievalResults.push({
      query,
      topMemoryIds: results.map((result) => result.memory.id),
    })
    if (query === retrievalQueries[0]) {
      bridgeRetrievalMemoryIds = results.map((result) => result.memory.id)
    }
  }

  const rubric = rubricResults({ fixtures, patches: candidatePatches })
  const teachingEval = teachingEvalResults({
    memories: approvedMemoryIds,
    retrievedBridgeMemoryIds: bridgeRetrievalMemoryIds,
  })
  const correctionResults = await runCorrectionChecks({
    directory: input.directory,
    memoryIds: approvedMemoryIds,
  })
  await regenerateLearnerMemoryMarkdown(input.directory)

  const failures = expectedDecisionFailures({ fixtures, decisions: attentionDecisions })
    .concat(
      rubric.flatMap((result) =>
        result.passed ? [] : [`${result.fixtureId}: ${result.reasons.join(", ")}`],
      ),
    )
    .concat(
      teachingEval.flatMap((result) =>
        result.passed ? [] : [`${result.name}: ${result.reasons.join(", ")}`],
      ),
    )
    .concat(
      correctionResults.flatMap((result) =>
        result.passed ? [] : [`${result.action}:${result.memoryId}: ${result.reasons.join(", ")}`],
      ),
    )
  const report = EvaluationReportSchema.parse({
    generatedAt: new Date().toISOString(),
    root: LearnerMemoryPath.root(input.directory),
    extractionMode,
    ...(modelExtractions[0] ? { extractionModel: modelExtractions[0].model } : {}),
    fixtureCount: fixtures.length,
    extractionCalls: eligibleFixtures.length,
    attentionDecisions,
    candidateCount: candidatePatches.length,
    approvedCount: approved.length,
    retrievalResults,
    rubricResults: rubric,
    teachingEvalResults: teachingEval,
    correctionResults,
    failures,
  })

  await writeJsonFile(LearnerMemoryPath.evaluationReportFile(input.directory), report)
  return report
}

export { runLearnerMemoryEvaluation }
