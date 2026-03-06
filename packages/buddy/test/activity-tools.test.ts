import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensureActivityToolsRegistered } from "../src/learning/activities/tools/register.js"
import { writeTeachingSessionState } from "../src/learning/runtime/session-state.js"
import { tmpdir } from "./fixture/fixture"

function createToolContext() {
  return {
    sessionID: "ses_activity",
    messageID: "msg_activity",
    agent: "buddy",
    abort: new AbortController().signal,
    messages: [],
    metadata() {},
    async ask() {},
  }
}

describe("activity tools", () => {
  test("registers first-class activity tools and generates grounded activity artifacts", async () => {
    await using project = await tmpdir({ git: true })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        writeTeachingSessionState(project.path, {
          sessionId: "ses_activity",
          persona: "buddy",
          intentOverride: "learn",
          currentSurface: "curriculum",
          workspaceState: "chat",
          focusGoalIds: [],
        })

        await ensureActivityToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })

        expect(tools.some((tool) => tool.id === "activity_explanation")).toBe(true)
        expect(tools.some((tool) => tool.id === "activity_guided_practice")).toBe(true)
        expect(tools.some((tool) => tool.id === "activity_mastery_check")).toBe(true)

        const explanation = tools.find((tool) => tool.id === "activity_explanation")!
        const guidedPractice = tools.find((tool) => tool.id === "activity_guided_practice")!
        const ctx = createToolContext()

        return {
          explanation: await explanation.execute({ topic: "input validation in Tauri commands" }, ctx),
          guidedPractice: await guidedPractice.execute({ topic: "input validation in Tauri commands" }, ctx),
        }
      },
    })

    expect(result.explanation.output).toContain("<activity_tool_output name=\"activity_explanation\">")
    expect(result.explanation.output).toContain("input validation in Tauri commands")
    expect(result.guidedPractice.output).toContain("<activity_tool_output name=\"activity_guided_practice\">")
    expect(result.guidedPractice.output).toContain("Hint ladder:")
  })
})
