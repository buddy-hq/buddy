import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import path from "node:path"
import z from "zod"
import { Config } from "../../src/config/config"
import { startSessionNoteTitleSync } from "../../src/notes/session-title-sync"
import { tmpdir } from "../helpers/tmpdir"
import { createRuntimeHarness } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => {
  api = await createRuntimeHarness()
})
afterAll(async () => {
  await api?.[Symbol.asyncDispose]()
})

const sessionNote = z.object({
  id: z.string(),
  sessionID: z.string(),
  title: z.string(),
  relativePath: z.string(),
})

describe("Session notes", () => {
  test("a captured note follows a chat renamed through the API and keeps its content", async () => {
    await using home = await tmpdir()
    const previous = await Config.getGlobal()
    try {
      await Config.replaceGlobal({
        ...previous,
        notebook_home: home.path,
        notes_directory: path.join(home.path, "Notes"),
      })
      const stopTitleSync = startSessionNoteTitleSync()
      try {
        const session = await api.create({ title: "Water cycle notes" })
        const text = "Evaporation, condensation, and precipitation."
        const captured = z.object({ note: sessionNote, created: z.boolean() }).parse(
          await api.json(`/notes/session/${session.id}/capture`, {
            method: "POST",
            body: JSON.stringify({ text }),
          }),
        )
        expect(captured).toMatchObject({
          created: true,
          note: { sessionID: session.id, title: "Water cycle notes" },
        })

        await using events = await api.events()
        const title = "Water cycle study guide"
        expect(
          await api.json(`/session/${session.id}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          }),
        ).toMatchObject({ title })
        await events.until((event) => event.payload.type === "notes.library.updated")

        const renamed = z
          .object({ note: sessionNote })
          .parse(await api.json(`/notes/session/${session.id}`)).note
        expect(renamed).toMatchObject({ id: captured.note.id, sessionID: session.id, title })
        const document = z
          .object({ content: z.string() })
          .parse(
            await api.json(
              `/notes/document?${new URLSearchParams({ path: renamed.relativePath, id: renamed.id })}`,
            ),
          )
        expect(document.content).toContain(text)
      } finally {
        stopTitleSync()
      }
    } finally {
      await Config.replaceGlobal(previous)
    }
  })
})
