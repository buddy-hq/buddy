import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { closeOpenCodeHost } from "../src/opencode-runtime/runtime"
import { Hono } from "hono"
import { ReferenceRoutes } from "../src/routes/reference"
const app = new Hono().route("/api/reference", ReferenceRoutes)
import { tmpdir } from "./helpers/tmpdir"

describe("OpenCode v2 reference routes", () => {
  afterAll(async () => {
    await closeOpenCodeHost()
  })

  test("returns the exact v2 location and reference catalog contract", async () => {
    await using project = await tmpdir({ git: true })
    const referenceDirectory = path.join(project.path, "shared-docs")
    await fs.mkdir(referenceDirectory)
    await fs.writeFile(
      path.join(project.path, "opencode.jsonc"),
      JSON.stringify({
        references: {
          docs: {
            path: referenceDirectory,
            description: "Shared documentation",
          },
        },
      }),
    )
    const resolvedProjectDirectory = await fs.realpath(project.path)


    const response = await app.request("/api/reference", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      location: {
        directory: resolvedProjectDirectory,
        project: {
          directory: resolvedProjectDirectory,
        },
      },
      data: [
        {
          name: "docs",
          path: referenceDirectory,
          description: "Shared documentation",
          source: {
            type: "local",
            path: referenceDirectory,
          },
        },
      ],
    })
  })

  test("rejects reference reads outside allowed roots", async () => {
    const response = await app.request("/api/reference", {
      headers: {
        "x-buddy-directory": "/",
      },
    })

    expect(response.status).toBe(403)
  })
})
