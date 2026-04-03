import { describe, expect, test } from "bun:test"
import path from "node:path"
import { allowedDirectoryRoots, resolveDirectory } from "../../src/project/directory"
import { Global } from "../../src/storage"

describe("directory roots", () => {
  test("defaults include Buddy Home without allowing the entire home directory", () => {
    const originalAllowedRoots = process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
    delete process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS

    try {
      const roots = allowedDirectoryRoots()
      const expectedBuddyHomeRoot = resolveDirectory(
        path.join(Global.Path.home, "Documents", "Buddy"),
      )
      const homeRoot = resolveDirectory(Global.Path.home)

      expect(roots).toContain(expectedBuddyHomeRoot)
      expect(roots).not.toContain(homeRoot)
    } finally {
      if (originalAllowedRoots === undefined) {
        delete process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS
      } else {
        process.env.BUDDY_ALLOWED_DIRECTORY_ROOTS = originalAllowedRoots
      }
    }
  })
})
