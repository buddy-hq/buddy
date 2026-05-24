import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionID } from "@buddy/opencode-adapter/id"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { Config } from "@buddy/backend/config"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { writeTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import { REGISTERED_BUDDY_PERSONAS } from "../../src/learning/personas/registry"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import {
  grantDynamicLearningToolsForSession,
  releaseDynamicLearningToolsForSession,
} from "../../src/learning/runtime/dynamic-tool-grants"
import { dynamicReflectionTool } from "../../src/learning/features/teaching-guidance/tools/reflection"
import { tmpdir } from "../helpers/tmpdir"

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("dynamic tool end-to-end", () => {
  test("pre-registered plugin tool becomes callable after permission grant", async () => {
    await using project = await tmpdir({ git: true })
    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const allToolIDs = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.ids(),
    })
    expect(allToolIDs).toContain(dynamicReflectionTool.id)

    const session = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.create({ title: "Dynamic tool test" }),
    })

    const config = await Config.getProject(project.path)
    const persona = getBuddyPersona("buddy", config.personas)
    const definition = REGISTERED_BUDDY_PERSONAS.find((entry) => entry.id === "buddy")
    if (!definition) {
      throw new Error('Missing "buddy" persona definition')
    }

    const sessionRuntime = resolveSessionRuntime({
      persona: {
        id: persona.id,
        features: definition.features,
        defaultSurface: persona.defaultSurface,
      },
      teachingWorkspaceState: "inactive",
      configuredToolToggles: config.tools,
    })

    writeTeachingSessionState(project.path, {
      sessionId: session.id,
      persona: persona.id,
      currentSurface: persona.defaultSurface,
      teachingWorkspaceState: "inactive",
      sessionRuntime,
      focusGoalIds: [],
    })

    await grantDynamicLearningToolsForSession({
      directory: project.path,
      sessionID: session.id,
      tools: [dynamicReflectionTool],
    })

    const updatedSession = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.get(SessionID.make(session.id)),
    })

    const hasAllow = updatedSession.permission?.some(
      (rule) => rule.permission === dynamicReflectionTool.id && rule.action === "allow",
    )
    expect(hasAllow).toBe(true)

    await releaseDynamicLearningToolsForSession({
      directory: project.path,
      sessionID: session.id,
      resetPermission: true,
    })

    const releasedSession = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.get(SessionID.make(session.id)),
    })

    const stillAllowed = releasedSession.permission?.some(
      (rule) => rule.permission === dynamicReflectionTool.id && rule.action === "allow",
    )
    expect(stillAllowed).toBe(false)

    const finalToolIDs = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.ids(),
    })
    expect(finalToolIDs).toContain(dynamicReflectionTool.id)
  }, 30_000)
})
