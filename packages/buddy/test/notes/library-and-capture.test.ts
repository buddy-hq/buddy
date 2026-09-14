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

  test("returns stamped frontmatter as properties outside the editable body", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)
    try {
      const note = await createStandaloneNote({ directory: notebook.path })
      const initial = await readNote(note.relativePath)
      expect(initial.content).not.toContain("buddy-id")
      expect(initial.properties).toMatchObject({ type: "buddy-note", "buddy-id": note.id })

      const saved = await updateNote({
        path: note.relativePath,
        content: "# Edited note\n",
        expectedVersion: initial.version,
      })
      expect(saved.properties).toEqual(initial.properties)
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
      const third = await createStandaloneNote({ directory: notebook.path, title: "Idea" })
      const reserved = await createStandaloneNote({ directory: notebook.path, title: "NUL" })
      const legacyID = "01K00000000000000000000000"
      await fsp.writeFile(
        path.join(home.path, "Notes", `Legacy — ${legacyID}.md`),
        [
          "---",
          "type: buddy-note",
          `buddy-id: ${legacyID}`,
          "buddy-notebook-id: notebook-test",
          "notebook: Research",
          "---",
          "",
        ].join("\n"),
      )
      const afterLegacy = await createStandaloneNote({
        directory: notebook.path,
        title: "Legacy",
      })
      await fsp.writeFile(path.join(home.path, "Notes", "index.md"), "# Index\n")
      const library = await listNotes(notebook.path)

      expect(first.id).toBeDefined()
      expect(first.id).not.toBe(second.id)
      expect(first.relativePath).toBe("Idea.md")
      expect(second.relativePath).toBe("Idea 1.md")
      expect(third.relativePath).toBe("Idea 2.md")
      expect(reserved.relativePath).toBe("NUL 1.md")
      expect(afterLegacy.relativePath).toBe("Legacy 1.md")
      expect((await readNote(first.relativePath)).content).toBe("")
      expect(library.notes.find((note) => note.relativePath === "index.md")).toMatchObject({
        kind: "plain",
        title: "index",
      })
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("renames stamped notes to their bare title without rewriting the body", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const draft = await createStandaloneNote({ directory: notebook.path, title: "Draft" })
      await createStandaloneNote({ directory: notebook.path, title: "Final" })
      const document = await readNote(draft.relativePath)

      await expect(
        renameNote({ path: draft.relativePath, title: "Final", expectedVersion: document.version }),
      ).rejects.toMatchObject({ status: 409 })
      const renamed = await renameNote({
        path: draft.relativePath,
        title: "Published",
        expectedVersion: document.version,
      })
      expect(renamed).toMatchObject({
        relativePath: "Published.md",
        title: "Published",
        id: draft.id,
      })
      expect((await readNote("Published.md")).content).toBe("")

      const legacyID = "01K00000000000000000000000"
      const legacyPath = `Legacy — ${legacyID}.md`
      await fsp.writeFile(
        path.join(home.path, "Notes", legacyPath),
        [
          "---",
          "type: buddy-note",
          `buddy-id: ${legacyID}`,
          "buddy-notebook-id: notebook-test",
          "notebook: Research",
          "---",
          "# Kept heading",
          "",
        ].join("\n"),
      )
      expect((await readNote(legacyPath)).note.title).toBe("Legacy")
      expect((await renameNote({ path: legacyPath, title: "Legacy" })).relativePath).toBe(
        "Legacy.md",
      )
      expect((await readNote("Legacy.md")).content).toBe("# Kept heading\n")
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

      expect(first.note.relativePath).toBe("Research chat.md")
      expect(second.note.relativePath).toBe(first.note.relativePath)
      // The UI announces a new note but stays quiet for an append, so only the
      // first capture may report `created`.
      expect(first.created).toBe(true)
      expect(second.created).toBe(false)
      expect(document.content).toMatch(/^## Note — /u)
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
        images: [
          {
            filename: "Diagram.png",
            mime: "image/png",
            data: Buffer.from("diagram bytes").toString("base64"),
          },
        ],
      })
      const document = await readNote(capture.note.relativePath)

      expect(document.content).toContain("> Visible question")
      expect(document.content).toContain("Remember this")
      expect(document.content).toMatch(/!\[Diagram\.png\]\(Attachments\/\w+\.png\)/u)
      expect(document.content).not.toContain("Hidden synthetic context")
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("saves an image-only capture into Attachments and rejects an empty capture", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const chat = await seedReadableChat(notebook.path)
      const imageBytes = Buffer.from("screenshot bytes")
      const capture = await captureComposerNote({
        directory: notebook.path,
        sessionID: chat.sessionID,
        text: "",
        images: [
          { filename: "Screenshot.png", mime: "image/png", data: imageBytes.toString("base64") },
        ],
      })
      const document = await readNote(capture.note.relativePath)
      const imagePath = /!\[Screenshot\.png\]\((Attachments\/\w+\.png)\)/.exec(document.content)?.[1]

      expect(imagePath).toBeDefined()
      expect(await fsp.readFile(path.join(home.path, "Notes", imagePath ?? ""))).toEqual(imageBytes)
      const attachmentsDirectory = path.join(home.path, "Notes", "Attachments")
      const attachmentsBeforeFailure = await fsp.readdir(attachmentsDirectory)
      await expect(
        captureComposerNote({
          directory: notebook.path,
          sessionID: chat.sessionID,
          text: "",
          images: [
            {
              filename: "Temporary.png",
              mime: "image/png",
              data: Buffer.from("temporary bytes").toString("base64"),
            },
            { filename: "Empty.png", mime: "image/png", data: "" },
          ],
        }),
      ).rejects.toMatchObject({ status: 400 })
      expect(await fsp.readdir(attachmentsDirectory)).toEqual(attachmentsBeforeFailure)
      await expect(
        captureComposerNote({ directory: notebook.path, sessionID: chat.sessionID, text: " " }),
      ).rejects.toMatchObject({ status: 400 })
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("links new capture images relative to a session note in a subfolder", async () => {
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
      const notesRoot = path.join(home.path, "Notes")
      const archiveDirectory = path.join(notesRoot, "Archive")
      await fsp.mkdir(archiveDirectory)
      await fsp.rename(
        path.join(notesRoot, first.note.relativePath),
        path.join(archiveDirectory, first.note.relativePath),
      )

      const appended = await captureComposerNote({
        directory: notebook.path,
        sessionID: chat.sessionID,
        text: "",
        images: [
          {
            filename: "Nested.png",
            mime: "image/png",
            data: Buffer.from("nested image").toString("base64"),
          },
        ],
      })
      const document = await readNote(appended.note.relativePath)

      expect(appended.note.relativePath).toBe(`Archive/${first.note.relativePath}`)
      expect(document.content).toMatch(/!\[Nested\.png\]\(\.\.\/Attachments\/\w+\.png\)/u)
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("rejects invalid and oversized capture request bodies before mutation", async () => {
    await using notebook = await tmpdir()
    const route = `/api/notes/session/session-test/capture?directory=${encodeURIComponent(notebook.path)}`
    const invalidBodies = [
      {
        text: "",
        images: [{ filename: "vector.svg", mime: "image/svg+xml", data: "PHN2Zz4=" }],
      },
      {
        text: "",
        images: Array.from({ length: 11 }, (_, index) => ({
          filename: `image-${index}.png`,
          mime: "image/png",
          data: "YQ==",
        })),
      },
      { text: "", images: [{ filename: "empty.png", mime: "image/png", data: "" }] },
    ]

    for (const body of invalidBodies) {
      const response = await app.request(route, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      expect(response.status).toBe(400)
    }

    const oversized = await app.request(route, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "1000000000" },
      body: "{}",
    })
    expect(oversized.status).toBe(413)
    expect(await oversized.json()).toEqual({
      error: "Note capture exceeds the request size limit.",
    })
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
