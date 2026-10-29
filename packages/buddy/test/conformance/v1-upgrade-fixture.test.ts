import { expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import z from "zod"
import {
  remapV1UpgradeDatabase,
  restoreV1UpgradeFixture,
  V1_UPGRADE_FIXTURE,
  V1_UPGRADE_FIXTURE_DIRECTORY,
} from "../../script/v1-upgrade-fixture"

const sessionRow = z.object({
  id: z.string(),
  directory: z.string(),
  path: z.string(),
})

const fixtureSessionIDs = [
  V1_UPGRADE_FIXTURE.childSessionID,
  V1_UPGRADE_FIXTURE.parentSessionID,
  V1_UPGRADE_FIXTURE.separateSessionID,
].toSorted()

function readSessions(database: string) {
  const db = new Database(database, { readonly: true })
  try {
    return z
      .array(sessionRow)
      .parse(db.query("SELECT id, directory, path FROM session ORDER BY id").all())
  } finally {
    db.close(false)
  }
}

function readGlobalWorktree(database: string) {
  const db = new Database(database, { readonly: true })
  try {
    return z
      .object({ worktree: z.string() })
      .parse(db.query("SELECT worktree FROM project WHERE id = 'global'").get())
  } finally {
    db.close(false)
  }
}

function expectNativeNotebookSpelling(database: string, notebook: string) {
  const native = realpathSync.native(notebook)
  const sessions = readSessions(database)
  expect(sessions.map((session) => session.id).toSorted()).toEqual(fixtureSessionIDs)
  for (const session of sessions) {
    expect(session.directory).toBe(native.replaceAll("\\", "/"))
    expect(session.path).toBe(path.relative(path.parse(native).root, native).replaceAll("\\", "/"))
  }
  expect(readGlobalWorktree(database).worktree).toBe(path.parse(native).root.replaceAll("\\", "/"))
}

test("restore stores the notebook as the forward-slash form of its native realpath", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "buddy-v1-upgrade-fixture-"))
  try {
    const restored = restoreV1UpgradeFixture({
      root,
      openCodeDataDirectory: path.join(root, "opencode"),
      credentials: false,
    })
    expect(restored.notebook).toBe(realpathSync.native(restored.notebook))
    expectNativeNotebookSpelling(restored.v1Database, restored.notebook)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a second spelling of the notebook is stored as the native target", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "buddy-v1-upgrade-fixture-"))
  try {
    const target = path.join(root, "real notebook")
    const link = path.join(root, "linked notebook")
    mkdirSync(target)
    symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir")
    const database = path.join(root, "opencode.db")
    copyFileSync(path.join(V1_UPGRADE_FIXTURE_DIRECTORY, "opencode.db"), database)
    remapV1UpgradeDatabase(database, {
      buddyHome: root,
      notebook: link,
      external: path.join(root, "outside", "reading-list.txt"),
      root,
    })
    expect(link.replaceAll("\\", "/")).not.toBe(realpathSync.native(link).replaceAll("\\", "/"))
    expectNativeNotebookSpelling(database, link)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
