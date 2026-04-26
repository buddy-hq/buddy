import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { SessionID } from "@buddy/opencode-adapter/id"
import type { LearningToolRegistrationFlags } from "../../src/learning/tools/register-runtime-tools"
import { PRACTICE_AGENT } from "../../src/learning/curriculum/practice/practice.agent"
import { SMOKE_PRACTICE_TOOL_ID } from "../../src/learning/tools/dynamic-tool-ids"
import { registerRuntimeTools } from "../../src/learning/tools/register-runtime-tools"
import { DEFAULT_PRIMARY_PERSONA_PERMISSION } from "../../src/learning/personas/wiring/define-buddy-persona"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

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

  test("dynamic tool search registers matching smoke-test tools", async () => {
    await using project = await tmpdir({ git: true })

    await registerRuntimeTools(project.path, {
      ...disabledToolFlags(),
      toolDiscovery: true,
    })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const initialTools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const searchTool = requireTool(initialTools, "learning_tool_search")
        const searchResult = await searchTool.execute(
          { query: "practice" },
          createToolContext({
            sessionID: "ses_dynamic_tool_search",
            messageID: "msg_dynamic_tool_search",
            agent: "buddy",
          }),
        )

        const nextTools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const practiceTool = requireTool(nextTools, "learning_smoke_practice_tool")
        const practiceResult = await practiceTool.execute(
          { note: "smoke" },
          createToolContext({
            sessionID: "ses_dynamic_tool_search",
            messageID: "msg_dynamic_practice_tool",
            agent: "buddy",
          }),
        )

        return {
          searchOutput: searchResult.output,
          practiceOutput: practiceResult.output,
          hasAssessmentTool: nextTools.some((tool) => tool.id === "learning_smoke_assessment_tool"),
        }
      },
    })

    expect(result.searchOutput).toContain("learning_smoke_practice_tool")
    expect(result.practiceOutput).toContain("Practice smoke tool loaded and executed.")
    expect(result.hasAssessmentTool).toBe(false)
  })

  test("dynamic smoke tools are directory-visible but primary-agent denied until search grants the session", async () => {
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

        await searchTool.execute(
          { query: "practice" },
          createToolContext({
            sessionID: searchedSession.id,
            messageID: "msg_dynamic_tool_search_permissions",
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

    expect(result.toolIDs).toContain(SMOKE_PRACTICE_TOOL_ID)
    expect(result.searchedPermission).toContainEqual({
      permission: SMOKE_PRACTICE_TOOL_ID,
      pattern: "*",
      action: "allow",
    })

    expect(
      disabledByModelToolFilter({
        toolIDs: [SMOKE_PRACTICE_TOOL_ID],
        agentPermission: DEFAULT_PRIMARY_PERSONA_PERMISSION,
        sessionPermission: result.searchedPermission,
      }).has(SMOKE_PRACTICE_TOOL_ID),
    ).toBe(false)
    expect(
      disabledByModelToolFilter({
        toolIDs: [SMOKE_PRACTICE_TOOL_ID],
        agentPermission: DEFAULT_PRIMARY_PERSONA_PERMISSION,
        sessionPermission: result.untouchedPermission,
      }).has(SMOKE_PRACTICE_TOOL_ID),
    ).toBe(true)
  })

  test("practice subagent does not currently default-deny directory-registered dynamic smoke tools", () => {
    expect(PRACTICE_AGENT.permission).toBeDefined()
    if (!PRACTICE_AGENT.permission || typeof PRACTICE_AGENT.permission === "string") {
      throw new Error("Practice agent must define structured permissions for this test")
    }

    expect(
      disabledByModelToolFilter({
        toolIDs: [SMOKE_PRACTICE_TOOL_ID],
        agentPermission: PRACTICE_AGENT.permission,
      }).has(SMOKE_PRACTICE_TOOL_ID),
    ).toBe(false)
  })
})
