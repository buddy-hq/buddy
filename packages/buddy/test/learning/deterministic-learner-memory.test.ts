import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import {
  buildLearnerRuntimeSnapshot,
  appendLearnerEventOnce,
  createLearnerEvent,
  createLearnerMemory,
  LearnerMemoryPath,
  listLearnerMemories,
  listLearnerEventRecords,
  recordCheckpointMemory,
  recordFlashcardReviewMemory,
  recordQuestionSetAttemptMemory,
  strengthenLearnerMemory,
} from "../../src/learning/features/memory"
import { tmpdir } from "../helpers/tmpdir"
import { runWithLearnerMemoryLabContext } from "../../src/learning/features/memory/lab-context"

describe("deterministic learner memory", () => {
  test("appends a stable ingestion event only once across retries", async () => {
    await using project = await tmpdir({ git: true })
    const memoryRoot = `${project.path}/learner-memory`

    await runWithLearnerMemoryLabContext({ memoryRoot }, async () => {
      const event = createLearnerEvent({
        id: "evt_stable_assessment",
        createdAt: "2026-07-13T00:00:00.000Z",
        type: "question_set_attempt_ingested",
        sourceKind: "question_set_attempt",
        sourceId: "attempt-stable",
        searchableText: "Stable assessment ingestion event.",
      })
      const nextMonthReplay = createLearnerEvent({
        ...event,
        createdAt: "2026-08-01T00:00:00.000Z",
      })
      await appendLearnerEventOnce(project.path, event)
      await appendLearnerEventOnce(project.path, event)
      await appendLearnerEventOnce(project.path, nextMonthReplay)

      const matchingEvents = (await listLearnerEventRecords(project.path)).filter(
        (record) => record.event.id === event.id,
      )
      expect(matchingEvents).toHaveLength(1)
    })
  })

  test("preserves concurrent updates to the same learner memory", async () => {
    await using project = await tmpdir({ git: true })
    const memoryRoot = `${project.path}/learner-memory`

    await runWithLearnerMemoryLabContext({ memoryRoot }, async () => {
      const memory = await createLearnerMemory({
        directory: project.path,
        type: "preference",
        title: "Incremental strength",
        body: "Concurrent updates must accumulate.",
        tags: ["concurrency"],
        strength: 0.2,
        source: "debug",
        reason: "same-memory concurrency regression test",
      })

      await Promise.all([
        strengthenLearnerMemory({
          directory: project.path,
          memoryId: memory.id,
          sourceKind: "test",
          amount: 0.1,
        }),
        strengthenLearnerMemory({
          directory: project.path,
          memoryId: memory.id,
          sourceKind: "test",
          amount: 0.1,
        }),
      ])

      const updated = (await listLearnerMemories(project.path)).find(
        (candidate) => candidate.id === memory.id,
      )
      expect(updated?.strength).toBeCloseTo(0.4)
    })
  })

  test("preserves concurrent learner-global memory creations", async () => {
    await using project = await tmpdir({ git: true })
    const memoryRoot = `${project.path}/learner-memory`

    await runWithLearnerMemoryLabContext({ memoryRoot }, async () => {
      await Promise.all(
        ["First concurrent memory", "Second concurrent memory"].map((title) =>
          createLearnerMemory({
            directory: project.path,
            type: "preference",
            title,
            body: `${title} body`,
            tags: ["concurrency"],
            source: "debug",
            reason: "concurrent mutation regression test",
          }),
        ),
      )

      const memories = await listLearnerMemories(project.path)
      expect(memories.map((memory) => memory.title).toSorted()).toEqual([
        "First concurrent memory",
        "Second concurrent memory",
      ])
    })
  })

  test("atomically upserts deterministic memory effects across concurrent replay", async () => {
    await using project = await tmpdir({ git: true })
    const memoryRoot = `${project.path}/learner-memory`

    await runWithLearnerMemoryLabContext({ memoryRoot }, async () => {
      const record = (eventId: string) =>
        recordQuestionSetAttemptMemory({
          directory: project.path,
          eventId,
          title: "Concurrent assessment",
          groupType: "assessment",
          totalQuestions: 2,
          correctQuestions: 2,
          tags: ["concurrency"],
          projectPath: project.path,
        })

      await Promise.all([record("evt_attempt_a"), record("evt_attempt_a"), record("evt_attempt_b")])

      const matchingMemories = (await listLearnerMemories(project.path)).filter(
        (memory) => memory.title === "Question-set evidence: Concurrent assessment",
      )
      expect(matchingMemories).toHaveLength(1)
      expect(matchingMemories[0]?.sourceEventIds.toSorted()).toEqual([
        "evt_attempt_a",
        "evt_attempt_b",
      ])

      const effectEvents = (await listLearnerEventRecords(project.path)).filter(
        (record) =>
          record.event.type === "memory_applied" &&
          record.event.sourceKind === "deterministic" &&
          record.event.sourceId === matchingMemories[0]?.id,
      )
      expect(effectEvents).toHaveLength(2)
    })
  })

  test("creates immediate evidence from a perfect question-set attempt", async () => {
    await using project = await tmpdir({ git: true })

    const memory = await recordQuestionSetAttemptMemory({
      directory: project.path,
      eventId: "evt_qset_1",
      title: "Electron bridge validation",
      groupType: "assessment",
      totalQuestions: 4,
      correctQuestions: 4,
      tags: ["electron", "validation"],
      projectPath: project.path,
    })

    expect(memory.type).toBe("evidence")
    expect(memory.source).toBe("deterministic")
    expect(memory.sourceEventIds).toContain("evt_qset_1")
    expect(memory.body).toContain("perfect assessment question-set result")
  })

  test("creates immediate fragile-skill memory from a failed flashcard review", async () => {
    await using project = await tmpdir({ git: true })

    const memory = await recordFlashcardReviewMemory({
      directory: project.path,
      eventId: "evt_flash_1",
      deckTitle: "Bridge cards",
      tags: ["bridge-validation"],
      rating: "again",
      previousState: "review",
      newState: "relearning",
      isLeech: false,
      projectPath: project.path,
    })

    expect(memory?.type).toBe("fragile_skill")
    expect(memory?.sourceEventIds).toContain("evt_flash_1")
  })

  test("creates project-context memory only when checkpoint content changed", async () => {
    await using project = await tmpdir({ git: true })

    const unchanged = await recordCheckpointMemory({
      directory: project.path,
      eventId: "evt_checkpoint_1",
      sessionID: "ses_1",
      lessonFilePath: "/tmp/lesson.ts",
      revision: 1,
      changedSinceLastCheckpoint: false,
      projectPath: project.path,
    })
    const changed = await recordCheckpointMemory({
      directory: project.path,
      eventId: "evt_checkpoint_2",
      sessionID: "ses_1",
      lessonFilePath: "/tmp/lesson.ts",
      revision: 2,
      changedSinceLastCheckpoint: true,
      projectPath: project.path,
    })

    expect(unchanged).toBeUndefined()
    expect(changed?.type).toBe("project_context")
  })

  test("surfaces the strongest evidence first in runtime snapshots", async () => {
    await using project = await tmpdir({ git: true })

    await createLearnerMemory({
      directory: project.path,
      type: "evidence",
      title: "Weaker evidence",
      body: "This should rank lower.",
      tags: ["ordering"],
      projectPath: project.path,
      confidence: 0.55,
      strength: 0.52,
      source: "debug",
      reason: "snapshot ordering test",
    })
    const stronger = await createLearnerMemory({
      directory: project.path,
      type: "evidence",
      title: "Stronger evidence",
      body: "This should rank first.",
      tags: ["ordering"],
      projectPath: project.path,
      confidence: 0.92,
      strength: 0.9,
      source: "debug",
      reason: "snapshot ordering test",
    })

    const snapshot = await runWithLearnerMemoryLabContext(
      { settingsOverride: { enabled: true } },
      () => buildLearnerRuntimeSnapshot(project.path),
    )

    expect(snapshot.recentEvidence[0]?.id).toBe(stronger.id)
  })

  test("uses working-memory.md instead of final memory JSON files", async () => {
    await using project = await tmpdir({ git: true })

    await createLearnerMemory({
      directory: project.path,
      type: "preference",
      title: "Examples before theory",
      body: "The learner prefers concrete examples before abstract theory.",
      tags: ["preference"],
      projectPath: project.path,
      source: "debug",
      reason: "canonical storage regression test",
    })

    await expect(fs.stat(LearnerMemoryPath.workingMemoryFile(project.path))).resolves.toBeDefined()
    await expect(fs.access(LearnerMemoryPath.memoriesDirectory(project.path))).rejects.toThrow()
  })
})
