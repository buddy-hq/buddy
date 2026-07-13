import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { SessionPrompt as OpenCodeSessionPrompt } from "@buddy/opencode-adapter/session-prompt"
import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import z from "zod"
import { LEARNER_MEMORY_NO_AUTOMATIC_MODEL_REASON, resolveLearnerMemoryModel } from "./models"
import { LearnerMemoryPath } from "./paths"
import { readProjectConfig, syncOpenCodeProjectConfig } from "../../../config/runtime"
import { readLearnerMemorySettings } from "./settings"
import { LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY } from "./subagents/memory-consolidator"
import { LEARNER_MEMORY_CONSOLIDATION_SESSION_TITLE } from "./internal-session"
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
import { parseLearnerMemoryRegistry } from "./memory-registry-markdown"
import { writeTextFileAtomic } from "../../../storage/atomic-file"
import {
  publishConsolidationGeneration,
  withRecoveredConsolidationPublication,
} from "./consolidation-publication"

const CONSOLIDATION_TOOLS: Record<string, boolean> = {
  apply_patch: false,
  bash: false,
  batch: false,
  codesearch: false,
  edit: true,
  glob: true,
  grep: true,
  list: false,
  lsp: false,
  question: false,
  read: true,
  skill: false,
  task: false,
  todoread: false,
  todowrite: false,
  webfetch: false,
  websearch: false,
  write: true,
}
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

const ConsolidationModelOutputSchema = z.object({
  selectedCandidateIds: z.array(z.string().min(1)),
  rejectedCandidateIds: z.array(z.string().min(1)).default([]),
  filesWritten: z
    .array(z.string().min(1))
    .min(LEARNER_MEMORY_CONSOLIDATION_TUNING.minimumReportedFilesWritten),
  rationale: z.string().min(1),
})

const CONSOLIDATION_STAGING_DIRECTORY_PREFIX = ".consolidation-"
const CONSOLIDATION_STAGING_DIRECTORY_SUFFIX = ".tmp"
const MEMORY_REGISTRY_HEADING = "# Memory Registry"
const MEMORY_SUMMARY_HEADING = "# Memory Summary"
const EMPTY_MEMORY_REGISTRY = `${MEMORY_REGISTRY_HEADING}\n\nNo consolidated memories yet.\n`
const EMPTY_MEMORY_SUMMARY = `${MEMORY_SUMMARY_HEADING}\n\nNo consolidated memories yet.\n`

type LearnerMemoryConsolidationResult = {
  claimed: boolean
  skippedReason?: string
  selectedCandidateCount: number
  memoryIds: string[]
}

function buildConsolidationPrompt(input: {
  directory: string
  memoryRegistryPath: string
  memorySummaryPath: string
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
    `Staged memory registry: ${input.memoryRegistryPath}`,
    `Staged memory summary: ${input.memorySummaryPath}`,
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
    "3. Edit only the staged memory registry and staged summary paths listed above.",
    "4. Merge, update, supersede, or skip duplicates in those files. Do not rely on app-level title matching.",
    "5. Classify every candidate id exactly once as selected or rejected.",
    "6. Return structured output only after the files are written.",
    "",
    "The selected candidate ids must be the source candidates represented in the files you wrote.",
    "The filesWritten field must include the absolute paths of the memory registry and memory summary.",
  ].join("\n")
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values))
}

async function memoryRootPermissionPatterns(input: {
  directory: string
  worktree: string
  editableRoot: string
}): Promise<{ read: string[]; edit: string[]; write: string[]; externalDirectory: string[] }> {
  const memoryRoot = LearnerMemoryPath.root(input.directory)
  const realMemoryRoot = await fs.realpath(memoryRoot).catch(() => memoryRoot)
  const realEditableRoot = await fs.realpath(input.editableRoot).catch(() => input.editableRoot)
  const read = uniqueStrings([path.join(memoryRoot, "*"), path.join(realMemoryRoot, "*")])
  const editablePatterns = uniqueStrings([
    path.join(input.editableRoot, "*"),
    path.join(realEditableRoot, "*"),
  ])
  const externalDirectory = uniqueStrings([
    memoryRoot,
    realMemoryRoot,
    input.editableRoot,
    realEditableRoot,
    ...read,
    ...editablePatterns,
  ])
  const edit = uniqueStrings([
    ...editablePatterns,
    path.join(path.relative(input.worktree, input.editableRoot), "*"),
    path.join(path.relative(input.worktree, realEditableRoot), "*"),
  ])
  return { read, edit, write: edit, externalDirectory }
}

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath)
  } catch {
    await writeTextFileAtomic(filePath, content)
  }
}

async function ensureConsolidationTargetFiles(directory: string): Promise<void> {
  await fs.mkdir(LearnerMemoryPath.root(directory), { recursive: true })
  await Promise.all([
    writeFileIfMissing(
      LearnerMemoryPath.memoryRegistryFile(directory),
      EMPTY_MEMORY_REGISTRY,
    ),
    writeFileIfMissing(
      LearnerMemoryPath.summaryFile(directory),
      EMPTY_MEMORY_SUMMARY,
    ),
  ])
}

type ConsolidationStagingTargets = {
  root: string
  memoryRegistryPath: string
  memorySummaryPath: string
  baseMemoryRegistry: string
  baseMemorySummary: string
}

async function createConsolidationStagingTargets(
  directory: string,
): Promise<ConsolidationStagingTargets> {
  const root = path.join(
    LearnerMemoryPath.root(directory),
    `${CONSOLIDATION_STAGING_DIRECTORY_PREFIX}${ulid()}${CONSOLIDATION_STAGING_DIRECTORY_SUFFIX}`,
  )
  const memoryRegistryPath = path.join(
    root,
    path.basename(LearnerMemoryPath.memoryRegistryFile(directory)),
  )
  const memorySummaryPath = path.join(root, path.basename(LearnerMemoryPath.summaryFile(directory)))
  try {
    return await withRecoveredConsolidationPublication(directory, async () => {
      await ensureConsolidationTargetFiles(directory)
      const [baseMemoryRegistry, baseMemorySummary] = await Promise.all([
        fs.readFile(LearnerMemoryPath.memoryRegistryFile(directory), "utf8"),
        fs.readFile(LearnerMemoryPath.summaryFile(directory), "utf8"),
      ])
      await Promise.all([
        writeTextFileAtomic(memoryRegistryPath, baseMemoryRegistry),
        writeTextFileAtomic(memorySummaryPath, baseMemorySummary),
      ])
      return {
        root,
        memoryRegistryPath,
        memorySummaryPath,
        baseMemoryRegistry,
        baseMemorySummary,
      }
    })
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

function assertCandidateDisposition(input: {
  outputs: readonly LearnerMemoryStageOneOutput[]
  selectedCandidateIds: readonly string[]
  rejectedCandidateIds: readonly string[]
}): void {
  const available = new Set(
    input.outputs.flatMap((output) => output.candidatePatches.map((candidate) => candidate.id)),
  )
  const selected = new Set(input.selectedCandidateIds)
  const rejected = new Set(input.rejectedCandidateIds)
  if (
    selected.size !== input.selectedCandidateIds.length ||
    rejected.size !== input.rejectedCandidateIds.length
  ) {
    throw new Error("Memory consolidation reported duplicate candidate ids.")
  }
  for (const candidateID of selected) {
    if (!available.has(candidateID) || rejected.has(candidateID)) {
      throw new Error(`Memory consolidation reported an invalid selected candidate: ${candidateID}`)
    }
  }
  for (const candidateID of rejected) {
    if (!available.has(candidateID)) {
      throw new Error(`Memory consolidation reported an invalid rejected candidate: ${candidateID}`)
    }
  }
  if (selected.size + rejected.size !== available.size) {
    throw new Error("Memory consolidation must classify every selected source candidate.")
  }
}

async function validateAndPublishConsolidation(input: {
  directory: string
  staging: ConsolidationStagingTargets
}): Promise<void> {
  const [registryMarkdown, summaryMarkdown] = await Promise.all([
    fs.readFile(input.staging.memoryRegistryPath, "utf8"),
    fs.readFile(input.staging.memorySummaryPath, "utf8"),
  ])
  const registry = parseLearnerMemoryRegistry(registryMarkdown)
  if (registry.invalidBlocks.length > 0) {
    throw new Error("Memory consolidation produced an invalid memory registry.")
  }
  if (registryMarkdown.split(/\r?\n/u)[0]?.trim() !== MEMORY_REGISTRY_HEADING) {
    throw new Error("Memory consolidation produced a registry without its required heading.")
  }
  if (new Set(registry.memories.map((memory) => memory.id)).size !== registry.memories.length) {
    throw new Error("Memory consolidation produced duplicate memory ids.")
  }
  if (summaryMarkdown.split(/\r?\n/u)[0]?.trim() !== MEMORY_SUMMARY_HEADING) {
    throw new Error("Memory consolidation produced a summary without its required heading.")
  }

  await publishConsolidationGeneration({
    directory: input.directory,
    expectedRegistryMarkdown: input.staging.baseMemoryRegistry,
    expectedSummaryMarkdown: input.staging.baseMemorySummary,
    registryMarkdown,
    summaryMarkdown,
  })
}

async function resolveExistingPath(filePath: string): Promise<string> {
  return fs.realpath(filePath).catch(() => path.resolve(filePath))
}

async function assertConsolidationOutputReferencesTargetFiles(input: {
  directory: string
  filesWritten: readonly string[]
  requiredFiles: readonly string[]
}): Promise<void> {
  const writtenFiles = new Set(
    await Promise.all(
      input.filesWritten.map((filePath) =>
        resolveExistingPath(path.resolve(input.directory, filePath)),
      ),
    ),
  )
  const requiredFiles = await Promise.all(input.requiredFiles.map(resolveExistingPath))
  for (const requiredFile of requiredFiles) {
    if (!writtenFiles.has(requiredFile)) {
      throw new Error(`Memory consolidation did not report writing ${requiredFile}`)
    }
  }
}

async function runConsolidationSubagent(input: {
  directory: string
  model: NonNullable<Awaited<ReturnType<typeof resolveLearnerMemoryModel>>>
  prompt: string
  editableRoot: string
}): Promise<z.infer<typeof ConsolidationModelOutputSchema>> {
  const permissionPatterns = await memoryRootPermissionPatterns({
    directory: input.directory,
    worktree: OpenCodeInstance.worktree,
    editableRoot: input.editableRoot,
  })
  const session = await OpenCodeSession.create({
    title: LEARNER_MEMORY_CONSOLIDATION_SESSION_TITLE,
    permission: [
      { permission: "*", pattern: "*", action: "deny" },
      { permission: "read", pattern: "*", action: "deny" },
      { permission: "edit", pattern: "*", action: "deny" },
      { permission: "write", pattern: "*", action: "deny" },
      { permission: "glob", pattern: "*", action: "allow" },
      { permission: "grep", pattern: "*", action: "allow" },
      ...permissionPatterns.externalDirectory.map((pattern) => ({
        permission: "external_directory" as const,
        pattern,
        action: "allow" as const,
      })),
      ...permissionPatterns.read.map((pattern) => ({
        permission: "read" as const,
        pattern,
        action: "allow" as const,
      })),
      ...permissionPatterns.edit.map((pattern) => ({
        permission: "edit" as const,
        pattern,
        action: "allow" as const,
      })),
      ...permissionPatterns.write.map((pattern) => ({
        permission: "write" as const,
        pattern,
        action: "allow" as const,
      })),
    ],
  })
  try {
    const result = await OpenCodeSessionPrompt.prompt({
      sessionID: SessionID.make(session.id),
      messageID: MessageID.ascending(),
      model: {
        providerID: ProviderID.make(input.model.providerID),
        modelID: ModelID.make(input.model.modelID),
      },
      agent: LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY,
      format: {
        type: "json_schema",
        schema: CONSOLIDATION_OUTPUT_JSON_SCHEMA,
        retryCount: LEARNER_MEMORY_CONSOLIDATION_TUNING.modelRetries,
      },
      tools: CONSOLIDATION_TOOLS,
      parts: [{ type: "text", text: input.prompt }],
    })
    return ConsolidationModelOutputSchema.parse(
      result.info.role === "assistant" ? result.info.structured : undefined,
    )
  } finally {
    await OpenCodeSession.setArchived({
      sessionID: SessionID.make(session.id),
      time: Date.now(),
    })
  }
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
  const settings = readLearnerMemorySettings(await readProjectConfig(input.directory))
  if (!settings.enabled) {
    return {
      claimed: false,
      skippedReason: "Memory is not enabled for this notebook",
      selectedCandidateCount: 0,
      memoryIds: [],
    }
  }

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
  let staging: ConsolidationStagingTargets | undefined

  try {
    await syncOpenCodeProjectConfig(input.directory)
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
    const activeStaging = await createConsolidationStagingTargets(input.directory)
    staging = activeStaging

    const model = await OpenCodeInstance.provide({
      directory: input.directory,
      fn: async () =>
        resolveLearnerMemoryModel({
          directory: input.directory,
          purpose: "consolidate",
          allowGenericFallback: input.force === true,
        }),
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
    const parsed = await OpenCodeInstance.provide({
      directory: input.directory,
      fn: async () =>
        runConsolidationSubagent({
          directory: input.directory,
          model,
          editableRoot: activeStaging.root,
          prompt: buildConsolidationPrompt({
            directory: input.directory,
            memoryRegistryPath: activeStaging.memoryRegistryPath,
            memorySummaryPath: activeStaging.memorySummaryPath,
            outputs,
            rawMemoriesPath: artifacts.rawMemoriesPath,
            rolloutSummaryPaths: artifacts.rolloutSummaryPaths,
            diff: selection.diff,
          }),
        }),
    })
    await assertConsolidationOutputReferencesTargetFiles({
      directory: activeStaging.root,
      filesWritten: parsed.filesWritten,
      requiredFiles: [activeStaging.memoryRegistryPath, activeStaging.memorySummaryPath],
    })
    assertCandidateDisposition({
      outputs,
      selectedCandidateIds: parsed.selectedCandidateIds,
      rejectedCandidateIds: parsed.rejectedCandidateIds,
    })
    await validateAndPublishConsolidation({
      directory: input.directory,
      staging: activeStaging,
    })
    await recordSelectedCandidateUsage({
      directory: input.directory,
      outputs,
      selectedCandidateIds: parsed.selectedCandidateIds,
    }).catch((error) => {
      console.warn("Failed to record consolidated learner-memory candidate usage:", error)
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
    if (staging) {
      await fs.rm(staging.root, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

export {
  createConsolidationStagingTargets,
  runLearnerMemoryConsolidation,
  validateAndPublishConsolidation,
}
export type { ConsolidationStagingTargets, LearnerMemoryConsolidationResult }
