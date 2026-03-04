import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Config, InvalidError } from "../src/config/config.ts"
import { withSyncedOpenCodeConfig } from "./helpers/opencode.js"

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

describe("config default_mode", () => {
  test("defaults to buddy when no default_mode is configured", async () => {
    const repo = createGitRepo("buddy-config-default-mode-default")

    const selected = await withSyncedOpenCodeConfig(repo, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("buddy")
  })

  test("uses configured code-buddy as default_mode", async () => {
    const repo = createGitRepo("buddy-config-default-mode-code")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          default_mode: "code-buddy",
        },
        null,
        2,
      ) + "\n",
    )

    const selected = await withSyncedOpenCodeConfig(repo, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("code-buddy")
  })

  test("uses configured math-buddy as default_mode", async () => {
    const repo = createGitRepo("buddy-config-default-mode-math")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          default_mode: "math-buddy",
        },
        null,
        2,
      ) + "\n",
    )

    const selected = await withSyncedOpenCodeConfig(repo, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("math-buddy")
  })

  test("propagates hidden modes into the runtime agent catalog", async () => {
    const repo = createGitRepo("buddy-config-hidden-mode")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          modes: {
            "code-buddy": {
              hidden: true,
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    const codeBuddy = await withSyncedOpenCodeConfig(repo, async () => OpenCodeAgent.get("code-buddy"))

    expect(codeBuddy?.hidden).toBe(true)
  })

  test("rejects configs that hide every Buddy mode", async () => {
    const repo = createGitRepo("buddy-config-hidden-all-modes")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          modes: {
            buddy: {
              hidden: true,
            },
            "code-buddy": {
              hidden: true,
            },
            "math-buddy": {
              hidden: true,
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    await expect(Config.getProject(repo)).rejects.toBeInstanceOf(InvalidError)
    await expect(Config.getProject(repo)).rejects.toMatchObject({
      data: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: "At least one Buddy mode must remain visible",
          }),
        ]),
      },
    })
  })

  test("rejects surfaces overrides that remove the inherited default surface", async () => {
    const repo = createGitRepo("buddy-config-invalid-default-surface")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          modes: {
            "code-buddy": {
              surfaces: ["curriculum"],
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    await expect(Config.getProject(repo)).rejects.toBeInstanceOf(InvalidError)
    await expect(Config.getProject(repo)).rejects.toMatchObject({
      data: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: 'defaultSurface "editor" must remain available for code-buddy',
          }),
        ]),
      },
    })
  })
})
