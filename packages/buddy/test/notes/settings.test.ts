import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { Config } from "../../src/config"
import {
  NotesDirectoryError,
  readNotesDirectoryState,
  saveNotesDirectory,
} from "../../src/notes/settings"
import { saveNotebookHome } from "../../src/project/buddy-home"
import { tmpdir } from "../helpers/tmpdir"

describe("Notes directory settings", () => {
  test("rejects relative library paths", async () => {
    await expect(saveNotesDirectory("relative/notes")).rejects.toBeInstanceOf(
      NotesDirectoryError,
    )
  })

  test("pins the old default when Buddy Home changes and never moves files", async () => {
    await using oldHome = await tmpdir()
    await using nextHome = await tmpdir()
    await using customNotes = await tmpdir()
    const previous = await Config.getGlobal()
    await Config.replaceGlobal({
      ...previous,
      notebook_home: oldHome.path,
      notes_directory: null,
    })

    try {
      await saveNotebookHome(nextHome.path)
      const resolvedOldHome = await fsp.realpath(oldHome.path)
      expect(await readNotesDirectoryState()).toMatchObject({
        configuredDirectory: path.join(resolvedOldHome, "Notes"),
        resolvedDirectory: path.join(resolvedOldHome, "Notes"),
      })

      await saveNotesDirectory(customNotes.path)
      const resolvedCustomNotes = await fsp.realpath(customNotes.path)
      expect(await readNotesDirectoryState()).toMatchObject({
        configuredDirectory: resolvedCustomNotes,
        resolvedDirectory: resolvedCustomNotes,
      })
    } finally {
      await Config.replaceGlobal(previous)
    }
  })
})
