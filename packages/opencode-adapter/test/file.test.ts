import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Schema } from "effect"
import { File, rankNotebookFileSearchPaths } from "../src/file"
import { Instance } from "../src/instance"
import { Project } from "../src/project"

async function withTempProject<T>(fn: (directory: string, root: string) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-opencode-file-"))
  const directory = path.join(root, "project")
  await fs.mkdir(directory)

  try {
    return await fn(directory, root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe("File", () => {
  test("ranks filename matches ahead of path-only matches and enforces the result limit", () => {
    expect(
      rankNotebookFileSearchPaths({
        query: "search",
        paths: [
          "docs/search-notes.md",
          "src/features/search/index.ts",
          "src/notebook-search.ts",
          "src/unrelated.ts",
        ],
        limit: 2,
      }),
    ).toEqual(["docs/search-notes.md", "src/notebook-search.ts"])
  })

  test("streams bounded notebook file matches without dependency or Buddy internals", async () => {
    await withTempProject(async (directory) => {
      await fs.mkdir(path.join(directory, "src"), { recursive: true })
      await fs.mkdir(path.join(directory, "node_modules", "search-package"), {
        recursive: true,
      })
      await fs.mkdir(path.join(directory, ".buddy"), { recursive: true })
      await Promise.all([
        fs.writeFile(path.join(directory, "src", "search-panel.ts"), ""),
        fs.writeFile(path.join(directory, "search-notes.md"), ""),
        fs.writeFile(
          path.join(directory, "node_modules", "search-package", "index.ts"),
          "",
        ),
        fs.writeFile(path.join(directory, ".buddy", "search-state.json"), ""),
      ])

      const project = Schema.decodeUnknownSync(Project.Info)({
        id: "test-project",
        worktree: directory,
        time: {
          created: 0,
          updated: 0,
        },
        sandboxes: [],
      })
      const result = await Instance.restore(
        {
          directory,
          worktree: directory,
          project,
        },
        () => File.searchPaths({ query: "search", limit: 10 }),
      )

      expect(result).toEqual({
        matches: ["search-notes.md", "src/search-panel.ts"],
        partial: false,
      })
    })
  })

  test("honors an already-aborted notebook file search", async () => {
    await withTempProject(async (directory) => {
      await fs.writeFile(path.join(directory, "search-notes.md"), "")
      const project = Schema.decodeUnknownSync(Project.Info)({
        id: "test-project",
        worktree: directory,
        time: {
          created: 0,
          updated: 0,
        },
        sandboxes: [],
      })
      const controller = new AbortController()
      controller.abort()

      await expect(
        Instance.restore(
          {
            directory,
            worktree: directory,
            project,
          },
          () =>
            File.searchPaths({
              query: "search",
              signal: controller.signal,
            }),
        ),
      ).rejects.toThrow()
    })
  })

  test("reports a partial result when the bounded path scan reaches its cap", async () => {
    await withTempProject(async (directory) => {
      await Promise.all([
        fs.writeFile(path.join(directory, "search-one.md"), ""),
        fs.writeFile(path.join(directory, "search-two.md"), ""),
      ])
      const project = Schema.decodeUnknownSync(Project.Info)({
        id: "test-project",
        worktree: directory,
        time: {
          created: 0,
          updated: 0,
        },
        sandboxes: [],
      })

      const result = await Instance.restore(
        {
          directory,
          worktree: directory,
          project,
        },
        () =>
          File.searchPaths({
            query: "search",
            limit: 10,
            scanLimit: 1,
          }),
      )

      expect(result.matches).toHaveLength(1)
      expect(result.partial).toBeTrue()
    })
  })

  test("rejects symlinked paths outside the instance directory", async () => {
    await withTempProject(async (directory, root) => {
      const outsidePath = path.join(root, "outside.txt")
      const outsideDirectory = path.join(root, "outside-directory")
      const fileLinkPath = path.join(directory, "outside-link.txt")
      const directoryLinkPath = path.join(directory, "outside-directory-link")
      await fs.writeFile(outsidePath, "outside secret\n", "utf8")
      await fs.mkdir(outsideDirectory)
      await fs.symlink(outsidePath, fileLinkPath)
      await fs.symlink(outsideDirectory, directoryLinkPath)

      const project = Schema.decodeUnknownSync(Project.Info)({
        id: "test-project",
        worktree: directory,
        time: {
          created: 0,
          updated: 0,
        },
        sandboxes: [],
      })

      await expect(
        Instance.restore(
          {
            directory,
            worktree: directory,
            project,
          },
          () => File.read("outside-link.txt"),
        ),
      ).rejects.toThrow("Access denied")
      await expect(
        Instance.restore(
          {
            directory,
            worktree: directory,
            project,
          },
          () => File.list("outside-directory-link"),
        ),
      ).rejects.toThrow("Access denied")
    })
  })
})
