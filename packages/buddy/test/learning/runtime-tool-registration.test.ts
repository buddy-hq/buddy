import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { SessionID } from "@buddy/opencode-adapter/id"
import type { LearningToolRegistrationFlags } from "../../src/learning/tools/register-runtime-tools"
import { listBuddySubagents } from "../../src/learning/runtime-subagents"
import {
  dynamicPedagogyDebugAttemptTool,
  dynamicPedagogyReflectionTool,
  dynamicPedagogyStepwiseSolveTool,
} from "../../src/learning/tools/dynamic-learning-tools"
import {
  dynamicLearningToolAgentPermission,
  dynamicLearningToolDefaultDenyRules,
} from "../../src/learning/tools/dynamic-learning-tool-permissions"
import { registerRuntimeTools } from "../../src/learning/tools/register-runtime-tools"
import {
  clearDynamicLearningToolsForEndedSession,
  clearDynamicLearningToolGrantsForSession,
} from "../../src/learning/tools/dynamic-learning-tool-grants"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

const DYNAMIC_PEDAGOGY_DEBUG_ATTEMPT_TOOL_ID = dynamicPedagogyDebugAttemptTool.id
const DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID = dynamicPedagogyReflectionTool.id
const DYNAMIC_PEDAGOGY_STEPWISE_SOLVE_TOOL_ID = dynamicPedagogyStepwiseSolveTool.id

function disabledToolFlags(): LearningToolRegistrationFlags {
  return {
    pedagogy: false,
    curriculum: false,
    knowledgeGraph: false,
    figures: false,
    freeformFigures: false,
    mermaid: false,
    goals: false,
    learner: false,
    toolDiscovery: false,
    teaching: false,
    math: false,
    questionSet: false,
    flashcard: false,
  }
}

async function listToolIDs(directory: string): Promise<string[]> {
  return OpenCodeInstance.provide({
    directory,
    async fn() {
      const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
      return tools.map((tool) => tool.id)
    },
  })
}

function disabledByModelToolFilter(input: {
  toolIDs: readonly string[]
  agentPermission: Parameters<typeof PermissionNext.fromConfig>[0]
  sessionPermission?: Parameters<typeof PermissionNext.disabled>[1]
}): Set<string> {
  return PermissionNext.disabled(
    [...input.toolIDs],
    PermissionNext.merge(
      PermissionNext.fromConfig(input.agentPermission),
      input.sessionPermission ?? [],
    ),
  )
}

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("runtime tool registration", () => {
  test("removes question-set tools after the group is disabled in the same directory", async () => {
    await using project = await tmpdir({ git: true })

    await registerRuntimeTools(project.path, {
      ...disabledToolFlags(),
      questionSet: true,
    })

    expect(await listToolIDs(project.path)).toContain("save_question_set")

    await registerRuntimeTools(project.path, disabledToolFlags())

    expect(await listToolIDs(project.path)).not.toContain("save_question_set")
  })

  test("keeps Buddy custom tool registrations isolated by directory across runtime resets", async () => {
    await using firstProject = await tmpdir({ git: true })
    await using secondProject = await tmpdir({ git: true })

    await registerRuntimeTools(firstProject.path, {
      ...disabledToolFlags(),
      questionSet: true,
    })
    await registerRuntimeTools(secondProject.path, {
      ...disabledToolFlags(),
      flashcard: true,
    })

    expect(await listToolIDs(firstProject.path)).toContain("save_question_set")
    expect(await listToolIDs(firstProject.path)).not.toContain("save_flashcard_deck")

    expect(await listToolIDs(secondProject.path)).toContain("save_flashcard_deck")
    expect(await listToolIDs(secondProject.path)).not.toContain("save_question_set")

    await OpenCodeInstance.disposeAll()

    expect(await listToolIDs(firstProject.path)).toContain("save_question_set")
    expect(await listToolIDs(firstProject.path)).not.toContain("save_flashcard_deck")

    expect(await listToolIDs(secondProject.path)).toContain("save_flashcard_deck")
    expect(await listToolIDs(secondProject.path)).not.toContain("save_question_set")
  })

  test("dynamic tool search finds candidates and load exposes them for the current session", async () => {
    await using project = await tmpdir({ git: true })

    await registerRuntimeTools(project.path, {
      ...disabledToolFlags(),
      toolDiscovery: true,
    })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const session = await OpenCodeSession.create({})
        const initialTools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const searchTool = requireTool(initialTools, "learning_tool_search")
        const searchResult = await searchTool.execute(
          { query: "reflection metacognition" },
          createToolContext({
            sessionID: session.id,
            messageID: "msg_dynamic_tool_search",
            agent: "buddy",
          }),
        )
        const toolsAfterSearch = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const loadTool = requireTool(toolsAfterSearch, "learning_tool_load")
        const loadResult = await loadTool.execute(
          { toolIds: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID] },
          createToolContext({
            sessionID: session.id,
            messageID: "msg_dynamic_tool_load",
            agent: "buddy",
          }),
        )

        const nextTools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const reflectionTool = requireTool(nextTools, DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)
        const reflectionResult = await reflectionTool.execute(
          { topic: "recursive functions" },
          createToolContext({
            sessionID: session.id,
            messageID: "msg_dynamic_reflection_tool",
            agent: "buddy",
          }),
        )
        const updatedSession = await OpenCodeSession.get(SessionID.make(session.id))

        return {
          searchOutput: searchResult.output,
          loadOutput: loadResult.output,
          visibleAfterSearch: toolsAfterSearch.some(
            (tool) => tool.id === DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
          ),
          reflectionOutput: reflectionResult.output,
          permission: updatedSession.permission ?? [],
          hasDebugTool: nextTools.some(
            (tool) => tool.id === DYNAMIC_PEDAGOGY_DEBUG_ATTEMPT_TOOL_ID,
          ),
        }
      },
    })

    expect(result.searchOutput).toContain(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)
    expect(result.searchOutput).toContain("call `learning_tool_load`")
    expect(result.visibleAfterSearch).toBe(false)
    expect(result.loadOutput).toContain("Exposed dynamic learning tools")
    expect(result.reflectionOutput).toContain(
      `<pedagogy_tool_output name="${DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID}">`,
    )
    expect(result.permission).toContainEqual({
      permission: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
      pattern: "*",
      action: "allow",
    })
    expect(result.hasDebugTool).toBe(false)
  })

  test("dynamic tools are directory-visible but denied outside exact session grants", async () => {
    await using project = await tmpdir({ git: true })

    await registerRuntimeTools(project.path, {
      ...disabledToolFlags(),
      toolDiscovery: true,
    })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const searchedSession = await OpenCodeSession.create({})
        const untouchedSession = await OpenCodeSession.create({})
        const searchTool = requireTool(
          await ToolRegistry.tools(TEST_TOOL_MODEL),
          "learning_tool_search",
        )
        const loadTool = requireTool(
          await ToolRegistry.tools(TEST_TOOL_MODEL),
          "learning_tool_load",
        )

        await searchTool.execute(
          { query: "reflection" },
          createToolContext({
            sessionID: searchedSession.id,
            messageID: "msg_dynamic_tool_search_permissions",
            agent: "buddy",
          }),
        )
        await loadTool.execute(
          { toolIds: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID] },
          createToolContext({
            sessionID: searchedSession.id,
            messageID: "msg_dynamic_tool_load_permissions",
            agent: "buddy",
          }),
        )

        const toolIDs = await listToolIDs(project.path)
        const searched = await OpenCodeSession.get(SessionID.make(searchedSession.id))
        const untouched = await OpenCodeSession.get(SessionID.make(untouchedSession.id))

        return {
          toolIDs,
          searchedPermission: searched.permission ?? [],
          untouchedPermission: untouched.permission ?? [],
        }
      },
    })

    expect(result.toolIDs).toContain(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)
    expect(result.searchedPermission).toContainEqual({
      permission: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
      pattern: "*",
      action: "allow",
    })

    expect(
      disabledByModelToolFilter({
        toolIDs: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID],
        agentPermission: dynamicLearningToolAgentPermission(),
        sessionPermission: result.searchedPermission,
      }).has(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID),
    ).toBe(false)
    expect(
      disabledByModelToolFilter({
        toolIDs: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID],
        agentPermission: dynamicLearningToolAgentPermission(),
        sessionPermission: result.untouchedPermission,
      }).has(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID),
    ).toBe(true)
  })

  test("dynamic load without a valid session does not register directory-visible tools", async () => {
    await using project = await tmpdir({ git: true })

    await registerRuntimeTools(project.path, {
      ...disabledToolFlags(),
      toolDiscovery: true,
    })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const searchTool = requireTool(
          await ToolRegistry.tools(TEST_TOOL_MODEL),
          "learning_tool_search",
        )
        const loadTool = requireTool(
          await ToolRegistry.tools(TEST_TOOL_MODEL),
          "learning_tool_load",
        )

        const searchResult = await searchTool.execute(
          { query: "reflection" },
          createToolContext({
            sessionID: "ses_missing_dynamic_tool_search",
            messageID: "msg_missing_dynamic_tool_search",
            agent: "buddy",
          }),
        )
        const loadResult = await loadTool.execute(
          { toolIds: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID] },
          createToolContext({
            sessionID: "ses_missing_dynamic_tool_search",
            messageID: "msg_missing_dynamic_tool_load",
            agent: "buddy",
          }),
        )
        const toolIDs = (await ToolRegistry.tools(TEST_TOOL_MODEL)).map((tool) => tool.id)

        return {
          searchOutput: searchResult.output,
          loadOutput: loadResult.output,
          toolIDs,
        }
      },
    })

    expect(result.searchOutput).toContain(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)
    expect(result.loadOutput).toContain("No dynamic learning tools were exposed")
    expect(result.toolIDs).not.toContain(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)
  })

  test("dynamic grants are cleared and unregistered when the session grant is explicitly reset", async () => {
    await using project = await tmpdir({ git: true })

    await registerRuntimeTools(project.path, {
      ...disabledToolFlags(),
      toolDiscovery: true,
    })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const session = await OpenCodeSession.create({})
        const searchTool = requireTool(
          await ToolRegistry.tools(TEST_TOOL_MODEL),
          "learning_tool_search",
        )
        const loadTool = requireTool(
          await ToolRegistry.tools(TEST_TOOL_MODEL),
          "learning_tool_load",
        )

        await searchTool.execute(
          { query: "reflection" },
          createToolContext({
            sessionID: session.id,
            messageID: "msg_dynamic_tool_search_clear",
            agent: "buddy",
          }),
        )
        await loadTool.execute(
          { toolIds: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID] },
          createToolContext({
            sessionID: session.id,
            messageID: "msg_dynamic_tool_load_clear",
            agent: "buddy",
          }),
        )
        await searchTool.execute(
          { query: "stepwise solve" },
          createToolContext({
            sessionID: session.id,
            messageID: "msg_dynamic_tool_search_clear_second",
            agent: "buddy",
          }),
        )
        await loadTool.execute(
          { toolIds: [DYNAMIC_PEDAGOGY_STEPWISE_SOLVE_TOOL_ID] },
          createToolContext({
            sessionID: session.id,
            messageID: "msg_dynamic_tool_load_clear_second",
            agent: "buddy",
          }),
        )

        const grantedSession = await OpenCodeSession.get(SessionID.make(session.id))
        const grantedPermission = (grantedSession.permission ?? []).map((rule) =>
          Object.assign({}, rule),
        )
        await clearDynamicLearningToolGrantsForSession({
          directory: project.path,
          sessionID: session.id,
        })
        const clearedSession = await OpenCodeSession.get(SessionID.make(session.id))
        const clearedPermission = (clearedSession.permission ?? []).map((rule) =>
          Object.assign({}, rule),
        )
        const remainingToolIDs = (await ToolRegistry.tools(TEST_TOOL_MODEL)).map((tool) => tool.id)

        return {
          grantedPermission,
          clearedPermission,
          remainingToolIDs,
        }
      },
    })

    expect(result.grantedPermission).toContainEqual({
      permission: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
      pattern: "*",
      action: "allow",
    })
    expect(result.grantedPermission).toContainEqual({
      permission: DYNAMIC_PEDAGOGY_STEPWISE_SOLVE_TOOL_ID,
      pattern: "*",
      action: "allow",
    })
    expect(result.clearedPermission).not.toContainEqual({
      permission: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
      pattern: "*",
      action: "allow",
    })
    expect(result.clearedPermission).toEqual(
      expect.arrayContaining(dynamicLearningToolDefaultDenyRules()),
    )
    expect(result.remainingToolIDs).not.toContain(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)
    expect(result.remainingToolIDs).not.toContain(DYNAMIC_PEDAGOGY_STEPWISE_SOLVE_TOOL_ID)
  })

  test("dynamic grants are unregistered when a session ends before the next Buddy turn", async () => {
    await using project = await tmpdir({ git: true })

    await registerRuntimeTools(project.path, {
      ...disabledToolFlags(),
      toolDiscovery: true,
    })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const session = await OpenCodeSession.create({})
        const searchTool = requireTool(
          await ToolRegistry.tools(TEST_TOOL_MODEL),
          "learning_tool_search",
        )
        const loadTool = requireTool(
          await ToolRegistry.tools(TEST_TOOL_MODEL),
          "learning_tool_load",
        )

        await searchTool.execute(
          { query: "reflection" },
          createToolContext({
            sessionID: session.id,
            messageID: "msg_dynamic_tool_search_end",
            agent: "buddy",
          }),
        )
        await loadTool.execute(
          { toolIds: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID] },
          createToolContext({
            sessionID: session.id,
            messageID: "msg_dynamic_tool_load_end",
            agent: "buddy",
          }),
        )

        const grantedSession = await OpenCodeSession.get(SessionID.make(session.id))
        const grantedPermission = (grantedSession.permission ?? []).map((rule) =>
          Object.assign({}, rule),
        )
        await clearDynamicLearningToolsForEndedSession({
          directory: project.path,
          sessionID: session.id,
        })
        const remainingToolIDs = (await ToolRegistry.tools(TEST_TOOL_MODEL)).map((tool) => tool.id)
        const preservedSession = await OpenCodeSession.get(SessionID.make(session.id))

        return {
          grantedPermission,
          remainingToolIDs,
          endedSessionPermission: preservedSession.permission ?? [],
        }
      },
    })

    expect(result.grantedPermission).toContainEqual({
      permission: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
      pattern: "*",
      action: "allow",
    })
    expect(result.remainingToolIDs).not.toContain(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)
    expect(result.endedSessionPermission).not.toContainEqual({
      permission: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
      pattern: "*",
      action: "allow",
    })
    expect(result.endedSessionPermission).toEqual(
      expect.arrayContaining(dynamicLearningToolDefaultDenyRules()),
    )
  })

  test("runtime subagents default-deny directory-registered dynamic tools", () => {
    const practiceAgent = listBuddySubagents().find((agent) => agent.key === "practice-agent")
    if (!practiceAgent?.agent.permission || typeof practiceAgent.agent.permission === "string") {
      throw new Error("Practice agent must define structured permissions for this test")
    }

    expect(
      disabledByModelToolFilter({
        toolIDs: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID],
        agentPermission: practiceAgent.agent.permission,
      }).has(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID),
    ).toBe(true)
  })
})
