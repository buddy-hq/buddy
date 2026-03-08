import { describe, expect, test } from "bun:test"
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

    const response = await app.request("/api/learner/artifacts?kind=goal", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      artifacts: expect.any(Array),
    })
  })
})
