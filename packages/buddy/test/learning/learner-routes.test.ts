import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import { Config } from "../../src/config"
import { EXPERIMENTAL_FEATURE_ID } from "../../src/experimental-features/catalog"
import {
  LearnerMemoryPath,
  createLearnerEvent,
  createLearnerMemory,
  writeLearnerEvidenceForEvent,
} from "../../src/learning/features/memory"
import { tmpdir } from "../helpers/tmpdir"
import { requireJsonObject, requireJsonArray, requireNumber, requireString } from "../helpers/parse"

async function withLearnerMemoryExperiment<T>(testBody: () => Promise<T>): Promise<T> {
  const previous = await Config.getGlobal()

  try {
    await Config.replaceGlobal(
      Config.Info.parse({
        ...previous,
        experimental_features: {
          ...previous.experimental_features,
          [EXPERIMENTAL_FEATURE_ID.learnerMemory]: true,
        },
      }),
    )
    return await testBody()
  } finally {
    await Config.replaceGlobal(previous)
  }
}

describe("learner memory routes", () => {
  test("returns learner memory digest for the current snapshot", async () => {
    await withLearnerMemoryExperiment(async () => {
      await using project = await tmpdir({
        git: true,
        config: { learner_memory: { enabled: true } },
      })

      const response = await app.request(
        `/api/learner/memory/digest?directory=${encodeURIComponent(project.path)}`,
      )

      expect(response.status).toBe(200)
      const body = requireJsonObject(await response.json())
      expect(requireString(body.fingerprint, "fingerprint").length).toBeGreaterThan(0)
      expect(requireNumber(body.itemCount, "itemCount")).toBeGreaterThan(0)
    })
  })

  test("returns learner memory source pointers backed by evidence files", async () => {
    await withLearnerMemoryExperiment(async () => {
      await using project = await tmpdir({
        git: true,
        config: { learner_memory: { enabled: true } },
      })

      const event = createLearnerEvent({
        type: "question_set_attempt_ingested",
        sourceKind: "question_set_attempt",
        sourceId: "attempt_test",
        searchableText: "Question set attempt for bridge validation.",
        projectPath: project.path,
        payload: {
          objectID: "object_test",
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
        objectId: "object_test",
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
      const sourcesBody = requireJsonObject(await sourcesResponse.json())
      expect(sourcesBody.memoryId).toBe(memory.id)
      const sources = requireJsonArray(sourcesBody.sources, "sources")
      expect(sources.length).toBeGreaterThan(0)
      const firstSource = requireJsonObject(sources[0], "first source")
      expect(requireString(firstSource.path, "source path")).toContain(
        ".buddy/learner-memory/evidence/",
      )
      expect(firstSource.eventId).toBe(event.id)
    })
  })

  test("rebuilds the learner-memory index from canonical files", async () => {
    await withLearnerMemoryExperiment(async () => {
      await using project = await tmpdir({
        git: true,
        config: { learner_memory: { enabled: true } },
      })

      const rebuildResponse = await app.request(
        `/api/learner/memory/index/rebuild?directory=${encodeURIComponent(project.path)}`,
        { method: "POST" },
      )

      expect(rebuildResponse.status).toBe(200)
      const body = requireJsonObject(await rebuildResponse.json())
      const indexPath = requireString(body.indexPath, "index path")
      expect(path.resolve(await fs.realpath(indexPath))).toBe(
        path.resolve(await fs.realpath(LearnerMemoryPath.indexFile(project.path))),
      )
      expect(requireNumber(body.memoryCount, "memoryCount")).toBeGreaterThanOrEqual(0)
      expect(requireNumber(body.eventCount, "eventCount")).toBeGreaterThanOrEqual(0)
      await expect(fs.stat(indexPath)).resolves.toBeDefined()
    })
  })

  test("returns learner memory pipeline diagnostics", async () => {
    await withLearnerMemoryExperiment(async () => {
      await using project = await tmpdir({
        git: true,
        config: { learner_memory: { enabled: true } },
      })

      const response = await app.request(
        `/api/learner/memory/pipeline/diagnostics?directory=${encodeURIComponent(project.path)}`,
      )

      expect(response.status).toBe(200)
      const body = requireJsonObject(await response.json())
      expect(Array.isArray(body.stageOneJobs)).toBe(true)
      expect(Array.isArray(body.stageOneOutputs)).toBe(true)
      expect(body.inputWatermarkMs).toBeGreaterThanOrEqual(0)
      const budget = requireJsonObject(body.budget, "budget")
      expect(budget.todayCount).toBeGreaterThanOrEqual(0)
      expect(budget.totalCount).toBeGreaterThanOrEqual(0)
    })
  })
})
