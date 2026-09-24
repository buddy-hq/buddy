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
import {
  noteMessageExcerpt,
  notePlainText,
  plainTextPreview,
  renderSessionNoteEntry,
  sessionNoteTitle,
} from "../../src/notes/presentation"
import { synchronizeSessionNoteTitle } from "../../src/notes/session-title-sync"
import { tmpdir } from "../helpers/tmpdir"

function unsearchedPreview(content: string) {
  return plainTextPreview({ text: notePlainText(content), match: 0 })
}

function requestWeekOneImage(src: string) {
  return app.request(
    `/api/notes/image?${new URLSearchParams({ note: "Lectures/Week 1.md", src }).toString()}`,
  )
}

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

  test("serves images referenced by notes from inside the library only", async () => {
    await using home = await tmpdir()
    await using vault = await tmpdir()
    await using outside = await tmpdir()
    const previous = await Config.getGlobal()
    await Config.replaceGlobal({
      ...previous,
      notebook_home: home.path,
      notes_directory: vault.path,
    })

    try {
      await fsp.mkdir(path.join(vault.path, "Lectures"))
      await fsp.mkdir(path.join(vault.path, "assets"))
      await fsp.writeFile(path.join(vault.path, "Lectures", "Week 1.md"), "# Week 1\n")
      await fsp.writeFile(path.join(vault.path, "Lectures", "local.png"), "local image")
      await fsp.writeFile(path.join(vault.path, "Lectures", "vector.svg"), "<svg></svg>")
      await fsp.writeFile(path.join(vault.path, "assets", "Pasted image 1.png"), "pasted image")
      await fsp.writeFile(path.join(vault.path, "Lectures", "secret.txt"), "not an image")
      await fsp.writeFile(path.join(outside.path, "outside.png"), "outside image")
      await fsp.symlink(
        path.join(outside.path, "outside.png"),
        path.join(vault.path, "Lectures", "linked.png"),
      )
      const local = await requestWeekOneImage("local.png")
      expect(local.status).toBe(200)
      expect(await local.text()).toBe("local image")
      const vector = await requestWeekOneImage("vector.svg")
      expect(vector.status).toBe(200)
      expect(vector.headers.get("content-security-policy")).toBe("sandbox")
      expect(vector.headers.get("x-content-type-options")).toBe("nosniff")
      expect(await vector.text()).toBe("<svg></svg>")
      const byName = await requestWeekOneImage("Pasted image 1.png")
      expect(byName.status).toBe(200)
      expect(await byName.text()).toBe("pasted image")
      const encoded = await requestWeekOneImage("../assets/Pasted%20image%201.png")
      expect(await encoded.text()).toBe("pasted image")
      const rootRelative = await requestWeekOneImage("/Lectures/local.png")
      expect(rootRelative.status).toBe(200)
      expect(await rootRelative.text()).toBe("local image")

      expect((await requestWeekOneImage("secret.txt")).status).toBe(404)
      expect(
        (await requestWeekOneImage(`../../${path.basename(outside.path)}/outside.png`)).status,
      ).toBe(404)
      expect((await requestWeekOneImage("linked.png")).status).toBe(404)
      expect((await requestWeekOneImage(path.join(outside.path, "outside.png"))).status).toBe(404)
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

      expect(first.note.relativePath).toBe("Chat notes/Research chat.md")
      expect(second.note.relativePath).toBe(first.note.relativePath)
      expect(first.created).toBe(true)
      expect(second.created).toBe(false)
      expect(document.content).not.toContain("## Note —")
      expect(document.content.match(/^\*\*.+\*\*$/gmu)).toHaveLength(1)
      expect(document.content.match(/^\*\d{2}:\d{2}\*$/gmu)).toHaveLength(2)
      expect(document.content).toContain("First capture")
      expect(document.content).toContain("Second capture")
      expect(parsed?.metadata).toMatchObject({
        type: "buddy-session-note",
        "buddy-session-id": chat.sessionID,
        "buddy-generated-title": "Research chat",
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

  test("finds the note that collects a chat's captures by session", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const chat = await seedReadableChat(notebook.path)
      const sessionNoteRoute = `/api/notes/session/${encodeURIComponent(chat.sessionID)}`
      expect(await (await app.request(sessionNoteRoute)).json()).toEqual({})

      const capture = await captureComposerNote({
        directory: notebook.path,
        sessionID: chat.sessionID,
        text: "First capture",
      })
      const found = await app.request(sessionNoteRoute)

      expect(found.status).toBe(200)
      expect(await found.json()).toMatchObject({
        note: {
          id: capture.note.id,
          relativePath: capture.note.relativePath,
          sessionID: chat.sessionID,
        },
      })
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
      expect(document.content).toContain(
        `> [Open message](buddy://chat/${chat.sessionID}?message=${chat.userMessageID})`,
      )
      expect(document.content).toContain("Remember this")
      expect(document.content).toMatch(/!\[Diagram\.png\]\(\.\.\/Attachments\/\w+\.png\)/u)
      expect(document.content).not.toContain("Hidden synthetic context")
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("saves a quoted message without any learner text", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const chat = await seedReadableChat(notebook.path)
      const capture = await annotateChatMessage({
        directory: notebook.path,
        sessionID: chat.sessionID,
        messageID: chat.userMessageID,
        text: "",
      })
      const document = await readNote(capture.note.relativePath)

      expect(document.content).toContain("> [!quote]+ Visible question")
      expect(document.content).toContain(
        `[Open message](buddy://chat/${chat.sessionID}?message=${chat.userMessageID})`,
      )
      await expect(
        captureComposerNote({ directory: notebook.path, sessionID: chat.sessionID, text: "" }),
      ).rejects.toThrow("Note text or an image is required")
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("searches note bodies and returns a preview near the match", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const created = await createStandaloneNote({ directory: notebook.path, title: "Physics" })
      await updateNote({
        path: created.relativePath,
        content: "A long introduction before the useful observation about entropy and disorder.",
      })
      const root = path.join(home.path, "Notes")
      await fsp.mkdir(path.join(root, "Archive"))
      await fsp.writeFile(
        path.join(root, "Archive", "index.md"),
        "# Reference\n\nEnergy remains conserved.\n",
      )

      const entropy = await listNotes(notebook.path, "entropy")
      const energy = await listNotes(notebook.path, "energy")
      const windowsPath = await listNotes(notebook.path, "Archive\\index")

      expect(entropy.notes).toHaveLength(1)
      expect(entropy.notes[0]).toMatchObject({
        relativePath: "Physics.md",
        preview: expect.stringContaining("entropy"),
      })
      expect(energy.notes).toHaveLength(1)
      expect(energy.notes[0]).toMatchObject({ relativePath: "Archive/index.md" })
      expect(windowsPath.notes[0]).toMatchObject({ relativePath: "Archive/index.md" })
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("searches the literal characters learners type in note bodies", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const created = await createStandaloneNote({ directory: notebook.path, title: "Syntax" })
      await updateNote({
        path: created.relativePath,
        content:
          "Use snake_case names. Read [the guide](https://example.com/guide). 2*3 is six. Open C:\\Users\\me.",
      })

      for (const query of ["snake_case", "https://example.com/guide", "2*3", "C:\\Users"]) {
        expect(
          (await listNotes(notebook.path, query)).notes.map((note) => note.relativePath),
        ).toEqual(["Syntax.md"])
      }
      expect((await listNotes(notebook.path, "snake_case")).notes[0]?.preview).toContain(
        "snakecase names",
      )
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("resolves a duplicated note by its path before its shared ID", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const original = await createStandaloneNote({ directory: notebook.path, title: "Note" })
      await updateNote({ path: original.relativePath, id: original.id, content: "Original body" })
      const root = path.join(home.path, "Notes")
      await fsp.copyFile(path.join(root, "Note.md"), path.join(root, "Note copy.md"))
      await updateNote({ path: "Note copy.md", id: original.id, content: "Copy body" })

      expect((await readNote("Note.md", original.id)).content).toBe("Original body")
      expect((await readNote("Note copy.md", original.id)).content).toBe("Copy body")

      await updateNote({ path: "Note.md", id: original.id, content: "Edited original" })
      expect(await fsp.readFile(path.join(root, "Note copy.md"), "utf8")).toContain("Copy body")
      expect(await fsp.readFile(path.join(root, "Note.md"), "utf8")).toContain("Edited original")

      await fsp.rm(path.join(root, "Note copy.md"))
      await fsp.rename(path.join(root, "Note.md"), path.join(root, "Moved.md"))
      expect((await readNote("Note.md", original.id)).note.relativePath).toBe("Moved.md")
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("follows the chat title until the learner renames the note", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const chat = await seedReadableChat(notebook.path)
      const capture = await captureComposerNote({
        directory: notebook.path,
        sessionID: chat.sessionID,
        text: "Keep this",
      })
      const beforeFollow = await readNote(capture.note.relativePath, capture.note.id)
      await fsp.writeFile(path.join(home.path, "Notes", "Chat notes", "Thermodynamics.md"), "")

      const renamedByTitle = await synchronizeSessionNoteTitle({
        sessionID: chat.sessionID,
        title: "Thermodynamics",
        createdAt: Date.now(),
      })
      expect(renamedByTitle).toBe(true)
      const followed = await readNote(capture.note.relativePath, capture.note.id)
      expect(followed.note).toMatchObject({
        id: capture.note.id,
        relativePath: "Chat notes/Thermodynamics 1.md",
      })
      expect(await fsp.realpath(followed.sourceDirectory ?? "")).toBe(
        await fsp.realpath(notebook.path),
      )
      const savedAfterFollow = await updateNote({
        path: capture.note.relativePath,
        id: capture.note.id,
        content: `${followed.content}\nBody saved from the already-open editor.`,
        expectedVersion: beforeFollow.version,
      })
      expect(savedAfterFollow.note.relativePath).toBe("Chat notes/Thermodynamics 1.md")
      expect(savedAfterFollow.content).toContain("Body saved from the already-open editor.")

      const manuallyRenamed = await renameNote({
        path: capture.note.relativePath,
        id: capture.note.id,
        title: "My study notes",
      })
      const renamedAfterOwnership = await synchronizeSessionNoteTitle({
        sessionID: chat.sessionID,
        title: "A later chat title",
        createdAt: Date.now(),
      })
      expect(renamedAfterOwnership).toBe(false)
      expect(
        (await readNote(manuallyRenamed.relativePath, capture.note.id)).note.relativePath,
      ).toBe("Chat notes/My study notes.md")
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("uses readable placeholder titles and bounds message excerpts", () => {
    expect(sessionNoteTitle("New session - 2026-09-20T10:30:00.000Z", 0)).not.toContain(
      "New session",
    )
    expect(sessionNoteTitle("Child session - 2026-09-20T10:30:00.000Z", 0)).not.toContain(
      "Child session",
    )
    expect(sessionNoteTitle("New chat - Project kickoff", 0)).toBe("New chat - Project kickoff")
    const excerpt = noteMessageExcerpt(`**${"word ".repeat(100)}**`)
    expect(excerpt.length).toBeLessThanOrEqual(281)
    expect(excerpt.endsWith("…")).toBe(true)
  })

  test("prints the date once per capture day and keeps timestamps quiet", () => {
    const first = renderSessionNoteEntry({
      text: "First",
      imageLinks: [],
      capturedAt: new Date(2026, 0, 1, 12, 5),
    })
    const sameDay = renderSessionNoteEntry({
      text: "Second",
      imageLinks: [],
      capturedAt: new Date(2026, 0, 1, 14, 30),
      previousDay: first.day,
    })
    const nextDay = renderSessionNoteEntry({
      text: "Third",
      imageLinks: [],
      capturedAt: new Date(2026, 0, 2, 9, 0),
      previousDay: sameDay.day,
    })

    expect(first.content).toContain("**January 1, 2026**")
    expect(sameDay.content).not.toContain("January 1")
    expect(nextDay.content).toContain("**January 2, 2026**")
    expect(sameDay.content).toMatch(/^\*14:30\*/u)
  })

  test("previews what was written rather than capture scaffolding", () => {
    const annotated = renderSessionNoteEntry({
      text: "Entropy counts microstates.",
      imageLinks: ["![diagram.png](Attachments/diagram.png)"],
      capturedAt: new Date(2026, 0, 1, 12, 5),
      source: { sessionID: "ses_1", messageID: "msg_1", text: "Buddy explained entropy." },
    })
    const legacy = "## Note — 09:15\n\nLegacy thought"

    expect(unsearchedPreview(annotated.content)).toBe(
      "Buddy explained entropy. Entropy counts microstates.",
    )
    expect(unsearchedPreview(legacy)).toBe("Legacy thought")
  })

  test("keeps the whole quoted message in a folded quote so the note outlives the chat", () => {
    const message = [
      "## Entropy",
      "",
      `${"Entropy counts the microstates of a system. ".repeat(20)}`,
      "",
      "```python",
      "# not a heading",
      "print('ok')",
      "```",
      "",
      "The end of the explanation.",
    ].join("\n")
    const source = { sessionID: "ses_1", messageID: "msg_1", text: message }
    const annotated = renderSessionNoteEntry({
      text: "My takeaway",
      imageLinks: [],
      capturedAt: new Date(2026, 0, 1, 12, 5),
      source,
    })
    const quoteOnly = renderSessionNoteEntry({
      text: "",
      imageLinks: [],
      capturedAt: new Date(2026, 0, 1, 12, 5),
      source,
    })

    expect(annotated.content).toMatch(/^> \[!quote\]- Entropy Entropy counts/mu)
    expect(annotated.content).toContain("> The end of the explanation.")
    expect(annotated.content).toContain("> **Entropy**")
    expect(annotated.content).toContain("> # not a heading")
    expect(annotated.content).toContain("> [Open message](buddy://chat/ses_1?message=msg_1)")
    expect(annotated.content.trimEnd().endsWith("My takeaway")).toBe(true)
    expect(quoteOnly.content).toMatch(/^> \[!quote\]\+ /mu)
    expect(unsearchedPreview(annotated.content).startsWith("Entropy Entropy counts")).toBe(true)
    expect(unsearchedPreview(annotated.content)).not.toContain("[!quote]")
  })

  test("closes an unfinished source fence before the message link", () => {
    const entry = renderSessionNoteEntry({
      text: "My takeaway",
      imageLinks: [],
      capturedAt: new Date(2026, 0, 1, 12, 5),
      source: { sessionID: "ses_1", messageID: "msg_1", text: "Example:\n```ts\nconst n = 1" },
    })
    expect(entry.content).toContain(
      "> ```ts\n> const n = 1\n> ```\n>\n> [Open message](buddy://chat/ses_1?message=msg_1)",
    )
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
      const imagePath = /!\[Screenshot\.png\]\((\.\.\/Attachments\/\w+\.png)\)/.exec(
        document.content,
      )?.[1]

      expect(imagePath).toBeDefined()
      expect(
        await fsp.readFile(path.join(home.path, "Notes", "Chat notes", imagePath ?? "")),
      ).toEqual(imageBytes)
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
      const filename = path.posix.basename(first.note.relativePath)
      await fsp.rename(
        path.join(notesRoot, first.note.relativePath),
        path.join(archiveDirectory, filename),
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

      expect(appended.note.relativePath).toBe(`Archive/${filename}`)
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
