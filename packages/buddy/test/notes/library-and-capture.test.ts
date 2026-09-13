import { afterEach, describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { MessageID, ModelID, PartID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { app } from "../../src/index.ts"
import { Config } from "../../src/config"
import { annotateChatMessage, captureComposerNote } from "../../src/notes/chat-capture"
import { NotesError } from "../../src/notes/errors"
import {
  createStandaloneNote,
  listNotes,
  readNote,
  renameNote,
  updateNote,
} from "../../src/notes/library"
import { parseNoteSource } from "../../src/notes/note-file"
import { ensureNotebookIdentity } from "../../src/notes/notebook-identity"
import { tmpdir } from "../helpers/tmpdir"

type RouteMessage = Awaited<ReturnType<typeof OpenCodeSession.messages>>[number]

async function configureNotesHome(directory: string) {
  const previous = await Config.getGlobal()
  await Config.replaceGlobal({
    ...previous,
    notebook_home: directory,
    notes_directory: path.join(directory, "Notes"),
  })
  return previous
}

async function seedReadableChat(directory: string) {
  return OpenCodeInstance.provide({
    directory,
    fn: async () => {
      const session = await OpenCodeSession.create({ title: "Research chat" })
      const sessionID = SessionID.make(session.id)
      const userMessageID = MessageID.ascending()
      await OpenCodeSession.updateMessage({
        id: userMessageID,
        sessionID,
        role: "user",
        time: { created: 1 },
        agent: "buddy",
        model: {
          providerID: ProviderID.openai,
          modelID: ModelID.make("gpt-5.4-mini"),
        },
        tools: {},
      } satisfies RouteMessage["info"])
      await OpenCodeSession.updatePart({
        id: PartID.ascending(),
        sessionID,
        messageID: userMessageID,
        type: "text",
        text: "Visible question",
      })
      await OpenCodeSession.updatePart({
        id: PartID.ascending(),
        sessionID,
        messageID: userMessageID,
        type: "text",
        text: "Hidden synthetic context",
        synthetic: true,
      })
      return { sessionID: session.id, userMessageID }
    },
  })
}

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("Notes library and chat capture", () => {
  test("returns the exact submitted body after saving a stamped note", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)
    try {
      const note = await createStandaloneNote({ directory: notebook.path })
      const initial = await readNote(note.relativePath)
      const content = "# Edited note\n\nNo trailing newline"
      const saved = await updateNote({
        path: note.relativePath,
        content,
        expectedVersion: initial.version,
      })
      expect(saved.content).toBe(content)
      expect((await readNote(note.relativePath)).content).toBe(content)
      expect(saved.note.id).toBe(note.id)
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("keeps notebook identity across a rename without repairing frontmatter on read", async () => {
    await using home = await tmpdir()
    await using notebooks = await tmpdir()
    const beforeDirectory = path.join(notebooks.path, "Before")
    const afterDirectory = path.join(notebooks.path, "After")
    await fsp.mkdir(beforeDirectory)
    const previous = await configureNotesHome(home.path)

    try {
      const created = await createStandaloneNote({
        directory: beforeDirectory,
        title: "Renamed notebook note",
      })
      const identityBefore = await ensureNotebookIdentity(beforeDirectory)
      const notePath = path.join(home.path, "Notes", created.relativePath)
      const sourceBefore = await fsp.readFile(notePath, "utf8")

      await fsp.rename(beforeDirectory, afterDirectory)
      const identityAfter = await ensureNotebookIdentity(afterDirectory)
      const library = await listNotes(afterDirectory)

      expect(identityAfter.id).toBe(identityBefore.id)
      expect(
        library.notes.find((note) => note.relativePath === created.relativePath),
      ).toMatchObject({
        notebook: "After",
        notebookAvailable: true,
        notebookID: identityBefore.id,
      })
      expect(await fsp.readFile(notePath, "utf8")).toBe(sourceBefore)
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("creates collision-safe stamped notes and lists ordinary Markdown", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const first = await createStandaloneNote({ directory: notebook.path, title: "Idea" })
      const second = await createStandaloneNote({ directory: notebook.path, title: "Idea" })
      await fsp.writeFile(path.join(home.path, "Notes", "index.md"), "# Index\n")
      const library = await listNotes(notebook.path)

      expect(first.id).toBeDefined()
      expect(first.id).not.toBe(second.id)
      expect(first.relativePath).toBe(`Idea — ${first.id}.md`)
      expect(library.notes.find((note) => note.relativePath === "index.md")).toMatchObject({
        kind: "plain",
        title: "index",
      })
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("reads, updates, and renames plain notes by path", async () => {
    await using home = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const root = path.join(home.path, "Notes")
      await fsp.mkdir(root)
      await fsp.writeFile(path.join(root, "index.md"), "# Index\n")
      const document = await readNote("index.md")
      expect(document.note.kind).toBe("plain")

      const updated = await updateNote({
        path: "index.md",
        content: "# Index\n\nUpdated.\n",
        expectedVersion: document.version,
      })
      const renamed = await renameNote({
        path: "index.md",
        title: "Home",
        expectedVersion: updated.version,
      })

      expect(renamed.relativePath).toBe("Home.md")
      expect((await readNote("Home.md")).content).toContain("Updated.")
      await expect(readNote("index.md")).rejects.toBeInstanceOf(NotesError)
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("reads and mutates note documents without a notebook directory context", async () => {
    await using home = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const root = path.join(home.path, "Notes")
      await fsp.mkdir(root)
      await fsp.writeFile(path.join(root, "Global.md"), "# Global\n", "utf8")
      const documentPath = encodeURIComponent("Global.md")

      const readResponse = await app.request(`/api/notes/document?path=${documentPath}`)
      expect(readResponse.status).toBe(200)

      const updateResponse = await app.request(`/api/notes/document?path=${documentPath}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "# Global\n\nUpdated.\n" }),
      })
      expect(updateResponse.status).toBe(200)
      expect((await readNote("Global.md")).content).toContain("Updated.")

      const renameResponse = await app.request(`/api/notes/document/rename?path=${documentPath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Renamed" }),
      })
      expect(renameResponse.status).toBe(200)
      expect((await readNote("Renamed.md")).note.title).toBe("Renamed")
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("rejects Windows device names when renaming plain notes", async () => {
    await using home = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const root = path.join(home.path, "Notes")
      await fsp.mkdir(root)
      await fsp.writeFile(path.join(root, "Ordinary.md"), "# Ordinary\n", "utf8")

      await expect(renameNote({ path: "Ordinary.md", title: "NUL" })).rejects.toMatchObject({
        status: 400,
        message: "Note title is reserved by Windows",
      })

      expect(await fsp.readFile(path.join(root, "Ordinary.md"), "utf8")).toBe("# Ordinary\n")
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("reuses one session note and stores only captures plus the session ID", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const chat = await seedReadableChat(notebook.path)
      const first = await captureComposerNote({
        directory: notebook.path,
        sessionID: chat.sessionID,
        text: "First capture",
      })
      const second = await captureComposerNote({
        directory: notebook.path,
        sessionID: chat.sessionID,
        text: "Second capture",
      })
      const document = await readNote(first.note.relativePath)
      const parsed = parseNoteSource(
        await fsp.readFile(path.join(home.path, "Notes", first.note.relativePath), "utf8"),
      )

      expect(second.note.relativePath).toBe(first.note.relativePath)
      // The UI announces a new note but stays quiet for an append, so only the
      // first capture may report `created`.
      expect(first.created).toBe(true)
      expect(second.created).toBe(false)
      expect(document.content).toContain("First capture")
      expect(document.content).toContain("Second capture")
      expect(parsed?.metadata).toMatchObject({
        type: "buddy-session-note",
        "buddy-session-id": chat.sessionID,
      })
      const sessionsDirectoryExists = await fsp
        .stat(path.join(home.path, "Notes", "Sessions"))
        .then(() => true)
        .catch(() => false)
      expect(sessionsDirectoryExists).toBe(false)
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("annotations quote only readable message text in the session note", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const chat = await seedReadableChat(notebook.path)
      const capture = await annotateChatMessage({
        directory: notebook.path,
        sessionID: chat.sessionID,
        messageID: chat.userMessageID,
        text: "Remember this",
      })
      const document = await readNote(capture.note.relativePath)

      expect(document.content).toContain("> Visible question")
      expect(document.content).toContain("Remember this")
      expect(document.content).not.toContain("Hidden synthetic context")
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("rejects stale writes and paths outside the library", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const created = await createStandaloneNote({ directory: notebook.path, title: "Conflict" })
      const document = await readNote(created.relativePath)
      await updateNote({
        path: created.relativePath,
        content: `${document.content}Changed\n`,
        expectedVersion: document.version,
      })
      await expect(
        updateNote({
          path: created.relativePath,
          content: "stale",
          expectedVersion: document.version,
        }),
      ).rejects.toMatchObject({ status: 409 })
      await expect(readNote("../outside.md")).rejects.toMatchObject({ status: 400 })
    } finally {
      await Config.replaceGlobal(previous)
    }
  })
})
