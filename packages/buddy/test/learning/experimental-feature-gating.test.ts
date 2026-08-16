import { describe, expect, test } from "bun:test"
import { Config } from "../../src/config"
import { EXPERIMENTAL_FEATURE_ID } from "../../src/experimental-features/catalog"
import {
  experimentalFeatureIsEnabled,
  listExperimentalFeatureStatuses,
  setExperimentalFeatureEnabled,
} from "../../src/experimental-features/service"
import { enabledBuddyFeatures } from "../../src/learning/access/feature-availability"
import { memoryFeature } from "../../src/learning/features/memory/feature"
import { readLearnerMemorySettings } from "../../src/learning/features/memory/settings"
import { app } from "../../src/app"
import { tmpdir } from "../helpers/tmpdir"
import fs from "node:fs/promises"
import { ingestQuestionSetAttempt } from "../../src/learning/features/memory/ingestion"
import { LearnerMemoryPath } from "../../src/learning/features/memory/paths"
import { runWithLearnerMemoryLabContext } from "../../src/learning/features/memory/lab-context"
import { listLearnerMemories } from "../../src/learning/features/memory/storage"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import { BUDDY } from "../../src/learning/personas/buddy"

async function setLearnerMemoryExperiment(enabled: boolean): Promise<Response> {
  return app.request(`/api/global/experimental-features/${EXPERIMENTAL_FEATURE_ID.learnerMemory}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled }),
  })
}
import { buildBuddyRuntimeSessionPermissions } from "../../src/learning/agent-execution/permissions/session-permissions"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY } from "../../src/learning/features/memory/subagents/memory-consolidator"
import { getBuddySubagentDefinition } from "../../src/learning/subagent-manifest"

describe("experimental feature gating", () => {
  const FUTURE_EXPERIMENTAL_FEATURE_ID = "future_experimental_feature"
  const enabledConfig = Config.Info.parse({
    experimental_features: {
      [EXPERIMENTAL_FEATURE_ID.learnerMemory]: true,
    },
    learner_memory: {
      enabled: true,
      auto_extract: true,
    },
  })

  test("experimental opt-ins are global-only config", () => {
    expect(Config.ProjectInfo.safeParse({ experimental_features: {} }).success).toBe(false)
    expect(Config.Info.safeParse({ experimental_features: {} }).success).toBe(true)
  })

  test("unknown future opt-ins are preserved but excluded from this build's catalog", () => {
    const config = Config.Info.parse({
      experimental_features: { [FUTURE_EXPERIMENTAL_FEATURE_ID]: true },
    })

    expect(config.experimental_features).toEqual({
      [FUTURE_EXPERIMENTAL_FEATURE_ID]: true,
    })
    expect(listExperimentalFeatureStatuses(config)).toEqual([
      { id: EXPERIMENTAL_FEATURE_ID.learnerMemory, enabled: false },
    ])
    expect(
      listExperimentalFeatureStatuses(
        Config.Info.parse({
          experimental_features: { [FUTURE_EXPERIMENTAL_FEATURE_ID]: false },
        }),
      ),
    ).toEqual([{ id: EXPERIMENTAL_FEATURE_ID.learnerMemory, enabled: false }])
  })

  test("known opt-in updates preserve unknown future opt-ins", async () => {
    const previous = await Config.getGlobal()

    try {
      await Config.replaceGlobal(
        Config.Info.parse({
          ...previous,
          experimental_features: {
            ...previous.experimental_features,
            [FUTURE_EXPERIMENTAL_FEATURE_ID]: true,
          },
        }),
      )

      await setExperimentalFeatureEnabled({
        featureID: EXPERIMENTAL_FEATURE_ID.learnerMemory,
        enabled: true,
      })
      expect((await Config.getGlobal()).experimental_features).toEqual({
        [FUTURE_EXPERIMENTAL_FEATURE_ID]: true,
        [EXPERIMENTAL_FEATURE_ID.learnerMemory]: true,
      })

      await setExperimentalFeatureEnabled({
        featureID: EXPERIMENTAL_FEATURE_ID.learnerMemory,
        enabled: false,
      })
      expect((await Config.getGlobal()).experimental_features).toEqual({
        [FUTURE_EXPERIMENTAL_FEATURE_ID]: true,
      })
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("legacy memory master state is discarded instead of granting experimental consent", () => {
    const config = Config.Info.parse({
      learner_memory: { master_enabled: true, enabled: true },
    })

    expect(config.learner_memory).toEqual({ enabled: true })
    expect(experimentalFeatureIsEnabled(config, EXPERIMENTAL_FEATURE_ID.learnerMemory)).toBe(false)
  })

  test("catalog status is disabled unless explicitly opted in", () => {
    expect(
      experimentalFeatureIsEnabled(Config.Info.parse({}), EXPERIMENTAL_FEATURE_ID.learnerMemory),
    ).toBe(false)
    expect(listExperimentalFeatureStatuses(enabledConfig)).toEqual([
      { id: EXPERIMENTAL_FEATURE_ID.learnerMemory, enabled: true },
    ])
  })

  test("memory requires both the global experiment and notebook participation", () => {
    expect(enabledBuddyFeatures([memoryFeature], enabledConfig)).toEqual([memoryFeature])
    expect(
      enabledBuddyFeatures(
        [memoryFeature],
        Config.Info.parse({ learner_memory: { enabled: true } }),
      ),
    ).toEqual([])
    expect(
      enabledBuddyFeatures(
        [memoryFeature],
        Config.Info.parse({
          experimental_features: { learner_memory: true },
          learner_memory: { enabled: false },
        }),
      ),
    ).toEqual([])
  })

  test("memory consolidation stays internal when memory is enabled", () => {
    const sessionRuntime = resolveSessionRuntime({
      persona: {
        id: BUDDY.id,
        features: BUDDY.features,
        defaultSurface: BUDDY.defaultSurface,
      },
      teachingWorkspaceState: "inactive",
      config: enabledConfig,
    })
    const sessionPermission = buildBuddyRuntimeSessionPermissions({ sessionRuntime })

    expect(getBuddySubagentDefinition(LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY)?.delegatable).toBe(
      false,
    )
    expect(sessionRuntime.access.subagents[LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY]).toBeUndefined()
    expect(
      PermissionNext.evaluate("task", LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY, sessionPermission)
        .action,
    ).toBe("deny")
  })

  test("effective memory settings fail closed without the experiment", () => {
    expect(readLearnerMemorySettings(enabledConfig)).toMatchObject({
      enabled: true,
      autoExtract: true,
    })
    expect(
      readLearnerMemorySettings(
        Config.Info.parse({ learner_memory: { enabled: true, auto_extract: true } }),
      ),
    ).toMatchObject({ enabled: false, autoExtract: false })
  })

  test("learner-memory routes reject access while the experiment is off", async () => {
    await using project = await tmpdir({ git: true })
    const response = await app.request("/api/learner/memory/settings", {
      headers: { "x-buddy-directory": project.path },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Memory is an experimental feature that is not enabled",
    })
  })

  test("stable feature ingestion creates no memory store while memory is disabled", async () => {
    await using project = await tmpdir({ git: true })

    await runWithLearnerMemoryLabContext({ settingsOverride: { enabled: false } }, () =>
      ingestQuestionSetAttempt({
        directory: project.path,
        objectID: "question-set-1",
        attemptID: "attempt-1",
        title: "Experimental gating",
        groupType: "assessment",
        totalQuestions: 1,
        correctQuestions: 1,
        status: "completed",
        tags: [],
        result: {},
      }),
    )

    await expect(fs.access(LearnerMemoryPath.root(project.path))).rejects.toThrow()
  })

  test("persisted opt-in enables real memory writes and opt-out stops subsequent writes", async () => {
    await using project = await tmpdir({
      git: true,
      config: { learner_memory: { enabled: true } },
    })

    try {
      expect((await setLearnerMemoryExperiment(true)).status).toBe(200)

      const enabledSettingsResponse = await app.request("/api/learner/memory/settings", {
        headers: { "x-buddy-directory": project.path },
      })
      expect(enabledSettingsResponse.status).toBe(200)
      await expect(enabledSettingsResponse.json()).resolves.toMatchObject({ enabled: true })

      await ingestQuestionSetAttempt({
        directory: project.path,
        objectID: "question-set-enabled",
        attemptID: "attempt-enabled",
        title: "Experimental memory enabled",
        groupType: "assessment",
        totalQuestions: 1,
        correctQuestions: 1,
        status: "completed",
        tags: ["experimental-memory"],
        result: {},
      })
      const memoriesAfterEnabledIngestion = await listLearnerMemories(project.path)
      expect(memoriesAfterEnabledIngestion).toHaveLength(1)

      expect((await setLearnerMemoryExperiment(false)).status).toBe(200)
      await ingestQuestionSetAttempt({
        directory: project.path,
        objectID: "question-set-disabled",
        attemptID: "attempt-disabled",
        title: "Experimental memory disabled",
        groupType: "assessment",
        totalQuestions: 1,
        correctQuestions: 0,
        status: "completed",
        tags: ["experimental-memory"],
        result: {},
      })
      expect(await listLearnerMemories(project.path)).toEqual(memoriesAfterEnabledIngestion)

      const disabledSettingsResponse = await app.request("/api/learner/memory/settings", {
        headers: { "x-buddy-directory": project.path },
      })
      expect(disabledSettingsResponse.status).toBe(403)
    } finally {
      await setLearnerMemoryExperiment(false)
    }
  })
})
