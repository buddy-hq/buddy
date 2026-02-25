import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { SessionStore } from "../src/session/session-store.ts"
import type { UserMessage } from "../src/session/message-v2/index.ts"
import { Instance } from "../src/project/instance.ts"

function runInDirectory<T>(directory: string, fn: () => T | Promise<T>) {
  return Instance.provide({
    directory,
    fn,
  })
}

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

function createGitRepo(prefix: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  const marker = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  runGit(root, ["init", "-q"])
  writeFileSync(path.join(root, "README.md"), `# ${marker}\n`)
  runGit(root, ["add", "README.md"])
  runGit(root, ["-c", "user.email=buddy@test.local", "-c", "user.name=Buddy Test", "commit", "-qm", "init"])
  return root
}

describe("session store", () => {
  test("shares busy and abort state across directories in the same project", async () => {
    const repo = createGitRepo("buddy-session-store-project-busy")
    const repoSubdir = path.join(repo, "nested")
    mkdirSync(repoSubdir, { recursive: true })

    const controller = new AbortController()
    let sessionID = ""

    await runInDirectory(repo, async () => {
      sessionID = SessionStore.create().id
      SessionStore.setActiveAbort(sessionID, controller)
      expect(SessionStore.isBusy(sessionID)).toBe(true)
    })

    await runInDirectory(repoSubdir, async () => {
      expect(SessionStore.isBusy(sessionID)).toBe(true)
      expect(SessionStore.abort(sessionID)).toBe(true)
      SessionStore.clearActiveAbort(sessionID)
      expect(SessionStore.isBusy(sessionID)).toBe(false)
    })

    expect(controller.signal.aborted).toBe(true)
  })

  test("tracks busy state with abort controller", async () => {
    const repo = createGitRepo("buddy-session-store-busy")
    await runInDirectory(repo, async () => {
      const session = SessionStore.create()
      const controller = new AbortController()

      expect(SessionStore.isBusy(session.id)).toBe(false)

      SessionStore.setActiveAbort(session.id, controller)
      expect(SessionStore.isBusy(session.id)).toBe(true)

      const aborted = SessionStore.abort(session.id)
      expect(aborted).toBe(true)
      expect(controller.signal.aborted).toBe(true)

      SessionStore.clearActiveAbort(session.id)
      expect(SessionStore.isBusy(session.id)).toBe(false)
    })
  })

  test("persists text part deltas across runtime context disposal", async () => {
    const repo = createGitRepo("buddy-session-store-persist")
    let sessionID = ""
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const messageID = `message_test_user_${suffix}`
    const partID = `part_test_text_${suffix}`
    const now = Date.now()

    await runInDirectory(repo, async () => {
      const session = SessionStore.create()
      sessionID = session.id
      const user: UserMessage = {
        id: messageID,
        sessionID: session.id,
        role: "user",
        agent: "build",
        model: {
          providerID: "anthropic",
          modelID: "k2p5",
        },
        time: { created: now },
      }

      SessionStore.appendMessage(user)
      SessionStore.appendPart({
        id: partID,
        sessionID: session.id,
        messageID: user.id,
        type: "text",
        text: "hello",
        time: { start: now },
      })

      SessionStore.updatePartDelta({
        sessionID: session.id,
        messageID: user.id,
        partID,
        field: "text",
        delta: " world",
      })
    })

    Instance.dispose(repo)

    await runInDirectory(repo, async () => {
      const info = SessionStore.get(sessionID)
      expect(info).toBeDefined()

      const message = SessionStore.getMessageWithParts(sessionID, messageID)
      expect(message).toBeDefined()
      const part = message?.parts[0]
      expect(part?.type).toBe("text")
      if (part?.type === "text") {
        expect(part.text).toBe("hello world")
      }
    })
  })

  test("scopes sessions by project while allowing directory access within project", async () => {
    const repoA = createGitRepo("buddy-session-store-project-a")
    const repoASubdir = path.join(repoA, "nested")
    mkdirSync(repoASubdir, { recursive: true })

    const repoB = createGitRepo("buddy-session-store-project-b")

    let sessionID = ""
    await runInDirectory(repoA, async () => {
      sessionID = SessionStore.create().id
      expect(SessionStore.get(sessionID)).toBeDefined()
    })

    await runInDirectory(repoASubdir, async () => {
      expect(SessionStore.get(sessionID)).toBeDefined()
      const listed = SessionStore.list()
      expect(listed.some((session) => session.id === sessionID)).toBe(true)
    })

    await runInDirectory(repoB, async () => {
      expect(SessionStore.get(sessionID)).toBeUndefined()
    })
  })
})
