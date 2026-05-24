import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { listGoals } from "../../src/learning/features/memory/goals/storage"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, ensureBuddyPluginTools, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

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
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to implement a desktop bridge command that returns a typed result to the renderer.",
                actionVerb: "implement",
                task: "Implement a desktop bridge command that returns a typed result to the renderer.",
                cognitiveLevel: "Application",
                howToTest:
                  "Implement a bridge command, call it from the renderer, and verify both success and error cases work.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to debug a desktop bridge failure by inspecting logs and payloads.",
                actionVerb: "debug",
                task: "Debug a desktop bridge failure by inspecting logs and payloads.",
                cognitiveLevel: "Application",
                howToTest:
                  "Reproduce a failure and capture logs that prove where the message is failing.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to write a small integration test that exercises a desktop bridge command end-to-end.",
                actionVerb: "write",
                task: "Write a small integration test that exercises a desktop bridge command end-to-end.",
                cognitiveLevel: "Application",
                howToTest:
                  "Write and run a test that executes a command and asserts on a structured response.",
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
            goals: [
              {
                statement:
                  "At the end of this topic, you will be able to implement a desktop bridge command that validates inputs and returns structured errors to the renderer.",
                actionVerb: "implement",
                task: "Implement a desktop bridge command that validates inputs and returns structured errors to the renderer.",
                cognitiveLevel: "Application",
                howToTest:
                  "Run a quick validation check that exercises both valid and invalid inputs and inspects the error structure.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to evaluate whether a bridge action belongs in the main process or the renderer based on the UI experience.",
                actionVerb: "evaluate",
                task: "Evaluate whether a bridge action belongs in the main process or the renderer based on the UI experience.",
                cognitiveLevel: "Evaluation",
                howToTest:
                  "Compare two implementations and justify the choice with a short write-up and observed behavior.",
              },
              {
                statement:
                  "At the end of this topic, you will be able to justify a bridge boundary by describing which logic belongs in the main process vs the renderer.",
                actionVerb: "justify",
                task: "Justify a bridge boundary by describing which logic belongs in the main process vs the renderer.",
                cognitiveLevel: "Evaluation",
                howToTest:
                  "Explain one real feature split and defend the boundary choices against alternatives.",
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
