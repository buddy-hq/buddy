import { expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { Config } from "../../src/config"
import { listNotes, readNote, renameNote, updateNote } from "../../src/notes/library"
import { tmpdir } from "../helpers/tmpdir"

async function configureNotesHome(directory: string) {
  const previous = await Config.getGlobal()
  await Config.replaceGlobal({
    ...previous,
    notebook_home: directory,
    notes_directory: path.join(directory, "Notes"),
  })
  return previous
}

test("scans nested Attachments folders and rejects the reserved library Attachments subtree", async () => {
  await using home = await tmpdir()
  await using notebook = await tmpdir()
  const previous = await configureNotesHome(home.path)

  try {
    const root = path.join(home.path, "Notes")
    const reservedDirectory = path.join(root, "Attachments")
    const nestedDirectory = path.join(root, "Project", "Attachments")
    await fsp.mkdir(nestedDirectory, { recursive: true })
    await fsp.mkdir(reservedDirectory, { recursive: true })
    await Promise.all([
      fsp.writeFile(path.join(root, "visible.md"), "# Visible\n", "utf8"),
      fsp.writeFile(path.join(reservedDirectory, "hidden.md"), "# Hidden\n", "utf8"),
      fsp.writeFile(path.join(nestedDirectory, "nested.md"), "# Nested\n", "utf8"),
    ])

    const library = await listNotes(notebook.path)
    const relativePaths = library.notes.map((note) => note.relativePath)

    expect(relativePaths).toContain("visible.md")
    expect(relativePaths).toContain("Project/Attachments/nested.md")
    expect(relativePaths).not.toContain("Attachments/hidden.md")

    const reservedPathError = {
      status: 400,
      message: "Note path is reserved by the Attachments directory",
    } as const
    await expect(readNote("Attachments/hidden.md")).rejects.toMatchObject(reservedPathError)
    await expect(
      updateNote({ path: "Attachments/hidden.md", content: "# Hidden\n\nEdited.\n" }),
    ).rejects.toMatchObject(reservedPathError)
    await expect(renameNote({ path: "Attachments/hidden.md", title: "Moved" })).rejects.toMatchObject(
      reservedPathError,
    )

    const nested = await readNote("Project/Attachments/nested.md")
    const updated = await updateNote({
      path: "Project/Attachments/nested.md",
      content: "# Nested\n\nUpdated.\n",
      expectedVersion: nested.version,
    })
    const renamed = await renameNote({
      path: "Project/Attachments/nested.md",
      title: "Moved",
      expectedVersion: updated.version,
    })

    expect(updated.content).toContain("Updated.")
    expect(renamed.relativePath).toBe("Project/Attachments/Moved.md")
    expect((await readNote("Project/Attachments/Moved.md")).content).toContain("Updated.")
    expect(await fsp.readFile(path.join(reservedDirectory, "hidden.md"), "utf8")).toBe("# Hidden\n")
  } finally {
    await Config.replaceGlobal(previous)
  }
})

test("uses filesystem identity for case variants of the root Attachments directory", async () => {
  await using home = await tmpdir()
  await using notebook = await tmpdir()
  const previous = await configureNotesHome(home.path)

  try {
    const root = path.join(home.path, "Notes")
    const lowercaseDirectory = path.join(root, "attachments")
    const reservedDirectory = path.join(root, "Attachments")
    const lowercaseNotePath = "attachments/lowercase.md"
    await fsp.mkdir(lowercaseDirectory, { recursive: true })
    await fsp.writeFile(path.join(root, lowercaseNotePath), "# Lowercase\n", "utf8")
    await fsp.mkdir(reservedDirectory, { recursive: true })

    const [lowercaseStats, reservedStats] = await Promise.all([
      fsp.stat(lowercaseDirectory),
      fsp.stat(reservedDirectory),
    ])
    const directoriesShareIdentity =
      lowercaseStats.dev === reservedStats.dev && lowercaseStats.ino === reservedStats.ino
    const library = await listNotes(notebook.path)
    const relativePaths = library.notes.map((note) => note.relativePath)

    if (directoriesShareIdentity) {
      expect(relativePaths).not.toContain(lowercaseNotePath)
      await expect(readNote(lowercaseNotePath)).rejects.toMatchObject({
        status: 400,
        message: "Note path is reserved by the Attachments directory",
      })
    } else {
      expect(relativePaths).toContain(lowercaseNotePath)
      await expect(readNote(lowercaseNotePath)).resolves.toMatchObject({
        content: "# Lowercase\n",
      })
    }
  } finally {
    await Config.replaceGlobal(previous)
  }
})
