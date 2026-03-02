import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { app } from "../src/index.ts"
import { Global } from "../src/storage/global.js"

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

function createGitRepo(prefix: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  runGit(root, ["init", "-q"])
  writeFileSync(path.join(root, "README.md"), "# test\n")
  runGit(root, ["add", "README.md"])
  runGit(root, ["-c", "user.email=buddy@test.local", "-c", "user.name=Buddy Test", "commit", "-qm", "init"])
  return root
}

describe("config routes", () => {
  test("patches and returns project config", async () => {
    const repo = createGitRepo("buddy-route-config-project")

    const patchResponse = await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": repo,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        default_agent: "build",
        compaction: {
          auto: false,
        },
      }),
    })

    expect(patchResponse.status).toBe(200)

    const getResponse = await app.request("/api/config", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(getResponse.status).toBe(200)
    const body = (await getResponse.json()) as {
      default_agent?: string
      compaction?: {
        auto?: boolean
      }
    }

    expect(body.default_agent).toBe("build")
    expect(body.compaction?.auto).toBe(false)
    expect(fs.existsSync(path.join(repo, "buddy.jsonc")) || fs.existsSync(path.join(repo, "buddy.json"))).toBe(true)
  })

  test("uses only the project root config when nested folders are opened", async () => {
    const repo = createGitRepo("buddy-route-config-root-only")
    const nested = path.join(repo, "nested")
    fs.mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(nested, "buddy.jsonc"), '{"default_agent":"nested-only"}\n')

    const patchResponse = await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": nested,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        default_agent: "build",
      }),
    })

    expect(patchResponse.status).toBe(200)

    const getResponse = await app.request("/api/config", {
      headers: {
        "x-buddy-directory": nested,
      },
    })

    expect(getResponse.status).toBe(200)
    const body = (await getResponse.json()) as {
      default_agent?: string
    }

    expect(body.default_agent).toBe("build")
    expect(fs.readFileSync(path.join(nested, "buddy.jsonc"), "utf8")).toContain('"default_agent":"nested-only"')
    expect(fs.existsSync(path.join(repo, "buddy.jsonc")) || fs.existsSync(path.join(repo, "buddy.json"))).toBe(true)
  })

  test("returns and patches global config", async () => {
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    fs.mkdirSync(path.dirname(globalFile), { recursive: true })
    const previousGlobal = fs.existsSync(globalFile) ? fs.readFileSync(globalFile, "utf8") : undefined

    try {
      const getBefore = await app.request("/api/config", {
        headers: {
          "x-buddy-directory": process.cwd(),
        },
      })
      expect(getBefore.status).toBe(200)

      const patch = await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: "route-global-user",
        }),
      })
      expect(patch.status).toBe(200)

      const getAfter = await app.request("/api/global/config")
      expect(getAfter.status).toBe(200)
      const afterBody = (await getAfter.json()) as { username?: string }
      expect(afterBody.username).toBe("route-global-user")
    } finally {
      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, { force: true })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await app.request("/api/global/config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      })
    }
  })

  test("returns 400 for invalid project config on provider listing", async () => {
    const repo = createGitRepo("buddy-route-config-providers-invalid")
    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      [
        "{",
        '  "instructions": [',
        '    "./notes.md",',
        "  ",
        "",
      ].join("\n"),
    )

    const response = await app.request("/api/config/providers", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    })
  })
})
