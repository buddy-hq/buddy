import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import {
  LearnerMemoryPath,
  createLearnerEvent,
  createLearnerMemory,
  writeLearnerEvidenceForEvent,
} from "../../src/learning/learner-memory"
import { tmpdir } from "../helpers/tmpdir"

describe("learner memory routes", () => {
  test("returns learner memory digest for the current snapshot", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request(
      `/api/learner/memory/digest?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      fingerprint: string
      itemCount: number
    }
    expect(body.fingerprint.length).toBeGreaterThan(0)
    expect(body.itemCount).toBeGreaterThan(0)
  })

  test("returns learner memory source pointers backed by evidence files", async () => {
    await using project = await tmpdir({ git: true })

    const event = createLearnerEvent({
      type: "question_set_attempt_ingested",
      sourceKind: "question_set_attempt",
      sourceId: "attempt_test",
      searchableText: "Question set attempt for bridge validation.",
      projectPath: project.path,
      payload: {
        artifactID: "artifact_test",
      },
    })
    const memory = await createLearnerMemory({
      directory: project.path,
      type: "fragile_skill",
      title: "Bridge validation still needs practice",
      body: "The learner still needs practice deciding validation boundaries.",
      tags: ["electron", "validation"],
      projectPath: project.path,
      source: "deterministic",
      sourceEventIds: [event.id],
      reason: "route source pointer test",
    })
    await writeLearnerEvidenceForEvent({
      directory: project.path,
      event,
      artifactId: "artifact_test",
      title: "Bridge validation attempt",
      note: "Partial assessment evidence recorded for bridge validation.",
      tags: ["electron", "validation"],
      memoryEffects: [
        {
          memoryId: memory.id,
          effect: "reinforced",
          reason: "Partial assessment indicates the skill remains fragile.",
        },
      ],
    })

    const sourcesResponse = await app.request(
      `/api/learner/memory/${memory.id}/sources?directory=${encodeURIComponent(project.path)}`,
    )

    expect(sourcesResponse.status).toBe(200)
    const sourcesBody = (await sourcesResponse.json()) as {
      memoryId: string
      sources: Array<{ eventId: string; note: string; path: string }>
    }
    expect(sourcesBody.memoryId).toBe(memory.id)
    expect(sourcesBody.sources.length).toBeGreaterThan(0)
    expect(sourcesBody.sources[0]?.path).toContain(".buddy/learner-memory/evidence/")
    expect(sourcesBody.sources[0]?.eventId).toBe(event.id)
  })

  test("rebuilds the learner-memory index from canonical files", async () => {
    await using project = await tmpdir({ git: true })

    const rebuildResponse = await app.request(
      `/api/learner/memory/index/rebuild?directory=${encodeURIComponent(project.path)}`,
      { method: "POST" },
    )

    expect(rebuildResponse.status).toBe(200)
    const body = (await rebuildResponse.json()) as {
      indexPath: string
      memoryCount: number
      eventCount: number
    }
    expect(path.resolve(await fs.realpath(body.indexPath))).toBe(
      path.resolve(await fs.realpath(LearnerMemoryPath.indexFile(project.path))),
    )
    expect(body.memoryCount).toBeGreaterThanOrEqual(0)
    expect(body.eventCount).toBeGreaterThanOrEqual(0)
    await expect(fs.stat(body.indexPath)).resolves.toBeDefined()
  })

  test("returns learner memory pipeline diagnostics", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request(
      `/api/learner/memory/pipeline/diagnostics?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      stageOneJobs: unknown[]
      stageOneOutputs: unknown[]
      inputWatermarkMs: number
      budget: {
        todayCount: number
        totalCount: number
      }
    }
    expect(Array.isArray(body.stageOneJobs)).toBe(true)
    expect(Array.isArray(body.stageOneOutputs)).toBe(true)
    expect(body.inputWatermarkMs).toBeGreaterThanOrEqual(0)
    expect(body.budget.todayCount).toBeGreaterThanOrEqual(0)
    expect(body.budget.totalCount).toBeGreaterThanOrEqual(0)
  })
})
