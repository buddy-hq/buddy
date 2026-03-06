import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { LearnerPath } from "../src/learning/learner/path.js"
import { ensureGoalToolsRegistered } from "../src/learning/goals/tools/register.js"
import { tmpdir } from "./fixture/fixture"

function createToolContext() {
  return {
    sessionID: "ses_goals",
    messageID: "msg_goals",
    agent: "goal-writer",
    abort: new AbortController().signal,
    messages: [],
    metadata() {},
    async ask() {},
  }
}

describe("goal tools", () => {
  test("goal_commit persists learner-store goals", async () => {
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
            learnerRequest: "I want to learn Tauri IPC by shipping a small feature.",
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to implement a Tauri command that validates inputs and returns structured errors.",
                actionVerb: "implement",
                task: "Implement a Tauri command that validates inputs and returns structured errors.",
                cognitiveLevel: "Application",
                howToTest: "Ship a minimal Tauri command and run a smoke test that exercises valid and invalid inputs.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to trace an IPC request from the frontend to the Rust command handler using logs and breakpoints.",
                actionVerb: "trace",
                task: "Trace an IPC request end-to-end from UI call site to Rust handler.",
                cognitiveLevel: "Analysis",
                howToTest: "Add logs and use a debugger to show the request path for one example command.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to write a focused regression test that proves a Tauri IPC bug is fixed.",
                actionVerb: "write",
                task: "Write a focused regression test for a Tauri IPC bugfix.",
                cognitiveLevel: "Application",
                howToTest: "Create a failing test for a known issue, apply the fix, and verify the test passes.",
              },
            ],
            rationaleSummary: "Optimized for shipping a small feature that uses IPC.",
          },
          ctx,
        )
      },
    })

    const raw = await fs.readFile(filepath, "utf8")
    const parsed = JSON.parse(raw) as {
      goals: Array<{ archivedAt?: string; setId: string; goalId: string; workspaceRefs: string[] }>
    }

    expect(parsed.goals).toHaveLength(3)
    expect(new Set(parsed.goals.map((goal) => goal.setId)).size).toBe(1)

    for (const goal of parsed.goals) {
      expect(goal.goalId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(goal.archivedAt).toBeUndefined()
      expect(goal.workspaceRefs).toHaveLength(1)
    }
  })
})
