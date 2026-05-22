import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import z from "zod"
import { app } from "../../src/index.ts"
import { listPiCommands } from "../../src/pi-backend/commands"
import {
  PiRuntime,
  readPiCommandPromptRequest,
  readPiPromptRequest,
} from "../../src/pi-backend/runtime"
import { tmpdir } from "../helpers/tmpdir"

const sessionResponseSchema = z.object({
  id: z.string(),
  directory: z.string(),
})
const sessionListResponseSchema = z.array(z.object({ id: z.string() }))

describe("PI session routes", () => {
  test("creates and lists PI sessions through the Buddy session API", async () => {
    await using project = await tmpdir({ git: true })

    const create = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: "{}",
    })
    expect(create.status).toBe(200)
    const session = sessionResponseSchema.parse(await create.json())
    expect(session.id).toBeString()
    expect(session.directory).toBe(fs.realpathSync.native(project.path))

    const list = await app.request("/api/session", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })
    expect(list.status).toBe(200)
    const sessions = sessionListResponseSchema.parse(await list.json())
    expect(sessions.some((entry) => entry.id === session.id)).toBe(true)
  })

  test("persists empty PI sessions across runtime instances", async () => {
    await using project = await tmpdir({ git: true })
    await using piAgentDir = await tmpdir()
    const originalAgentDir = process.env.BUDDY_AGENT_DIR
    process.env.BUDDY_AGENT_DIR = piAgentDir.path

    try {
      const created = await new PiRuntime().createSession(project.path)
      const reloaded = await new PiRuntime().getSessionInfo(project.path, created.id)
      expect(reloaded.id).toBe(created.id)
      expect(fs.realpathSync.native(reloaded.directory)).toBe(fs.realpathSync.native(project.path))
    } finally {
      if (originalAgentDir === undefined) {
        delete process.env.BUDDY_AGENT_DIR
      } else {
        process.env.BUDDY_AGENT_DIR = originalAgentDir
      }
    }
  })

  test("keeps Buddy system context out of visible prompt content", () => {
    const request = readPiPromptRequest({
      content: "hi",
      system: "<buddy_runtime_context>hidden</buddy_runtime_context>",
      turnPrelude: "<system-reminder>turn-only</system-reminder>",
    })

    expect(request?.content).toBe("hi")
    expect(request?.system).toBe("<buddy_runtime_context>hidden</buddy_runtime_context>")
    expect(request?.turnPrelude).toBe("<system-reminder>turn-only</system-reminder>")
  })

  test("expands Buddy built-in slash commands before sending them to Pi", () => {
    const request = readPiCommandPromptRequest({
      command: "flashcard",
      arguments: "cell biology",
    })

    expect(request?.content).toContain("Create flashcards about cell biology")
    expect(request?.content.startsWith("/flashcard")).toBe(false)
  })

  test("lists restored Buddy built-in commands alongside Pi commands", async () => {
    await using project = await tmpdir({ git: true })

    const commands = await listPiCommands(project.path)
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "flashcard",
        agent: "buddy",
      }),
    )
  })
})
