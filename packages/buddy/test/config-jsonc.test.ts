import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Config, JsonError } from "../src/config/config.js"

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

describe("config jsonc", () => {
  test("parses comments and trailing commas", async () => {
    const repo = createGitRepo("buddy-config-jsonc")
    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      [
        "{",
        '  // JSONC comment',
        '  "instructions": ["./notes.md",],',
        '  "compaction": { "auto": false, },',
        "}",
        "",
      ].join("\n"),
    )

    const cfg = await Config.getProject(repo)

    expect(cfg.instructions).toEqual(["./notes.md"])
    expect(cfg.compaction?.auto).toBe(false)
  })

  test("returns line and column diagnostics for invalid jsonc", async () => {
    const repo = createGitRepo("buddy-config-jsonc-invalid")
    const badConfig = path.join(repo, "bad.jsonc")
    writeFileSync(
      badConfig,
      [
        "{",
        '  "instructions": [',
        '    "./notes.md",',
        "  ",
        "",
      ].join("\n"),
    )

    const previous = process.env.BUDDY_CONFIG
    process.env.BUDDY_CONFIG = badConfig

    try {
      await expect(Config.getProject(repo)).rejects.toBeInstanceOf(JsonError)
    } finally {
      if (previous === undefined) {
        delete process.env.BUDDY_CONFIG
      } else {
        process.env.BUDDY_CONFIG = previous
      }
    }
  })
})
