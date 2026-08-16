import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import {
  readBuddyHomeDefaultAccessState,
  resolveBuddyHomeDefaultPath,
} from "../../src/project/buddy-home"
import { Global } from "../../src/storage"

function documentsDirectoryExistsSync(filepath: fs.PathLike): boolean {
  return String(filepath) === path.join(Global.Path.home, "Documents")
}

function noopAccessSync(): void {}

describe("buddy home", () => {
  test("resolves the default path without probing the filesystem", () => {
    const originalExistsSync = fs.existsSync
    let accessedFilesystem = false

    const existsSync: typeof fs.existsSync = (...args) => {
      accessedFilesystem = true
      return originalExistsSync(...args)
    }
    fs.existsSync = existsSync

    try {
      expect(resolveBuddyHomeDefaultPath()).toBe(path.join(Global.Path.home, "Documents", "Buddy"))
      expect(accessedFilesystem).toBe(false)
    } finally {
      fs.existsSync = originalExistsSync
    }
  })

  test("reports granted access when the documents ancestor is accessible", () => {
    const originalExistsSync = fs.existsSync
    const originalAccessSync = fs.accessSync
    const existsSync: typeof fs.existsSync = documentsDirectoryExistsSync
    const accessSync: typeof fs.accessSync = noopAccessSync
    fs.existsSync = existsSync
    fs.accessSync = accessSync

    try {
      expect(readBuddyHomeDefaultAccessState()).toEqual({
        defaultPath: path.join(Global.Path.home, "Documents", "Buddy"),
        granted: true,
      })
    } finally {
      fs.existsSync = originalExistsSync
      fs.accessSync = originalAccessSync
    }
  })
})
