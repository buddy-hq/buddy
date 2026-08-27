import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { temporaryDirectory } from "./temporary-directory"

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("temporaryDirectory", () => {
  test("removes its directory when its scope exits", async () => {
    let directoryPath = ""

    {
      await using directory = await temporaryDirectory({ prefix: "buddy-disposable-test-" })
      directoryPath = directory.path
      await fs.writeFile(path.join(directory.path, "sentinel.txt"), "sentinel")

      expect(await fs.readFile(path.join(directory.path, "sentinel.txt"), "utf8")).toBe("sentinel")
    }

    expect(await pathExists(directoryPath)).toBe(false)
  })

  test("can create an isolated directory below an explicit parent", async () => {
    await using parent = await temporaryDirectory({ prefix: "buddy-disposable-parent-" })
    let childPath = ""

    {
      await using child = await temporaryDirectory({
        parentDirectory: parent.path,
        prefix: "child-",
      })
      childPath = child.path

      expect(path.dirname(child.path)).toBe(parent.path)
    }

    expect(await pathExists(childPath)).toBe(false)
  })
})
