import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensureCurriculumToolsRegistered } from "../src/learning/curriculum/tools/register.js"
import { tmpdir } from "./fixture/fixture"

function createToolContext() {
  return {
    sessionID: "ses_curriculum",
    messageID: "msg_curriculum",
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata() {},
    async ask() {},
  }
}

describe("curriculum tools", () => {
  test("reads the generated learning-plan view and does not register direct edit tools", async () => {
    await using project = await tmpdir({ git: true })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureCurriculumToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const curriculumRead = tools.find((tool) => tool.id === "curriculum_read")
        const curriculumUpdate = tools.find((tool) => tool.id === "curriculum_update")

        expect(curriculumRead).toBeDefined()
        expect(curriculumUpdate).toBeUndefined()

        const ctx = createToolContext()
        return curriculumRead!.execute({}, ctx)
      },
    })

    expect(result.output).toContain("# Learning Plan")
    expect(result.output).toContain("No relevant goals exist yet.")
  })
})
