import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { app } from "../../src/index"
import { createGitRepo } from "../helpers/repo"

describe("learner snapshot tool toggles", () => {
  test("hides disabled Buddy-managed tools from runtimeProfile", async () => {
    const repo = createGitRepo("buddy-learner-snapshot-tool-toggle")
    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          tools: {
            pedagogy_prepare_resource: false,
          },
        },
        null,
        2,
      ) + "\n",
    )

    const response = await app.request("/api/learner/snapshot?persona=buddy&intent=learn", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      runtimeProfile: {
        capabilityEnvelope: {
          tools: {
            pedagogy_prepare_resource: "deny",
          },
        },
      },
    })
  })
})
