import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
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
  test("can update curriculum immediately after curriculum_read", async () => {
    await using project = await tmpdir({ git: true })
    const filepath = path.join(project.path, ".buddy", "curriculum.md")

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
        expect(curriculumUpdate).toBeDefined()

        const ctx = createToolContext()
        const readResult = await curriculumRead!.execute({}, ctx)
        expect(readResult.output).toContain("# Learning Curriculum")

        return curriculumUpdate!.execute(
          {
            oldString: "- [ ] Define your learning goal for this workspace",
            newString: "- [x] Define your learning goal for this workspace",
          },
          ctx,
        )
      },
    })

    expect(result.output).toContain("Updated curriculum")
    expect(await fs.readFile(filepath, "utf8")).toContain("- [x] Define your learning goal for this workspace")
  })
})
