import { expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { Config } from "../../src/config"
import { createStandaloneNote, updateNote } from "../../src/notes/library"
import {
  draftSessionSmartNote,
  SmartNoteDraftEmpty,
  SmartNoteDraftUnavailable,
} from "../../src/notes/smart-note"
import {
  SMART_NOTE_NOTE_LIMIT,
  SMART_NOTE_NOTE_TEXT_CHARACTERS,
  smartNotePrompt,
} from "../../src/notes/smart-note-prompt"
import { closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { tmpdir } from "../helpers/tmpdir"

const TAIL_MARKER = "TAILMARKER"
const DRAFT_TEXT = "Chlorophyll captures light energy."

async function withNotesHome(run: (home: string) => Promise<void>) {
  await using home = await tmpdir()
  const previous = await Config.getGlobal()
  await Config.replaceGlobal({
    ...previous,
    notebook_home: home.path,
    notes_directory: path.join(home.path, "Notes"),
  })
  try {
    await run(home.path)
  } finally {
    await Config.replaceGlobal(previous)
  }
}

async function seedNote(directory: string, title: string, content: string) {
  await fsp.mkdir(directory, { recursive: true })
  const created = await createStandaloneNote({ directory, title })
  if (created.id) {
    await updateNote({ path: created.relativePath, id: created.id, content })
    return created
  }
  await updateNote({ path: created.relativePath, content })
  return created
}

test("keeps the newest saved notes inside the draft prompt", () => {
  const notes = Array.from({ length: SMART_NOTE_NOTE_LIMIT + 1 }, (_, index) => ({
    title: `Note ${index}`,
    text: "body",
    updatedAt: index,
  }))
  const prompt = smartNotePrompt({ notes })
  expect(prompt).toContain("- Note 30: body")
  expect(prompt).not.toContain("Note 0")
  expect(prompt).toContain("Do not call tools.")
})

test("drafts from the active notebook and leaves every other notebook out", async () => {
  await withNotesHome(async (home) => {
    const biology = path.join(home, "biology")
    const math = path.join(home, "math")
    const stranger = path.join(home, "stranger")
    const visible = "Chlorophyll absorbs light."
    await seedNote(
      biology,
      "Photosynthesis",
      `${visible} ${"x".repeat(SMART_NOTE_NOTE_TEXT_CHARACTERS)}${TAIL_MARKER}`,
    )
    await seedNote(math, "Calculus", "Derivatives measure change.")
    await fsp.mkdir(stranger, { recursive: true })

    const calls: Array<{ sessionID: string; prompt: string }> = []
    const drafted = await draftSessionSmartNote({
      directory: biology,
      sessionID: "ses_smart",
      focus: "light reactions",
      generate: async (input) => {
        calls.push({ sessionID: input.sessionID, prompt: input.prompt })
        return `\`\`\`markdown\n${DRAFT_TEXT}\n\`\`\``
      },
    })
    const unrelated = await draftSessionSmartNote({
      directory: stranger,
      sessionID: "ses_stranger",
      generate: async (input) => {
        calls.push({ sessionID: input.sessionID, prompt: input.prompt })
        return "A note from the chat."
      },
    })

    expect(drafted).toEqual({ _tag: "ok", text: DRAFT_TEXT })
    expect(calls[0]?.sessionID).toBe("ses_smart")
    const prompt = calls[0]?.prompt ?? ""
    expect(prompt).toContain("The learner asked for a note from this chat.")
    expect(prompt).toContain("Do not repeat a note they already saved.")
    expect(prompt).toContain("Reply with only the note text. Do not call tools.")
    expect(prompt).toContain(`- Photosynthesis: ${visible}`)
    expect(prompt).toContain("Focus: light reactions")
    expect(prompt).not.toContain(TAIL_MARKER)
    expect(prompt).not.toContain("Calculus")
    expect(prompt).not.toContain("Derivatives measure change.")
    expect(unrelated).toEqual({ _tag: "ok", text: "A note from the chat." })
    expect(calls[1]?.prompt).toContain("None yet.")
    expect(calls[1]?.prompt).not.toContain("Photosynthesis")
    expect(calls[1]?.prompt).not.toContain(visible)
  })
})

test("treats an empty model reply as a failed draft", async () => {
  await withNotesHome(async (home) => {
    let calls = 0
    const result = await draftSessionSmartNote({
      directory: path.join(home, "chat"),
      sessionID: "ses_empty",
      generate: async () => {
        calls += 1
        return "```markdown\n\n```"
      },
    })
    expect(calls).toBe(1)
    expect(result._tag).toBe("err")
    if (result._tag !== "err") return
    expect(result.error).toBeInstanceOf(SmartNoteDraftEmpty)
    expect(result.error.message).toBe("The note draft was empty.")
  })
})

test("hides a generation failure from the draft", async () => {
  await withNotesHome(async (home) => {
    const result = await draftSessionSmartNote({
      directory: path.join(home, "chat"),
      sessionID: "ses_down",
      generate: async () => {
        throw new Error("provider down")
      },
    })
    expect(result._tag).toBe("err")
    if (result._tag !== "err") return
    expect(result.error).toBeInstanceOf(SmartNoteDraftUnavailable)
    expect(result.error.message).toBe("A note could not be drafted from this chat.")
    expect(result.error.message.includes("provider down")).toBe(false)
  })
})

test("does not generate after the request is aborted", async () => {
  await withNotesHome(async (home) => {
    const controller = new AbortController()
    controller.abort()
    let called = false
    const result = await draftSessionSmartNote({
      directory: path.join(home, "chat"),
      sessionID: "ses_abort",
      signal: controller.signal,
      generate: async () => {
        called = true
        return "should not run"
      },
    })
    expect(called).toBe(false)
    expect(result._tag).toBe("err")
    if (result._tag !== "err") return
    expect(result.error).toBeInstanceOf(SmartNoteDraftUnavailable)
  })
})

test("missing chat does not draft a note", async () => {
  await using project = await tmpdir({ git: true })
  try {
    const { app } = await import("../../src/app")
    const response = await app.request("/api/session/ses_missing/smart-note", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-buddy-directory": project.path,
      },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: "Session not found",
      code: "session.not_found",
    })
  } finally {
    await closeAgentRuntime()
  }
})
