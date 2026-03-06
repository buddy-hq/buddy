import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { LearnerPath } from "../src/learning/learner/path.js"
import { ensureGoalToolsRegistered } from "../src/learning/goals/tools/register.js"
import { tmpdir } from "./fixture/fixture"

function createToolContext() {
  return {
    sessionID: "ses_goals_archive",
    messageID: "msg_goals_archive",
    agent: "goal-writer",
    abort: new AbortController().signal,
    messages: [],
    metadata() {},
    async ask() {},
  }
}

describe("learner-store goal archiving", () => {
  test("committing a new set archives the previous active set for the same (scope, contextLabel)", async () => {
    await using project = await tmpdir({ git: true })
    const filepath = LearnerPath.goals()

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureGoalToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const goalCommit = tools.find((tool) => tool.id === "goal_commit")

        expect(goalCommit).toBeDefined()

        const ctx = createToolContext()
        await goalCommit!.execute(
          {
            scope: "topic",
            contextLabel: "Tauri IPC",
            learnerRequest: "First pass goals for Tauri IPC.",
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to implement a Tauri command that returns a typed result to the UI.",
                actionVerb: "implement",
                task: "Implement a Tauri command that returns a typed result to the UI.",
                cognitiveLevel: "Application",
                howToTest: "Implement a command, call it from the UI, and verify both success and error cases work.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to debug a Tauri IPC failure by inspecting logs and payloads.",
                actionVerb: "debug",
                task: "Debug a Tauri IPC failure by inspecting logs and payloads.",
                cognitiveLevel: "Application",
                howToTest: "Reproduce a failure and capture logs that prove where the message is failing.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to write a small integration test that exercises a Tauri command end-to-end.",
                actionVerb: "write",
                task: "Write a small integration test that exercises a Tauri command end-to-end.",
                cognitiveLevel: "Application",
                howToTest: "Write and run a test that executes a command and asserts on a structured response.",
              },
            ],
          },
          ctx,
        )

        await goalCommit!.execute(
          {
            scope: "topic",
            contextLabel: "Tauri IPC",
            learnerRequest: "Second pass goals for Tauri IPC (revised).",
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to implement a Tauri command that validates inputs and returns structured errors to the UI.",
                actionVerb: "implement",
                task: "Implement a Tauri command that validates inputs and returns structured errors to the UI.",
                cognitiveLevel: "Application",
                howToTest: "Run a smoke test that exercises both valid and invalid inputs and inspects the error structure.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to evaluate whether a command should be synchronous or asynchronous based on the UI experience.",
                actionVerb: "evaluate",
                task: "Evaluate whether a command should be synchronous or asynchronous based on the UI experience.",
                cognitiveLevel: "Evaluation",
                howToTest: "Compare two implementations and justify the choice with a short write-up and observed behavior.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to justify an IPC boundary by describing which logic belongs in Rust vs the UI layer.",
                actionVerb: "justify",
                task: "Justify an IPC boundary by describing which logic belongs in Rust vs the UI layer.",
                cognitiveLevel: "Evaluation",
                howToTest: "Explain one real feature split and defend the boundary choices against alternatives.",
              },
            ],
          },
          ctx,
        )
      },
    })

    const parsed = JSON.parse(await fs.readFile(filepath, "utf8")) as {
      goals: Array<{ archivedAt?: string; contextLabel: string; setId: string }>
    }

    const tauriSets = Array.from(
      parsed.goals
        .filter((goal) => goal.contextLabel === "Tauri IPC")
        .reduce<Map<string, Array<{ archivedAt?: string }>>>((all, goal) => {
          const existing = all.get(goal.setId) ?? []
          existing.push({ archivedAt: goal.archivedAt })
          all.set(goal.setId, existing)
          return all
        }, new Map())
        .values(),
    )

    expect(tauriSets).toHaveLength(2)
    expect(tauriSets[0].every((goal) => typeof goal.archivedAt === "string")).toBe(true)
    expect(tauriSets[1].every((goal) => goal.archivedAt === undefined)).toBe(true)
  })
})
