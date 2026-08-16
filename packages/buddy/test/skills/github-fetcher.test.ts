import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import type { SkillSourceRef } from "../../src/learning/skill-management/service/catalog-schemas"
import {
  fetchPinnedGitHubSkill,
  type GitCommandRunner,
} from "../../src/learning/skill-management/service/github-fetcher"

const COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567"

type MockGitRunner = {
  commands: string[][]
  runGit: GitCommandRunner
}

function githubSource(pathValue: string): SkillSourceRef {
  return {
    type: "github",
    repo: "buddy/example-skills",
    path: pathValue,
    ref: COMMIT_SHA,
  }
}

function mockGitRunner(onCheckout: (cwd: string) => Promise<void>): MockGitRunner {
  const commands: string[][] = []
  return {
    commands,
    runGit: async ({ args, cwd }) => {
      commands.push(args)
      if (args[0] === "checkout") {
        await onCheckout(cwd)
      }
      return { code: 0, stdout: "", stderr: "" }
    },
  }
}

async function writeFetchedSkill(
  cwd: string,
  content = "---\nname: fetched\n---\n",
): Promise<void> {
  const skillRoot = path.join(cwd, "skills", "fetched")
  await fsp.mkdir(skillRoot, { recursive: true })
  await fsp.writeFile(path.join(skillRoot, "SKILL.md"), content, "utf8")
}

describe("pinned GitHub skill fetcher", () => {
  test("fetches a pinned repo path and returns the exact skill root", async () => {
    const git = mockGitRunner(async (cwd) => {
      await writeFetchedSkill(cwd)
    })

    const fetched = await fetchPinnedGitHubSkill(githubSource("skills/fetched"), {
      runGit: git.runGit,
      remoteBaseUrl: "file:///tmp/github",
    })

    try {
      expect(fetched.skillRoot.endsWith(path.join("skills", "fetched"))).toBe(true)
      expect(fetched.stats.fileCount).toBe(1)
      expect(git.commands).toContainEqual(["config", "core.autocrlf", "false"])
      expect(git.commands).toContainEqual(["config", "core.eol", "lf"])
      expect(git.commands).toContainEqual(["fetch", "--depth", "1", "origin", COMMIT_SHA])
      expect(git.commands).toContainEqual(["sparse-checkout", "set", "skills/fetched"])
      expect(git.commands).toContainEqual([
        "remote",
        "add",
        "origin",
        "file:///tmp/github/buddy/example-skills.git",
      ])
    } finally {
      await fetched.cleanup()
    }
  })

  test("rejects mutable refs before running git", async () => {
    const git = mockGitRunner(async () => undefined)
    await expect(
      fetchPinnedGitHubSkill(
        { ...githubSource("skills/fetched"), ref: "main" },
        { runGit: git.runGit },
      ),
    ).rejects.toThrow("commit SHA")
    expect(git.commands).toEqual([])
  })

  test("fails when the fetched path is missing SKILL.md", async () => {
    const git = mockGitRunner(async (cwd) => {
      await fsp.mkdir(path.join(cwd, "skills", "fetched"), { recursive: true })
    })

    await expect(
      fetchPinnedGitHubSkill(githubSource("skills/fetched"), { runGit: git.runGit }),
    ).rejects.toThrow("SKILL.md")
  })

  test("enforces total artifact limits before returning", async () => {
    const git = mockGitRunner(async (cwd) => {
      await writeFetchedSkill(cwd, "x".repeat(32))
    })

    await expect(
      fetchPinnedGitHubSkill(githubSource("skills/fetched"), {
        runGit: git.runGit,
        limits: { maxTotalBytes: 8 },
      }),
    ).rejects.toThrow("limit")
  })

  test("allows large single files when the total tree stays within limits", async () => {
    const git = mockGitRunner(async (cwd) => {
      await writeFetchedSkill(cwd, "x".repeat(32))
    })

    const fetched = await fetchPinnedGitHubSkill(githubSource("skills/fetched"), {
      runGit: git.runGit,
      limits: { maxFileBytes: 8, maxTotalBytes: 128 },
    })

    try {
      expect(fetched.stats.fileCount).toBe(1)
      expect(fetched.stats.totalBytes).toBe(32)
    } finally {
      await fetched.cleanup()
    }
  })
})
