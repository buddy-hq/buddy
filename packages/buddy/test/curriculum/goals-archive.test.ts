import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { listGoals } from "../../src/learning/features/memory/goals/storage"
import { tmpdir } from "../helpers/tmpdir"
import {
  createToolContext,
  ensureBuddyPluginTools,
  requireTool,
  TEST_TOOL_MODEL,
} from "../helpers/tools"

describe("learner-store goal archiving", () => {
  test("committing a new set archives the previous active set for the same (scope, contextLabel)", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const goalCommit = requireTool(tools, "goal_commit")

        const ctx = createToolContext({
          sessionID: "ses_goals_archive",
          messageID: "msg_goals_archive",
          agent: "goal-writer",
        })
        await goalCommit.execute(
          {
            scope: "topic",
            contextLabel: "Electron desktop bridge",
            learnerRequest: "First pass goals for the Electron desktop bridge.",
            explicitlyRequestedSingleGoal: false,
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to implement a typed desktop bridge command.",
                actionVerb: "implement",
                task: "Implement a typed desktop bridge command.",
                cognitiveLevel: "Application",
                howToTest:
                  "Given one renderer call, return a typed result and verify it in a test.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to debug a desktop bridge failure.",
                actionVerb: "debug",
                task: "Debug a desktop bridge failure.",
                cognitiveLevel: "Application",
                howToTest:
                  "Given one failing bridge call, inspect logs to identify the failing handler.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to write a bridge regression test.",
                actionVerb: "write",
                task: "Write a bridge regression test.",
                cognitiveLevel: "Application",
                howToTest: "Given one known bridge bug, write a failing test and verify the fix.",
              },
            ],
          },
          ctx,
        )

        await goalCommit.execute(
          {
            scope: "topic",
            contextLabel: "Electron desktop bridge",
            learnerRequest: "Second pass goals for the Electron desktop bridge (revised).",
            explicitlyRequestedSingleGoal: false,
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to implement bridge input validation.",
                actionVerb: "implement",
                task: "Implement bridge input validation.",
                cognitiveLevel: "Application",
                howToTest:
                  "Given invalid input, return a structured error and verify the renderer response.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to evaluate a bridge process boundary.",
                actionVerb: "evaluate",
                task: "Evaluate a bridge process boundary.",
                cognitiveLevel: "Evaluation",
                howToTest:
                  "Given two boundary options, choose one and justify the user-visible behavior.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to justify a bridge boundary.",
                actionVerb: "justify",
                task: "Justify a bridge boundary.",
                cognitiveLevel: "Evaluation",
                howToTest: "Given one feature split, defend the boundary against one alternative.",
              },
            ],
          },
          ctx,
        )
      },
    })

    const goals = await listGoals(project.path)

    const tauriSets = Array.from(
      goals
        .filter((goal) => goal.contextLabel === "Electron desktop bridge")
        .reduce<Map<string, Array<{ status: "active" | "archived" }>>>((all, goal) => {
          if (!goal.setId) {
            return all
          }
          const existing = all.get(goal.setId) ?? []
          existing.push({ status: goal.status })
          all.set(goal.setId, existing)
          return all
        }, new Map())
        .values(),
    )
    const statusSets = tauriSets.map((set) => set.map((goal) => goal.status))
    const uniformStatusSets = statusSets.map((statuses) => Array.from(new Set(statuses)))

    expect(tauriSets).toHaveLength(2)
    expect(
      uniformStatusSets.filter((statuses) => statuses.length === 1 && statuses[0] === "archived"),
    ).toHaveLength(1)
    expect(
      uniformStatusSets.filter((statuses) => statuses.length === 1 && statuses[0] === "active"),
    ).toHaveLength(1)
  })
})
