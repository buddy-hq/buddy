import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveTrashableNotePath } from "../src/main/note-trash"

const TEMP_DIRECTORY_PREFIX = "buddy-note-trash-"

describe("note trash paths", () => {
  const cleanupPaths: string[] = []

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })),
    )
  })

  async function createLibrary() {
    const root = await mkdtemp(join(tmpdir(), TEMP_DIRECTORY_PREFIX))
    cleanupPaths.push(root)
    const notesDirectory = join(root, "Notes")
    const outsideDirectory = join(root, "Outside")
    await mkdir(join(notesDirectory, "Chat notes"), { recursive: true })
    await mkdir(outsideDirectory)
    return { notesDirectory, outsideDirectory }
  }

  test("accepts Markdown files inside the Notes library", async () => {
    const { notesDirectory } = await createLibrary()
    const notePath = join(notesDirectory, "Chat notes", "Lecture.md")
    await writeFile(notePath, "# Lecture\n")

    await expect(resolveTrashableNotePath({ notePath, notesDirectory })).resolves.toBe(
      await realpath(notePath),
    )
  })

  test("rejects Markdown files outside the Notes library", async () => {
    const { notesDirectory, outsideDirectory } = await createLibrary()
    const outsidePath = join(outsideDirectory, "README.md")
    await writeFile(outsidePath, "# Readme\n")

    await expect(
      resolveTrashableNotePath({ notePath: outsidePath, notesDirectory }),
    ).rejects.toThrow("Notes library")
    await expect(
      resolveTrashableNotePath({
        notePath: join(notesDirectory, "..", "Outside", "README.md"),
        notesDirectory,
      }),
    ).rejects.toThrow("Notes library")
  })

  test("rejects library paths that resolve outside through a linked folder", async () => {
    const { notesDirectory, outsideDirectory } = await createLibrary()
    await writeFile(join(outsideDirectory, "README.md"), "# Readme\n")
    await symlink(outsideDirectory, join(notesDirectory, "Linked"), "junction")

    await expect(
      resolveTrashableNotePath({
        notePath: join(notesDirectory, "Linked", "README.md"),
        notesDirectory,
      }),
    ).rejects.toThrow("Notes library")
  })

  test("rejects relative, non-Markdown, and linked note paths", async () => {
    const { notesDirectory, outsideDirectory } = await createLibrary()
    const imagePath = join(notesDirectory, "diagram.png")
    const outsidePath = join(outsideDirectory, "README.md")
    const linkedNotePath = join(notesDirectory, "Linked.md")
    await writeFile(imagePath, "image")
    await writeFile(outsidePath, "# Readme\n")
    await symlink(outsidePath, linkedNotePath)

    for (const notePath of [undefined, "Chat notes/Lecture.md", imagePath, linkedNotePath]) {
      await expect(resolveTrashableNotePath({ notePath, notesDirectory })).rejects.toThrow(
        "Notes library",
      )
    }
  })
})
