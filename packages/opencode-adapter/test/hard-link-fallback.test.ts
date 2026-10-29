import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { publishCopy } from "../src/global-config-import"
import { publish } from "../src/seed-v2-database"

function linkThatRejects(code: string) {
  return (_existing: string, _target: string): Promise<void> => Promise.reject(Object.assign(new Error(`Hard link failed: ${code}`), { code }))
}

async function withTemporaryDirectory(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-hard-link-fallback-"))
  try {
    await run(root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe("database publication without hard links", () => {
  test("EPERM publishes the temporary bytes by rename and removes the temporary file", async () => {
    await withTemporaryDirectory(async (root) => {
      const temporary = path.join(root, "database.tmp")
      const destination = path.join(root, "opencode-v2.db")
      const content = Buffer.from([0, 1, 127, 128, 255])
      await fs.writeFile(temporary, content)

      expect(await publish(temporary, destination, linkThatRejects("EPERM"))).toBe(true)

      expect(await fs.readFile(destination)).toEqual(content)
      expect(await fs.readdir(root)).toEqual(["opencode-v2.db"])
    })
  })

  test("EPERM preserves an existing destination and returns false", async () => {
    await withTemporaryDirectory(async (root) => {
      const temporary = path.join(root, "database.tmp")
      const destination = path.join(root, "opencode-v2.db")
      await fs.writeFile(temporary, "new database")
      await fs.writeFile(destination, "existing database")

      expect(await publish(temporary, destination, linkThatRejects("EPERM"))).toBe(false)

      expect(await fs.readFile(destination, "utf8")).toBe("existing database")
    })
  })

  test("EACCES still rejects instead of falling back", async () => {
    await withTemporaryDirectory(async (root) => {
      const temporary = path.join(root, "database.tmp")
      const destination = path.join(root, "opencode-v2.db")
      await fs.writeFile(temporary, "new database")

      await expect(publish(temporary, destination, linkThatRejects("EACCES"))).rejects.toMatchObject({ code: "EACCES" })
    })
  })
})

describe("global config publication without hard links", () => {
  test("EPERM copies the source with private permissions and removes the temporary file", async () => {
    await withTemporaryDirectory(async (root) => {
      const source = path.join(root, "config.json")
      const target = path.join(root, "opencode.jsonc")
      const content = '{ "username": "previous-settings" }\n'
      await fs.writeFile(source, content, { mode: 0o644 })

      await publishCopy(source, target, linkThatRejects("EPERM"))

      expect(await fs.readFile(target, "utf8")).toBe(content)
      if (process.platform !== "win32") expect((await fs.stat(target)).mode & 0o777).toBe(0o600)
      expect((await fs.readdir(root)).toSorted()).toEqual(["config.json", "opencode.jsonc"])
    })
  })

  test("EPERM preserves an existing target without an error and removes the temporary file", async () => {
    await withTemporaryDirectory(async (root) => {
      const source = path.join(root, "config.json")
      const target = path.join(root, "opencode.jsonc")
      await fs.writeFile(source, '{ "username": "previous-settings" }\n')
      await fs.writeFile(target, '{ "username": "current-settings" }\n')

      await publishCopy(source, target, linkThatRejects("EPERM"))

      expect(await fs.readFile(target, "utf8")).toBe('{ "username": "current-settings" }\n')
      expect((await fs.readdir(root)).toSorted()).toEqual(["config.json", "opencode.jsonc"])
    })
  })
})
