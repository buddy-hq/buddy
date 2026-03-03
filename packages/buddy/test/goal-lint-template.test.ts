import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensureGoalToolsRegistered } from "../src/learning/goals/tools/register.js"
import { tmpdir } from "./fixture/fixture"

function createToolContext() {
  return {
    sessionID: "ses_goal_lint",
    messageID: "msg_goal_lint",
    agent: "goal-writer",
    abort: new AbortController().signal,
    messages: [],
    metadata() {},
    async ask() {},
  }
}

describe("goal_lint", () => {
  test("rejects the 'students will be able to' template", async () => {
    await using project = await tmpdir({ git: true })

    const report = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureGoalToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const goalLint = tools.find((tool) => tool.id === "goal_lint")

        expect(goalLint).toBeDefined()

        const ctx = createToolContext()
        const result = await goalLint!.execute(
          {
            scope: "topic",
            explicitlyRequestedSingleGoal: true,
            goals: [
              {
                statement:
                  "At the end of this topic, students will be able to implement a Tauri command that validates inputs and returns structured errors.",
                actionVerb: "implement",
                task: "Implement a Tauri command that validates inputs and returns structured errors.",
                cognitiveLevel: "Application",
                howToTest: "Ship a minimal command and run a smoke test that covers valid and invalid inputs.",
              },
            ],
          },
          ctx,
        )

        return JSON.parse(result.output) as {
          ok: boolean
          errors: Array<{ code: string }>
        }
      },
    })

    expect(report.ok).toBe(false)
    expect(report.errors.some((issue) => issue.code === "TEMPLATE_MISMATCH")).toBe(true)
  })

  test("accepts the 'you will be able to' template", async () => {
    await using project = await tmpdir({ git: true })

    const report = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureGoalToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const goalLint = tools.find((tool) => tool.id === "goal_lint")

        expect(goalLint).toBeDefined()

        const ctx = createToolContext()
        const result = await goalLint!.execute(
          {
            scope: "topic",
            explicitlyRequestedSingleGoal: true,
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to implement a Tauri command that validates inputs and returns structured errors.",
                actionVerb: "implement",
                task: "Implement a Tauri command that validates inputs and returns structured errors.",
                cognitiveLevel: "Application",
                howToTest: "Ship a minimal command and run a smoke test that covers valid and invalid inputs.",
              },
            ],
          },
          ctx,
        )

        return JSON.parse(result.output) as {
          ok: boolean
          errors: Array<unknown>
        }
      },
    })

    expect(report.ok).toBe(true)
    expect(report.errors).toHaveLength(0)
  })

  test("still errors on vague verbs", async () => {
    await using project = await tmpdir({ git: true })

    const report = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureGoalToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const goalLint = tools.find((tool) => tool.id === "goal_lint")

        expect(goalLint).toBeDefined()

        const ctx = createToolContext()
        const result = await goalLint!.execute(
          {
            scope: "topic",
            explicitlyRequestedSingleGoal: true,
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to understand Tauri IPC error handling.",
                actionVerb: "understand",
                task: "Explain what structured IPC errors mean in this codebase.",
                cognitiveLevel: "Comprehension",
                howToTest: "Write a short explanation and map one real error payload to the expected UI behavior.",
              },
            ],
          },
          ctx,
        )

        return JSON.parse(result.output) as {
          ok: boolean
          errors: Array<{ code: string }>
        }
      },
    })

    expect(report.ok).toBe(false)
    expect(report.errors.some((issue) => issue.code === "VAGUE_VERB")).toBe(true)
  })
})

