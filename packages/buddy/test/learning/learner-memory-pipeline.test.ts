import fs from "node:fs/promises"
import { describe, expect, test } from "bun:test"
import type { SessionV2 } from "@buddy/opencode-adapter/session-v2"
import { SessionV2 as SessionV2Schema } from "@buddy/opencode-adapter/session-v2"
import { Schema } from "effect"
import {
  createLearnerEvent,
  decideLearnerMemoryAttention,
  LearnerMemoryPath,
  markLearnerMemoryPhaseTwoJobSucceeded,
  listLearnerMemoryStageOneOutputs,
  markLearnerMemoryStageOneJobFailed,
  markLearnerMemoryStageOneJobSucceeded,
  markLearnerMemoryStageOneJobSucceededNoOutput,
  selectLearnerMemoryStageOneOutputsForConsolidation,
  syncLearnerMemoryPhaseTwoArtifacts,
  tryClaimLearnerMemoryExtractionBudget,
  tryClaimLearnerMemoryPhaseTwoJob,
  tryClaimLearnerMemoryStageOneJob,
} from "../../src/learning/features/memory"
import {
  parseLearnerMemoryRegistry,
  renderRegistryMarkdown,
} from "../../src/learning/features/memory/memory-registry-markdown"
import { redactSecrets } from "../../src/learning/features/memory/redaction"
import { buildFilteredSessionSource } from "../../src/learning/features/memory/session-source"
import { truncateHeadTail } from "../../src/learning/features/memory/text-budget"
import { tmpdir } from "../helpers/tmpdir"

describe("learner memory Codex-aligned pipeline mechanics", () => {
  test("preserves file and agent attachment source text in extraction source text", () => {
    const userMessage = Schema.decodeUnknownSync(SessionV2Schema.Message)({
      id: "msg_user",
      type: "user",
      text: "Use the attached learning materials.",
      files: [
        {
          name: "worked-example.md",
          mime: "text/markdown",
          uri: "file:///worked-example.md",
          source: {
            start: 0,
            end: 42,
            text: "The learner benefits from fully worked examples.",
          },
        },
      ],
      agents: [
        {
          name: "teaching-assistant",
          source: {
            start: 43,
            end: 84,
            text: "Focus on concrete explanations before abstraction.",
          },
        },
      ],
      time: {
        created: 1_777_777_777_000,
      },
    }) satisfies SessionV2.Message

    const source = buildFilteredSessionSource({
      messages: [userMessage],
      learningEvents: [],
    })

    expect(source.transcript).toContain("The learner benefits from fully worked examples.")
    expect(source.transcript).toContain("Focus on concrete explanations before abstraction.")
  })

  test("excludes assistant reasoning from extraction source text", () => {
    const assistantMessage = Schema.decodeUnknownSync(SessionV2Schema.Message)({
      id: "msg_assistant",
      type: "assistant",
      agent: "buddy",
      model: {
        id: "test-model",
        providerID: "test-provider",
      },
      content: [
        {
          id: "reasoning_1",
          type: "reasoning",
          text: "private reasoning should not become learner memory evidence",
        },
        {
          id: "text_1",
          type: "text",
          text: "The learner prefers concrete worked examples.",
        },
      ],
      tokens: {
        input: 10,
        output: 8,
        reasoning: 6,
        cache: {
          read: 0,
          write: 0,
        },
      },
      time: {
        created: 1_777_777_777_000,
      },
    }) satisfies SessionV2.Message

    const source = buildFilteredSessionSource({
      messages: [assistantMessage],
      learningEvents: [],
    })

    expect(source.transcript).toContain("The learner prefers concrete worked examples.")
    expect(source.transcript).not.toContain("private reasoning")
  })

  test("preserves malformed memory blocks during registry rewrites", () => {
    const registry = parseLearnerMemoryRegistry(`# Learner Memory Registry

## Broken memory

- id:
- type: preference

This block is malformed but should not be dropped.
`)

    expect(registry.memories).toHaveLength(0)
    expect(registry.invalidBlocks).toHaveLength(1)

    const rendered = renderRegistryMarkdown([], {
      invalidBlocks: registry.invalidBlocks,
    })

    expect(rendered).toContain("## Broken memory")
    expect(rendered).toContain("This block is malformed but should not be dropped.")
    expect(parseLearnerMemoryRegistry(rendered).invalidBlocks).toHaveLength(1)
  })

  test("redacts common secret shapes before storage", () => {
    const text = redactSecrets(
      "token=supersecretvalue123 Bearer abcdefghijklmnop sk-abcdefghijklmnopqrstuvwxyz",
    )

    expect(text).not.toContain("supersecretvalue123")
    expect(text).not.toContain("abcdefghijklmnop")
    expect(text).not.toContain("sk-abcdefghijklmnopqrstuvwxyz")
  })

  test("truncates long extraction inputs with head and tail preserved", () => {
    const result = truncateHeadTail({
      text: `head ${"middle ".repeat(200)} tail`,
      tokenBudget: 20,
    })

    expect(result.truncated).toBe(true)
    expect(result.text).toContain("head")
    expect(result.text).toContain("tail")
    expect(result.text).toContain("learner-memory-truncation")
  })

  test("attention gate treats deterministic artifacts as handled without a speculative model call", () => {
    const decision = decideLearnerMemoryAttention({
      id: "artifact-only",
      title: "Artifact only",
      expected: { shouldExtract: false, notes: [] },
      messages: [
        {
          id: "u1",
          role: "user",
          createdAt: "2026-04-28T10:00:00.000Z",
          text: "I answered the flashcards.",
        },
        {
          id: "a1",
          role: "assistant",
          createdAt: "2026-04-28T10:01:00.000Z",
          text: "Recorded.",
          outputTokens: 900,
        },
      ],
      learningEvents: [
        createLearnerEvent({
          type: "flashcard_review_ingested",
          sourceKind: "test",
          searchableText: "Learner missed validation boundary flashcards.",
        }),
      ],
    })

    expect(decision.decision).toBe("skip")
    expect(decision.reasons).toContain("deterministic_artifact_already_handled")
  })

  test("attention gate ignores incidental read-only tool calls", () => {
    const decision = decideLearnerMemoryAttention({
      id: "read-only-tools",
      title: "Read-only tool session",
      expected: { shouldExtract: false, notes: [] },
      messages: [
        {
          id: "u1",
          role: "user",
          createdAt: "2026-04-28T10:00:00.000Z",
          text: "Can you inspect this file?",
        },
        {
          id: "a1",
          role: "assistant",
          createdAt: "2026-04-28T10:01:00.000Z",
          text: "I read it.",
          outputTokens: 900,
          toolNames: ["read", "grep"],
        },
      ],
      learningEvents: [],
    })

    expect(decision.decision).toBe("skip")
    expect(decision.reasons).not.toContain("meaningful_tool_work")
  })

  test("attention gate suppresses correction-only memory sessions", () => {
    const decision = decideLearnerMemoryAttention({
      id: "correction-only",
      title: "Correction only",
      expected: { shouldExtract: false, notes: [] },
      messages: [
        {
          id: "u1",
          role: "user",
          createdAt: "2026-04-28T10:00:00.000Z",
          text: "Do not remember that I prefer theory-first globally.",
        },
        {
          id: "u2",
          role: "user",
          createdAt: "2026-04-28T10:02:00.000Z",
          text: "That memory is wrong and should be project scoped.",
        },
        {
          id: "u3",
          role: "user",
          createdAt: "2026-04-28T10:04:00.000Z",
          text: "Please update your memory instead of inferring a new one.",
        },
        {
          id: "u4",
          role: "user",
          createdAt: "2026-04-28T10:06:00.000Z",
          text: "This is only a correction.",
        },
        {
          id: "a1",
          role: "assistant",
          createdAt: "2026-04-28T10:07:00.000Z",
          text: "I will route this through memory correction.",
          outputTokens: 900,
        },
      ],
      learningEvents: [],
    })

    expect(decision.decision).toBe("skip")
    expect(decision.reasons).toContain("deterministic_correction_route")
  })

  test("stage-one no-output watermark only skips unchanged snapshots", async () => {
    await using project = await tmpdir({ git: true })

    const firstClaim = await tryClaimLearnerMemoryStageOneJob({
      directory: project.path,
      sessionID: "session-a",
      workerID: "worker-a",
      sourceUpdatedAt: "2026-04-28T10:00:00.000Z",
      sourceFingerprint: "fingerprint-a",
      sourceMessageCount: 1,
    })
    expect(firstClaim.claimed).toBe(true)
    if (!firstClaim.claimed) return

    await markLearnerMemoryStageOneJobSucceededNoOutput({
      directory: project.path,
      claim: firstClaim.claim,
    })

    const unchangedClaim = await tryClaimLearnerMemoryStageOneJob({
      directory: project.path,
      sessionID: "session-a",
      workerID: "worker-b",
      sourceUpdatedAt: "2026-04-28T10:00:00.000Z",
      sourceFingerprint: "fingerprint-a",
      sourceMessageCount: 1,
    })
    expect(unchangedClaim.claimed).toBe(false)

    const continuedClaim = await tryClaimLearnerMemoryStageOneJob({
      directory: project.path,
      sessionID: "session-a",
      workerID: "worker-c",
      sourceUpdatedAt: "2026-04-28T10:00:00.000Z",
      sourceFingerprint: "fingerprint-b",
      sourceMessageCount: 12,
    })
    expect(continuedClaim.claimed).toBe(true)
  })

  test("stage-one success writes canonical output records before phase-two artifacts", async () => {
    await using project = await tmpdir({ git: true })

    const claim = await tryClaimLearnerMemoryStageOneJob({
      directory: project.path,
      sessionID: "session-b",
      workerID: "worker-a",
      sourceUpdatedAt: "2026-04-28T11:00:00.000Z",
      sourceFingerprint: "fingerprint-b",
      sourceMessageCount: 4,
    })
    expect(claim.claimed).toBe(true)
    if (!claim.claimed) return

    await markLearnerMemoryStageOneJobSucceeded({
      directory: project.path,
      claim: claim.claim,
      output: {
        id: "stage1_session-b",
        schemaVersion: 1,
        sessionId: "session-b",
        projectPath: project.path,
        sourceUpdatedAt: "2026-04-28T11:00:00.000Z",
        sourceMessageCount: 4,
        sourceFingerprint: "fingerprint-b",
        rolloutSummary: "Learner practiced bridge validation boundaries.",
        rawMemory: "The learner is still fragile on validation boundaries.",
        candidatePatches: [
          {
            id: "cand_session_b",
            schemaVersion: 1,
            fixtureId: "session-b",
            operation: "create",
            memoryType: "fragile_skill",
            title: "Bridge validation boundaries remain fragile",
            body: "The learner needs more practice deciding validation boundaries.",
            tags: ["validation"],
            confidence: 0.8,
            sourceMessageIds: ["msg1"],
            sourceEventIds: [],
            rationale: "Source-backed learner uncertainty.",
          },
        ],
        createdAt: "2026-04-28T11:01:00.000Z",
        updatedAt: "2026-04-28T11:01:00.000Z",
      },
    })

    const outputs = await listLearnerMemoryStageOneOutputs(project.path)
    expect(outputs.map((output) => output.sessionId)).toEqual(["session-b"])
    await expect(fs.access(LearnerMemoryPath.rawMemoriesFile(project.path))).rejects.toThrow()
    await expect(
      fs.access(LearnerMemoryPath.rolloutSummaryFile(project.path, "session-b")),
    ).rejects.toThrow()

    const artifacts = await syncLearnerMemoryPhaseTwoArtifacts({
      directory: project.path,
      outputs,
    })
    expect(artifacts.rolloutSummaryPaths).toHaveLength(1)
    await expect(fs.stat(LearnerMemoryPath.rawMemoriesFile(project.path))).resolves.toBeDefined()
    await expect(
      fs.stat(LearnerMemoryPath.rolloutSummaryFile(project.path, "session-b")),
    ).resolves.toBeDefined()
  })

  test("durable leases and backoff block duplicate extraction claims", async () => {
    await using project = await tmpdir({ git: true })

    const firstClaim = await tryClaimLearnerMemoryStageOneJob({
      directory: project.path,
      sessionID: "session-lease",
      workerID: "worker-a",
      sourceUpdatedAt: "2026-04-28T12:00:00.000Z",
      sourceFingerprint: "fingerprint-lease",
      sourceMessageCount: 5,
    })
    expect(firstClaim.claimed).toBe(true)

    const duplicateClaim = await tryClaimLearnerMemoryStageOneJob({
      directory: project.path,
      sessionID: "session-lease",
      workerID: "worker-b",
      sourceUpdatedAt: "2026-04-28T12:00:00.000Z",
      sourceFingerprint: "fingerprint-lease",
      sourceMessageCount: 5,
    })
    expect(duplicateClaim).toEqual({
      claimed: false,
      reason: "stage_one_lease_active",
    })

    if (!firstClaim.claimed) return
    await markLearnerMemoryStageOneJobFailed({
      directory: project.path,
      claim: firstClaim.claim,
      error: new Error("model failed"),
    })

    const backoffClaim = await tryClaimLearnerMemoryStageOneJob({
      directory: project.path,
      sessionID: "session-lease",
      workerID: "worker-c",
      sourceUpdatedAt: "2026-04-28T12:01:00.000Z",
      sourceFingerprint: "fingerprint-lease-next",
      sourceMessageCount: 6,
    })
    expect(backoffClaim).toEqual({
      claimed: false,
      reason: "stage_one_retry_backoff_active",
    })
  })

  test("durable extraction budget claims survive concurrent callers", async () => {
    await using project = await tmpdir({ git: true })

    const first = await tryClaimLearnerMemoryExtractionBudget({
      directory: project.path,
      sessionID: "session-budget",
      maxExtractionCallsPerSession: 1,
      maxExtractionCallsPerDay: 2,
    })
    const second = await tryClaimLearnerMemoryExtractionBudget({
      directory: project.path,
      sessionID: "session-budget",
      maxExtractionCallsPerSession: 1,
      maxExtractionCallsPerDay: 2,
    })

    expect(first.claimed).toBe(true)
    expect(second).toEqual({
      claimed: false,
      reason: "session_extraction_budget_exhausted",
    })
  })

  test("phase-two selection reports added retained and removed outputs", async () => {
    await using project = await tmpdir({ git: true })

    const oldClaim = await tryClaimLearnerMemoryStageOneJob({
      directory: project.path,
      sessionID: "session-old",
      workerID: "worker-old",
      sourceUpdatedAt: "2026-04-28T13:00:00.000Z",
      sourceFingerprint: "old",
      sourceMessageCount: 3,
    })
    expect(oldClaim.claimed).toBe(true)
    if (!oldClaim.claimed) return

    await markLearnerMemoryStageOneJobSucceeded({
      directory: project.path,
      claim: oldClaim.claim,
      output: {
        id: "stage1_session-old",
        schemaVersion: 1,
        sessionId: "session-old",
        projectPath: project.path,
        sourceUpdatedAt: "2026-04-28T13:00:00.000Z",
        sourceMessageCount: 3,
        sourceFingerprint: "old",
        rolloutSummary: "Old output.",
        rawMemory: "Old raw memory.",
        candidatePatches: [],
        createdAt: "2026-04-28T13:01:00.000Z",
        updatedAt: "2026-04-28T13:01:00.000Z",
      },
    })

    const firstSelection = await selectLearnerMemoryStageOneOutputsForConsolidation({
      directory: project.path,
      limit: 1,
    })
    expect(firstSelection.diff.addedSessionIds).toEqual(["session-old"])

    const phaseTwoClaim = await tryClaimLearnerMemoryPhaseTwoJob({
      directory: project.path,
      workerID: "phase-two",
      force: true,
    })
    expect(phaseTwoClaim.claimed).toBe(true)
    if (!phaseTwoClaim.claimed) return
    await markLearnerMemoryPhaseTwoJobSucceeded({
      directory: project.path,
      claim: phaseTwoClaim.claim,
      selectedSessionIds: ["session-old"],
    })

    const retainedSelection = await selectLearnerMemoryStageOneOutputsForConsolidation({
      directory: project.path,
      limit: 1,
    })
    expect(retainedSelection.diff.retainedSessionIds).toEqual(["session-old"])

    const newClaim = await tryClaimLearnerMemoryStageOneJob({
      directory: project.path,
      sessionID: "session-new",
      workerID: "worker-new",
      sourceUpdatedAt: "2026-04-28T14:00:00.000Z",
      sourceFingerprint: "new",
      sourceMessageCount: 4,
    })
    expect(newClaim.claimed).toBe(true)
    if (!newClaim.claimed) return

    await markLearnerMemoryStageOneJobSucceeded({
      directory: project.path,
      claim: newClaim.claim,
      output: {
        id: "stage1_session-new",
        schemaVersion: 1,
        sessionId: "session-new",
        projectPath: project.path,
        sourceUpdatedAt: "2026-04-28T14:00:00.000Z",
        sourceMessageCount: 4,
        sourceFingerprint: "new",
        rolloutSummary: "New output.",
        rawMemory: "New raw memory.",
        candidatePatches: [],
        createdAt: "2026-04-28T14:01:00.000Z",
        updatedAt: "2026-04-28T14:01:00.000Z",
      },
    })

    const nextSelection = await selectLearnerMemoryStageOneOutputsForConsolidation({
      directory: project.path,
      limit: 1,
    })
    expect(nextSelection.diff.addedSessionIds).toEqual(["session-new"])
    expect(nextSelection.diff.removedSessionIds).toEqual(["session-old"])
  })
})
