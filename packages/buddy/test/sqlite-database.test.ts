import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Database } from "../src/sqlite/database.bun"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("Bun SQLite database", () => {
  test("opens a writable database when options are omitted", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "buddy-sqlite-"))
    temporaryDirectories.push(directory)

    const database = new Database(path.join(directory, "database.sqlite"))
    try {
      database.exec("create table settings (value text not null)")
      database.prepare("insert into settings (value) values (?)").run("ready")

      expect(database.prepare<{ value: string }>("select value from settings").get()).toEqual({
        value: "ready",
      })
    } finally {
      database.close()
    }
  })
})
