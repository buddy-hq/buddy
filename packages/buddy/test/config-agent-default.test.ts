import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
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

describe("config default_agent", () => {
  test("rejects subagent as default_agent", async () => {
    const repo = createGitRepo("buddy-config-default-agent-sub")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          default_agent: "curriculum-builder",
        },
        null,
        2,
      ) + "\n",
    )

    await expect(
      withSyncedOpenCodeConfig(repo, () => OpenCodeAgent.defaultAgent()),
    ).rejects.toThrow("is a subagent")
  })

  test("uses configured primary default_agent", async () => {
    const repo = createGitRepo("buddy-config-default-agent-primary")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          default_agent: "coach",
          agent: {
            coach: {
              mode: "primary",
              description: "coaching mode",
              prompt: "You are a coaching agent.",
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    const selected = await withSyncedOpenCodeConfig(repo, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("coach")
  })

  test("resolves renamed primary default_agent from its display name", async () => {
    const repo = createGitRepo("buddy-config-default-agent-renamed")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          default_agent: "Senior Coach",
          agent: {
            coach: {
              mode: "primary",
              name: "Senior Coach",
              description: "coaching mode",
              prompt: "You are a coaching agent.",
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    const selected = await withSyncedOpenCodeConfig(repo, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("Senior Coach")
  })
})
