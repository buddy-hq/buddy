import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { LearnerArtifactStore } from "../../src/learning/learner-model"
import type { GoalArtifact } from "../../src/learning/learner-model"
import { ensureGoalToolsRegistered } from "../../src/learning/curriculum/goals/tools/register"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

describe("goal tools", () => {
  test("goal_commit persists learner goals as markdown artifacts", async () => {
    await using project = await tmpdir({ git: true })

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureGoalToolsRegistered(project.path)
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
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to implement a desktop bridge command that validates inputs and returns structured errors.",
                actionVerb: "implement",
                task: "Implement a desktop bridge command that validates inputs and returns structured errors.",
                cognitiveLevel: "Application",
                howToTest:
                  "Ship a minimal desktop bridge command and run a smoke test that exercises valid and invalid inputs.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to trace a desktop bridge request from the React UI to the Electron handler using logs and breakpoints.",
                actionVerb: "trace",
                task: "Trace a desktop bridge request end-to-end from the UI call site to the Electron handler.",
                cognitiveLevel: "Analysis",
                howToTest:
                  "Add logs and use a debugger to show the request path for one example bridge call.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to write a focused regression test that proves a desktop bridge bug is fixed.",
                actionVerb: "write",
                task: "Write a focused regression test for a desktop bridge bugfix.",
                cognitiveLevel: "Application",
                howToTest:
                  "Create a failing test for a known issue, apply the fix, and verify the test passes.",
              },
            ],
            rationaleSummary:
              "Optimized for shipping a small feature that uses the desktop bridge.",
          },
          ctx,
        )
      },
    })

    const goals = (await LearnerArtifactStore.readArtifacts(project.path, "goal")) as GoalArtifact[]

    expect(goals).toHaveLength(3)
    expect(new Set(goals.map((goal) => goal.setId)).size).toBe(1)

    for (const goal of goals) {
      expect(goal.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(goal.status).toBe("active")
      expect(goal.workspaceRefs).toHaveLength(1)
    }
  })
})
