import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { listActiveGoals } from "../../src/learning/features/memory/goals/storage"
import { tmpdir } from "../helpers/tmpdir"
import {
  createToolContext,
  ensureBuddyPluginTools,
  requireTool,
  TEST_TOOL_MODEL,
} from "../helpers/tools"

describe("goal tools", () => {
  test("goal_commit persists learner goals as markdown artifacts", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const goalCommit = requireTool(tools, "goal_commit")

        const ctx = createToolContext({
          sessionID: "ses_goals",
          messageID: "msg_goals",
          agent: "goal-writer",
        })
        await goalCommit.execute(
          {
            scope: "topic",
            contextLabel: "Electron desktop bridge",
            learnerRequest:
              "I want to learn the Electron desktop bridge by shipping a small feature.",
            explicitlyRequestedSingleGoal: false,
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to implement a typed desktop bridge command.",
                actionVerb: "implement",
                task: "Implement a typed desktop bridge command.",
                cognitiveLevel: "Application",
                howToTest:
                  "Given one renderer call, return a typed success result and verify it in a test.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to identify the handler for a desktop bridge request.",
                actionVerb: "identify",
                task: "Identify the handler for one desktop bridge request.",
                cognitiveLevel: "Analysis",
                howToTest: "Given one renderer call, use logs to name the handler and payload.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to write a focused bridge regression test.",
                actionVerb: "write",
                task: "Write a focused bridge regression test.",
                cognitiveLevel: "Application",
                howToTest: "Given one known bridge bug, write a failing test and verify the fix.",
              },
            ],
            rationaleSummary:
              "Optimized for shipping a small feature that uses the desktop bridge.",
          },
          ctx,
        )
      },
    })

    const goals = await listActiveGoals(project.path)

    expect(goals).toHaveLength(3)
    expect(new Set(goals.map((goal) => goal.setId)).size).toBe(1)

    for (const goal of goals) {
      expect(goal.id).toMatch(/^goal_[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(goal.status).toBe("active")
    }
  })

  test("goal_commit rejects goals with blocking lint errors", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const goalCommit = requireTool(tools, "goal_commit")

        const ctx = createToolContext({
          sessionID: "ses_goals_invalid",
          messageID: "msg_goals_invalid",
          agent: "goal-writer",
        })

        await expect(
          goalCommit.execute(
            {
              scope: "topic",
              contextLabel: "Electron desktop bridge",
              learnerRequest: "I want one vague goal for the Electron desktop bridge.",
              explicitlyRequestedSingleGoal: true,
              goals: [
                {
                  statement:
                    "At the end of this topic, you will be able to understand desktop bridges.",
                  actionVerb: "understand",
                  task: "Desktop bridges.",
                  cognitiveLevel: "Comprehension",
                  howToTest: "Know the topic.",
                },
              ],
            },
            ctx,
          ),
        ).rejects.toThrow("goal_commit requires a passing goal_lint report")
      },
    })
  })
})
