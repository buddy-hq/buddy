import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import { tmpdir } from "../helpers/tmpdir"

describe("permission routes", () => {
  test("returns the Buddy JSON error envelope for malformed permission reply JSON", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/permission/req_malformed/reply", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: '{"reply":"allow"',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    })
  })

  test("returns a JSON error payload when permission reply validation fails", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/permission/req_invalid/reply", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reply: "maybe",
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    })
  })
})
