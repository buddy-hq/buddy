import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { Project } from "../src/project"

const FIXED_COMMIT_DATE = "2026-01-01T00:00:00Z"
const LOCAL_PROJECT_ID_PREFIX = "buddy-local-"

function runGit(root: string, args: string[]): void {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: FIXED_COMMIT_DATE,
      GIT_COMMITTER_DATE: FIXED_COMMIT_DATE,
    },
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

async function createGitRepo(input: { commit?: boolean; remote?: string } = {}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-opencode-project-"))
  runGit(root, ["init", "-q"])

  if (input.commit) {
    await fs.writeFile(path.join(root, "README.md"), "# test\n", "utf8")
    runGit(root, ["add", "README.md"])
    runGit(root, [
      "-c",
      "user.email=buddy@test.local",
      "-c",
      "user.name=Buddy Test",
      "commit",
      "-qm",
      "init",
    ])
  }

  if (input.remote) {
    runGit(root, ["remote", "add", "origin", input.remote])
  }

  return root
}

describe("Project", () => {
  test("opens repositories when the local project cache cannot be written", async () => {
    const root = await createGitRepo()

    try {
      await fs.mkdir(path.join(root, ".git", "opencode"))

      const result = await Project.fromDirectory(root)

      expect(await fs.realpath(result.project.worktree)).toBe(await fs.realpath(root))
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test("keeps file-origin repositories distinct when git root commits collide", async () => {
    const first = await createGitRepo({ commit: true })
    const second = await createGitRepo({ commit: true })

    try {
      runGit(first, ["remote", "add", "origin", `file://${first}`])
      runGit(second, ["remote", "add", "origin", `file://${second}`])

      const firstProject = await Project.fromDirectory(first)
      const secondProject = await Project.fromDirectory(second)

      expect(firstProject.project.id.startsWith(LOCAL_PROJECT_ID_PREFIX)).toBe(true)
      expect(secondProject.project.id.startsWith(LOCAL_PROJECT_ID_PREFIX)).toBe(true)
      expect(firstProject.project.id).not.toBe(secondProject.project.id)
    } finally {
      await fs.rm(first, { recursive: true, force: true })
      await fs.rm(second, { recursive: true, force: true })
    }
  })
})
