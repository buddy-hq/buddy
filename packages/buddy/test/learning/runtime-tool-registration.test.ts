import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import type { LearningToolRegistrationFlags } from "../../src/learning/tools/register-runtime-tools"
import { registerRuntimeTools } from "../../src/learning/tools/register-runtime-tools"
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
})
