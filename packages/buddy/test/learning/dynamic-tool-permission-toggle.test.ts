import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionID } from "@buddy/opencode-adapter/id"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Config } from "@buddy/backend/config"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { writeTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import { buildBuddyRuntimeSessionPermissions } from "../../src/learning/agent-execution/permissions/session-permissions"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import { REGISTERED_BUDDY_PERSONAS } from "../../src/learning/personas/registry"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import {
  grantDynamicLearningToolsForSession,
  releaseDynamicLearningToolsForSession,
} from "../../src/learning/runtime/dynamic-tool-grants"
import { dynamicLearningToolDefaultDenyRules } from "../../src/learning/runtime/dynamic-tool-permissions"
import { dynamicReflectionTool } from "../../src/learning/features/teaching-guidance/tools/reflection"
import { tmpdir } from "../helpers/tmpdir"

const DYNAMIC_REFLECTION_TOOL_ID = dynamicReflectionTool.id

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

async function seedTeachingSession(projectPath: string, sessionID: string) {
  const config = await Config.getProject(projectPath)
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

  writeTeachingSessionState(projectPath, {
    sessionId: sessionID,
    persona: persona.id,
    currentSurface: persona.defaultSurface,
    teachingWorkspaceState: "inactive",
    sessionRuntime,
    focusGoalIds: [],
  })
}

describe("dynamic tool permission toggling", () => {
  test("granting a dynamic tool adds an allow rule to session permissions", async () => {
    await using project = await tmpdir({ git: true })
    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const session = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.create({ title: "Dynamic tool grant test" }),
    })

    await seedTeachingSession(project.path, session.id)

    const granted = await grantDynamicLearningToolsForSession({
      directory: project.path,
      sessionID: session.id,
      tools: [dynamicReflectionTool],
    })

    expect(granted).toEqual([DYNAMIC_REFLECTION_TOOL_ID])

    const updatedSession = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.get(SessionID.make(session.id)),
    })

    expect(updatedSession.permission).toContainEqual({
      permission: DYNAMIC_REFLECTION_TOOL_ID,
      pattern: "*",
      action: "allow",
    })
  }, 30_000)

  test("dynamic tool is denied before granting and after releasing", async () => {
    await using project = await tmpdir({ git: true })
    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const session = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.create({ title: "Dynamic tool deny test" }),
    })

    await seedTeachingSession(project.path, session.id)

    const readPermission = async () =>
      OpenCodeInstance.provide({
        directory: project.path,
        fn: async () => (await OpenCodeSession.get(SessionID.make(session.id))).permission ?? [],
      })

    let permission = await readPermission()
    expect(
      permission.some(
        (rule) =>
          rule.permission === DYNAMIC_REFLECTION_TOOL_ID &&
          rule.pattern === "*" &&
          rule.action === "allow",
      ),
    ).toBe(false)

    await grantDynamicLearningToolsForSession({
      directory: project.path,
      sessionID: session.id,
      tools: [dynamicReflectionTool],
    })

    permission = await readPermission()
    expect(permission).toContainEqual({
      permission: DYNAMIC_REFLECTION_TOOL_ID,
      pattern: "*",
      action: "allow",
    })

    await releaseDynamicLearningToolsForSession({
      directory: project.path,
      sessionID: session.id,
      resetPermission: true,
    })

    permission = await readPermission()
    expect(permission).not.toContainEqual({
      permission: DYNAMIC_REFLECTION_TOOL_ID,
      pattern: "*",
      action: "allow",
    })
    expect(permission).toEqual(expect.arrayContaining(dynamicLearningToolDefaultDenyRules()))
  })

  test("dynamic tools are denied in session runtime before load and not duplicated in allow rules", async () => {
    await using project = await tmpdir({ git: true })
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

    expect(sessionRuntime.access.tools[DYNAMIC_REFLECTION_TOOL_ID]).toBe("deny")

    const permission = buildBuddyRuntimeSessionPermissions({ sessionRuntime })
    expect(
      permission.some(
        (rule) =>
          rule.permission === DYNAMIC_REFLECTION_TOOL_ID &&
          rule.pattern === "*" &&
          rule.action === "allow",
      ),
    ).toBe(false)
    expect(permission).toEqual(expect.arrayContaining(dynamicLearningToolDefaultDenyRules()))
  })

  test("plugin pre-registers Buddy tools in the registry", async () => {
    await using project = await tmpdir({ git: true })
    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const toolIDs = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.ids(),
    })

    expect(toolIDs).toContain("bash")
    expect(toolIDs).toContain("read")
    expect(toolIDs).toContain("prepare_resource")
    expect(toolIDs).toContain("learning_tool_search")
  })
})
