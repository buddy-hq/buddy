import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { commitGoalsV1Set } from "../src/learning/goals/goals-v1.js"
import { composeLearningSystemPrompt } from "../src/learning/shared/compose-system-prompt.js"
import { tmpdir } from "./fixture/fixture"

describe("composeLearningSystemPrompt (goals.v1)", () => {
  test("injects <learning_goals> and skips legacy <curriculum> when active goals exist", async () => {
    await using project = await tmpdir({ git: true })

    await fs.mkdir(path.join(project.path, ".buddy"), { recursive: true })
    await fs.writeFile(
      path.join(project.path, ".buddy", "curriculum.md"),
      ["# Learning Curriculum", "", "## Starter", "- [ ] Legacy curriculum task", ""].join("\n"),
      "utf8",
    )

    await commitGoalsV1Set({
      directory: project.path,
      scope: "topic",
      contextLabel: "Tauri IPC",
      learnerRequest: "I want to learn Tauri IPC by shipping a small feature.",
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
            "At the end of this topic, you will be able to debug an IPC failure by inspecting logs and payloads.",
          actionVerb: "debug",
          task: "Debug an IPC failure by inspecting logs and payloads.",
          cognitiveLevel: "Application",
          howToTest: "Reproduce a failure and capture logs that prove where the message is failing.",
        },
        {
          statement:
            "At the end of this topic, you will be able to write a focused regression test that proves an IPC bug is fixed.",
          actionVerb: "write",
          task: "Write a focused regression test that proves an IPC bug is fixed.",
          cognitiveLevel: "Application",
          howToTest: "Create a failing test for a known issue, apply the fix, and verify the test passes.",
        },
      ],
    })

    const system = await composeLearningSystemPrompt({
      directory: project.path,
      agentName: "build",
      userContent: "hello",
    })

    expect(system).toContain("<learning_goals>")
    expect(system).not.toContain("<curriculum>\nPath:")
  })
})
