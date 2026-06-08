import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Schema } from "effect"
import { File } from "../src/file"
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
