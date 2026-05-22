import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import z from "zod"
import { LEARNER_MEMORY_NO_AUTOMATIC_MODEL_REASON, resolveLearnerMemoryModel } from "./models"
import { LearnerMemoryPath } from "./paths"
import { readProjectConfig } from "../../../config/runtime/config-access"
import { piRuntime } from "../../../pi-backend/runtime"
import { readLearnerMemorySettings } from "./settings"
import { LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY } from "./subagents/memory-consolidator"
import { LEARNER_MEMORY_CONSOLIDATION_TUNING } from "./tuning"
import {
  heartbeatLearnerMemoryPhaseTwoJob,
  markLearnerMemoryPhaseTwoJobFailed,
  markLearnerMemoryPhaseTwoJobSucceeded,
  pruneLearnerMemoryStageOneOutputs,
  selectLearnerMemoryStageOneOutputsForConsolidation,
  syncLearnerMemoryPhaseTwoArtifacts,
  tryClaimLearnerMemoryPhaseTwoJob,
} from "./stage-one-store"
import { appendLearnerEvent, createLearnerEvent } from "./storage"
import type { LearnerMemoryStageOneOutput } from "./types"

const CONSOLIDATION_OUTPUT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    selectedCandidateIds: {
      type: "array",
      items: { type: "string" },
    },
    rejectedCandidateIds: {
      type: "array",
      items: { type: "string" },
    },
    filesWritten: {
      type: "array",
      items: { type: "string" },
      minItems: LEARNER_MEMORY_CONSOLIDATION_TUNING.minimumReportedFilesWritten,
    },
    rationale: { type: "string" },
  },
  required: ["selectedCandidateIds", "rejectedCandidateIds", "filesWritten", "rationale"],
}
const JSON_CODE_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/iu

const ConsolidationModelOutputSchema = z.object({
  selectedCandidateIds: z.array(z.string().min(1)),
  rejectedCandidateIds: z.array(z.string().min(1)).default([]),
  filesWritten: z
    .array(z.string().min(1))
    .min(LEARNER_MEMORY_CONSOLIDATION_TUNING.minimumReportedFilesWritten),
  rationale: z.string().min(1),
})

type LearnerMemoryConsolidationResult = {
  claimed: boolean
  skippedReason?: string
  selectedCandidateCount: number
  memoryIds: string[]
}

function buildConsolidationPrompt(input: {
  directory: string
  outputs: readonly LearnerMemoryStageOneOutput[]
  rawMemoriesPath: string
  rolloutSummaryPaths: readonly string[]
  diff: {
    addedSessionIds: readonly string[]
    retainedSessionIds: readonly string[]
    removedSessionIds: readonly string[]
  }
}): string {
  return [
    `Learner memory root: ${LearnerMemoryPath.root(input.directory)}`,
    `Existing memory registry: ${LearnerMemoryPath.memoryRegistryFile(input.directory)}`,
    `Existing memory summary: ${LearnerMemoryPath.summaryFile(input.directory)}`,
    `Selected raw memories: ${input.rawMemoriesPath}`,
    "Selected rollout summaries:",
    ...(input.rolloutSummaryPaths.length > 0
      ? input.rolloutSummaryPaths.map((summaryPath) => `- ${summaryPath}`)
      : ["- none"]),
    "",
    `Selected stage-one outputs: ${input.outputs.length}`,
    `Added sessions: ${input.diff.addedSessionIds.join(", ") || "none"}`,
    `Retained sessions: ${input.diff.retainedSessionIds.join(", ") || "none"}`,
    `Removed sessions: ${input.diff.removedSessionIds.join(", ") || "none"}`,
    "",
    "Action required:",
    "1. Read the selected raw memories and rollout summaries.",
    "2. Read the existing memory registry and summary when present.",
    "3. Edit or write the memory registry and summary directly under the learner memory root.",
    "4. Merge, update, supersede, or skip duplicates in those files. Do not rely on app-level title matching.",
    "5. Return structured output only after the files are written.",
    "",
    "The selected candidate ids must be the source candidates represented in the files you wrote.",
    "The filesWritten field must include the absolute paths of the memory registry and memory summary.",
  ].join("\n")
}

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath)
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, "utf8")
  }
}

async function ensureConsolidationTargetFiles(directory: string): Promise<void> {
  await fs.mkdir(LearnerMemoryPath.root(directory), { recursive: true })
  await Promise.all([
    writeFileIfMissing(
      LearnerMemoryPath.memoryRegistryFile(directory),
      "# Learner Memory Registry\n\nNo consolidated learner memories yet.\n",
    ),
    writeFileIfMissing(
      LearnerMemoryPath.summaryFile(directory),
      "# Learner Memory Summary\n\nNo consolidated learner memories yet.\n",
    ),
  ])
}

async function assertConsolidationFilesExist(directory: string): Promise<void> {
  await Promise.all([
    fs.access(LearnerMemoryPath.memoryRegistryFile(directory)),
    fs.access(LearnerMemoryPath.summaryFile(directory)),
  ])
}

async function resolveExistingPath(filePath: string): Promise<string> {
  return fs.realpath(filePath).catch(() => path.resolve(filePath))
}

async function assertConsolidationOutputReferencesTargetFiles(input: {
  directory: string
  filesWritten: readonly string[]
}): Promise<void> {
  const writtenFiles = new Set(
    await Promise.all(
      input.filesWritten.map((filePath) =>
        resolveExistingPath(path.resolve(input.directory, filePath)),
      ),
    ),
  )
  const requiredFiles = await Promise.all(
    [
      LearnerMemoryPath.memoryRegistryFile(input.directory),
      LearnerMemoryPath.summaryFile(input.directory),
    ].map((filePath) => resolveExistingPath(filePath)),
  )
  for (const requiredFile of requiredFiles) {
    if (!writtenFiles.has(requiredFile)) {
      throw new Error(`Learner memory consolidation did not report writing ${requiredFile}`)
    }
  }
}

async function runConsolidationSubagent(input: {
  directory: string
  model: NonNullable<Awaited<ReturnType<typeof resolveLearnerMemoryModel>>>
  prompt: string
}): Promise<z.infer<typeof ConsolidationModelOutputSchema>> {
  const result = await piRuntime.runSubagent({
    directory: input.directory,
    systemPrompt:
      "You are Buddy's learner-memory consolidation agent. Return only JSON after writing the requested files.",
    agent: LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY,
    description: "Learner memory consolidation",
    task: [
      input.prompt,
      "",
      "Return only JSON matching this schema:",
      JSON.stringify(CONSOLIDATION_OUTPUT_JSON_SCHEMA),
    ].join("\n"),
    model: input.model.model,
  })
  const fenced = JSON_CODE_FENCE_PATTERN.exec(result.output)?.[1]
  return ConsolidationModelOutputSchema.parse(JSON.parse((fenced ?? result.output).trim()))
}

async function recordSelectedCandidateUsage(input: {
  directory: string
  outputs: readonly LearnerMemoryStageOneOutput[]
  selectedCandidateIds: readonly string[]
}): Promise<void> {
  for (const candidateID of input.selectedCandidateIds) {
    const sourceOutput = input.outputs.find((output) =>
      output.candidatePatches.some((candidate) => candidate.id === candidateID),
    )
    await appendLearnerEvent(
      input.directory,
      createLearnerEvent({
        type: "memory_applied",
        sessionId: sourceOutput?.sessionId,
        projectPath: sourceOutput?.projectPath ?? input.directory,
        sourceKind: "learner_memory_consolidation",
        sourceId: candidateID,
        searchableText: `Consolidated learner-memory candidate: ${candidateID}`,
        payload: {
          candidateId: candidateID,
        },
      }),
    )
  }
}

async function runLearnerMemoryConsolidation(input: {
  directory: string
  force?: boolean
}): Promise<LearnerMemoryConsolidationResult> {
  const claimOutcome = await tryClaimLearnerMemoryPhaseTwoJob({
    directory: input.directory,
    workerID: `buddy_phase_two_${ulid()}`,
    force: input.force,
  })
  if (!claimOutcome.claimed) {
    return {
      claimed: false,
      skippedReason: claimOutcome.reason,
      selectedCandidateCount: 0,
      memoryIds: [],
    }
  }

  const heartbeat = setInterval(() => {
    heartbeatLearnerMemoryPhaseTwoJob({
      directory: input.directory,
      claim: claimOutcome.claim,
    }).catch((error) => {
      console.warn("Learner memory phase-two heartbeat failed:", error)
    })
  }, LEARNER_MEMORY_CONSOLIDATION_TUNING.heartbeatIntervalMs)

  try {
    const settings = readLearnerMemorySettings(await readProjectConfig(input.directory))
    await pruneLearnerMemoryStageOneOutputs({
      directory: input.directory,
      maxUnusedDays: settings.maxUnusedStageOneDays,
    })
    const selection = await selectLearnerMemoryStageOneOutputsForConsolidation({
      directory: input.directory,
      limit: settings.maxRawMemoriesForConsolidation,
    })
    const outputs = selection.outputs
    const artifacts = await syncLearnerMemoryPhaseTwoArtifacts({
      directory: input.directory,
      outputs,
    })

    if (outputs.length === 0) {
      await markLearnerMemoryPhaseTwoJobSucceeded({
        directory: input.directory,
        claim: claimOutcome.claim,
        selectedSessionIds: [],
      })
      return {
        claimed: true,
        selectedCandidateCount: 0,
        memoryIds: [],
      }
    }
    await ensureConsolidationTargetFiles(input.directory)

    const model = await resolveLearnerMemoryModel({
      directory: input.directory,
      purpose: "consolidate",
      allowGenericFallback: input.force === true,
    })
    if (!model) {
      await markLearnerMemoryPhaseTwoJobFailed({
        directory: input.directory,
        claim: claimOutcome.claim,
        error: new Error(LEARNER_MEMORY_NO_AUTOMATIC_MODEL_REASON),
      })
      return {
        claimed: true,
        skippedReason: LEARNER_MEMORY_NO_AUTOMATIC_MODEL_REASON,
        selectedCandidateCount: 0,
        memoryIds: [],
      }
    }
    const parsed = await runConsolidationSubagent({
      directory: input.directory,
      model,
      prompt: buildConsolidationPrompt({
        directory: input.directory,
        outputs,
        rawMemoriesPath: artifacts.rawMemoriesPath,
        rolloutSummaryPaths: artifacts.rolloutSummaryPaths,
        diff: selection.diff,
      }),
    })
    await assertConsolidationOutputReferencesTargetFiles({
      directory: input.directory,
      filesWritten: parsed.filesWritten,
    })
    await assertConsolidationFilesExist(input.directory)
    await recordSelectedCandidateUsage({
      directory: input.directory,
      outputs,
      selectedCandidateIds: parsed.selectedCandidateIds,
    })
    await markLearnerMemoryPhaseTwoJobSucceeded({
      directory: input.directory,
      claim: claimOutcome.claim,
      selectedSessionIds: outputs.map((output) => output.sessionId),
    })

    return {
      claimed: true,
      selectedCandidateCount: parsed.selectedCandidateIds.length,
      memoryIds: parsed.selectedCandidateIds,
    }
  } catch (error) {
    await markLearnerMemoryPhaseTwoJobFailed({
      directory: input.directory,
      claim: claimOutcome.claim,
      error,
    })
    throw error
  } finally {
    clearInterval(heartbeat)
  }
}

export { runLearnerMemoryConsolidation }
export type { LearnerMemoryConsolidationResult }
