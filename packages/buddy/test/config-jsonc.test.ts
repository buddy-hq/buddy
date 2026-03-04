import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Config, JsonError } from "../src/config/config.js"
import { InvalidError } from "../src/config/errors.js"

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
        '  "default_mode": "code-buddy",',
        '  "model": "anthropic/k2p5",',
        "}",
        "",
      ].join("\n"),
    )

    const cfg = await Config.getProject(repo)

    expect(cfg.default_mode).toBe("code-buddy")
    expect(cfg.model).toBe("anthropic/k2p5")
  })

  test("returns line and column diagnostics for invalid jsonc", async () => {
    const repo = createGitRepo("buddy-config-jsonc-invalid")
    const badConfig = path.join(repo, "bad.jsonc")
    writeFileSync(
      badConfig,
      [
        "{",
        '  "model": ',
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

  test("rejects configurations that hide every Buddy mode", async () => {
    const repo = createGitRepo("buddy-config-jsonc-hidden-all")
    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      [
        "{",
        '  "modes": {',
        '    "buddy": { "hidden": true },',
        '    "code-buddy": { "hidden": true },',
        '    "math-buddy": { "hidden": true }',
        "  }",
        "}",
        "",
      ].join("\n"),
    )

    await expect(Config.getProject(repo)).rejects.toBeInstanceOf(InvalidError)
  })
})
