import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import {
  buildLearnerRuntimeSnapshot,
  createLearnerMemory,
  LearnerMemoryPath,
  recordCheckpointMemory,
  recordFlashcardReviewMemory,
  recordQuestionSetAttemptMemory,
} from "../../src/learning/learner-memory"
import { tmpdir } from "../helpers/tmpdir"

describe("deterministic learner memory", () => {
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

    const snapshot = await buildLearnerRuntimeSnapshot(project.path)

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
