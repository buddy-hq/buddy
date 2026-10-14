import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { tmpdir } from "../helpers/tmpdir"
import {
  readProjectTextFile,
  saveProjectTextFile,
  renameProjectTextFile,
} from "../../src/project/project-file-editor-service"
import { File } from "../../src/project/notebook-files"
import { scanNotebookFiles, scanNotebookFilesWithDeadline } from "../../src/project/notebook-file-scan"

async function withTempProject<T>(fn: (directory: string, root: string) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-opencode-file-"))
  const directory = path.join(root, "project")

  try {
    await fs.mkdir(directory)
    return await fn(directory, root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe("File", () => {
  test("reports a missing scan root as a failure rather than no matches", async () => {
    await withTempProject(async (directory) => {
      await fs.rm(directory, { recursive: true })
      await expect(scanNotebookFiles({ directory, limit: 10 })).rejects.toMatchObject({
        code: "ENOENT",
      })
    })
  })
  test("lists notebook files, skipping dependency caches and Buddy internals but not ordinary folder names", async () => {
    await withTempProject(async (directory) => {
      const files = [
        "src/search-panel.ts",
        "search-notes.md",
        "build/essay-draft.md",
        "out/reading-log.md",
        "vendor/supplier-notes.md",
        "node_modules/search-package/index.ts",
        "__pycache__/cache.pyc",
        ".buddy/search-state.json",
      ]
      for (const file of files) {
        await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true })
        await fs.writeFile(path.join(directory, file), "")
      }
      const result = await File.listSearchPaths(directory)

      expect(result.partial).toBeFalse()
      expect(result.paths.toSorted()).toEqual([
        "build/essay-draft.md",
        "out/reading-log.md",
        "search-notes.md",
        "src/search-panel.ts",
        "vendor/supplier-notes.md",
      ])
    })
  })

  test("walks the notebook on every load, so new files appear immediately", async () => {
    await withTempProject(async (directory) => {
      await fs.writeFile(path.join(directory, "first-note.md"), "")

      await (async () => {
        expect((await File.listSearchPaths(directory)).paths).toEqual(["first-note.md"])
        await fs.writeFile(path.join(directory, "second-note.md"), "")
        expect((await File.listSearchPaths(directory)).paths).toEqual(["first-note.md", "second-note.md"])
      })()
    })
  })

  test("lists paths in a stable order, so an unchanged notebook loads identically", async () => {
    await withTempProject(async (directory) => {
      await fs.mkdir(path.join(directory, "b"))
      for (const file of ["z.md", "a.md", "b/c.md", "B.md"]) {
        await fs.writeFile(path.join(directory, file), "")
      }

      await (async () => {
        const expected = ["B.md", "a.md", "b/c.md", "z.md"]
        expect((await File.listSearchPaths(directory)).paths).toEqual(expected)
        expect((await File.listSearchPaths(directory)).paths).toEqual(expected)
      })()
    })
  })

  test("a load during another walk gets its own walk and sees files that walk missed", async () => {
    await withTempProject(async (directory) => {
      await fs.writeFile(path.join(directory, "first-note.md"), "")
      const firstStarted = Promise.withResolvers<void>()
      const firstComplete = Promise.withResolvers<void>()
      let walks = 0
      const scanFiles = async (input: { directory: string }) => {
        walks += 1
        const paths = (await fs.readdir(input.directory)).toSorted()
        if (walks === 1) {
          firstStarted.resolve()
          await firstComplete.promise
        }
        return { paths, partial: false }
      }
      const input = { directory, limit: 10 }
      const first = scanNotebookFilesWithDeadline(input, scanFiles)
      await firstStarted.promise
      await fs.writeFile(path.join(directory, "second-note.md"), "")
      const second = scanNotebookFilesWithDeadline(input, scanFiles)
      firstComplete.resolve()
      expect(await first).toEqual({ paths: ["first-note.md"], partial: false })
      expect(await second).toEqual({ paths: ["first-note.md", "second-note.md"], partial: false })
      expect(walks).toBe(2)
    })
  })

  test("cancelling a load stops its walk", async () => {
    const started = Promise.withResolvers<void>()
    const controller = new AbortController()
    let walkSignal: AbortSignal | undefined
    const scan = scanNotebookFilesWithDeadline(
      { directory: "/isolated-cancel", limit: 10, signal: controller.signal },
      async ({ signal }) => {
        walkSignal = signal
        started.resolve()
        return new Promise<{ paths: string[]; partial: boolean }>(() => undefined)
      },
    )
    await started.promise
    const reason = new DOMException("Closed", "AbortError")
    controller.abort(reason)
    await expect(scan).rejects.toBe(reason)
    expect(walkSignal?.aborted).toBeTrue()
  })

  test("times out a stuck scan so the next load can recover", async () => {
    let walks = 0
    const scanFiles = async () => {
      walks += 1
      if (walks === 1) return new Promise<{ paths: string[]; partial: boolean }>(() => undefined)
      return { paths: ["recovered.md"], partial: false }
    }
    const input = { directory: "/isolated-timeout", limit: 10, deadlineMs: 10 }
    await expect(scanNotebookFilesWithDeadline(input, scanFiles)).rejects.toThrow("timed out")
    expect(await scanNotebookFilesWithDeadline(input, scanFiles)).toEqual({
      paths: ["recovered.md"],
      partial: false,
    })
  })

  test("honors an already-aborted notebook file search", async () => {
    await withTempProject(async (directory) => {
      await fs.writeFile(path.join(directory, "search-notes.md"), "")
      const controller = new AbortController()
      controller.abort()

      await expect(
        File.listSearchPaths(directory, { signal: controller.signal }),
      ).rejects.toThrow()
    })
  })

  test("reports a partial result when the bounded path scan reaches its cap", async () => {
    await withTempProject(async (directory) => {
      await Promise.all([
        fs.writeFile(path.join(directory, "search-one.md"), ""),
        fs.writeFile(path.join(directory, "search-two.md"), ""),
      ])

      const result = await File.listSearchPaths(directory, { scanLimit: 1 })

      expect(result.paths).toHaveLength(1)
      expect(result.partial).toBeTrue()
    })
  })

  test("excludes skipped directories before applying the path scan limit", async () => {
    await withTempProject(async (directory) => {
      const dependencyDirectory = path.join(directory, "node_modules")
      await fs.mkdir(dependencyDirectory)
      await Promise.all([
        fs.writeFile(path.join(dependencyDirectory, "search-one.md"), ""),
        fs.writeFile(path.join(dependencyDirectory, "search-two.md"), ""),
        fs.writeFile(path.join(directory, "search-notes.md"), ""),
      ])

      const result = await File.listSearchPaths(directory, { scanLimit: 1 })

      expect(result).toEqual({ paths: ["search-notes.md"], partial: false })
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

      await expect(
        File.read(directory, "outside-link.txt"),
      ).rejects.toThrow("Access denied")
      await expect(
        File.list(directory, "outside-directory-link"),
      ).rejects.toThrow("Access denied")
    })
  })
  test("omits ignored and deleted tracked files from the current Git-backed index", async () => {
    await using project = await tmpdir({ git: true })
    await Promise.all([
      fs.writeFile(path.join(project.path, "visible.md"), "visible"),
      fs.writeFile(path.join(project.path, "ignored.md"), "ignored"),
      fs.writeFile(path.join(project.path, "deleted.md"), "deleted"),
    ])
    const add = Bun.spawn(["git", "add", "ignored.md", "deleted.md"], { cwd: project.path, stdout: "ignore", stderr: "ignore" })
    expect(await add.exited).toBe(0)
    await fs.writeFile(path.join(project.path, ".gitignore"), "ignored.md\n")
    await fs.rm(path.join(project.path, "deleted.md"))
    expect(await File.listSearchPaths(project.path)).toEqual({ paths: ["visible.md"], partial: false })
  })

  test("edits and renames exact text with version conflicts through the Buddy file service", async () => {
    await using project = await tmpdir()
    const target = path.join(project.path, "lesson.txt")
    await fs.writeFile(target, "draft  \n\n")
    const initial = await readProjectTextFile({ directory: project.path, path: "lesson.txt" })
    expect(initial.content).toBe("draft  \n\n")
    const saved = await saveProjectTextFile({ directory: project.path, path: "lesson.txt", content: "next\n", expectedVersion: initial.version })
    await expect(saveProjectTextFile({ directory: project.path, path: "lesson.txt", content: "stale\n", expectedVersion: initial.version })).rejects.toThrow("File changed on disk")
    expect(await fs.readFile(target, "utf8")).toBe("next\n")
    const renamed = await renameProjectTextFile({ directory: project.path, path: "lesson.txt", nextPath: "accepted.txt", expectedVersion: saved.version })
    expect(renamed.content).toBe("next\n")
    expect(await fs.readFile(path.join(project.path, "accepted.txt"), "utf8")).toBe("next\n")
    expect(await fs.exists(target)).toBe(false)
  })

})
