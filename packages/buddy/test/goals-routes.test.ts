import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { app } from "../src/index.ts"
import { tmpdir } from "./fixture/fixture"

describe("goals routes", () => {
  test("rejects directories outside allowed roots", async () => {
    const response = await app.request("/api/learner/artifacts?kind=goal", {
      headers: {
        "x-buddy-directory": "/etc",
      },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Directory is outside allowed roots",
    })
  })

  test("returns parsed goal artifacts for an allowed directory", async () => {
    await using project = await tmpdir({ git: true })
    const now = new Date().toISOString()
    const goalId = "goal_test_1"
    const setId = "set_test_1"
    const workspaceId = "workspace_test_1"
    const goalsDir = path.join(project.path, ".buddy", "learner", "goals")
    await fs.mkdir(goalsDir, { recursive: true })
    await fs.writeFile(
      path.join(goalsDir, `${goalId}.md`),
      [
        "---",
        `id: "${goalId}"`,
        'kind: "goal"',
        `workspaceId: "${workspaceId}"`,
        "goalIds: []",
        'status: "active"',
        `setId: "${setId}"`,
        'scope: "topic"',
        'contextLabel: "Testing Goals"',
        'learnerRequest: "Learn to test goal parsing."',
        "assumptions: []",
        "openQuestions: []",
        'statement: "At the end, you can parse goals."',
        'actionVerb: "parse"',
        'task: "Parse the goal artifacts."',
        'cognitiveLevel: "Application"',
        'howToTest: "Confirm parsing works."',
        "dependsOnGoalIds: []",
        "buildsOnGoalIds: []",
        "reinforcesGoalIds: []",
        "conceptTags: []",
        "workspaceRefs: []",
        `createdAt: "${now}"`,
        `updatedAt: "${now}"`,
        "---",
        "",
      ].join("\n"),
      "utf8",
    )

    const response = await app.request("/api/learner/artifacts?kind=goal", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      artifacts: [
        expect.objectContaining({
          id: goalId,
          kind: "goal",
          contextLabel: "Testing Goals",
        }),
      ],
    })
  })
})
