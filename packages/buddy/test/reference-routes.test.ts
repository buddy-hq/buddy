import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { app } from "../src"
import { syncOpenCodeProjectConfig } from "../src/config/runtime/opencode-sync"
import { tmpdir } from "./helpers/tmpdir"

describe("OpenCode v2 reference routes", () => {
  afterEach(async () => {
    await OpenCodeInstance.disposeAll()
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
            type: "local",
            path: referenceDirectory,
            description: "Shared documentation",
          },
        },
      }),
    )
    await syncOpenCodeProjectConfig(project.path, true)
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
