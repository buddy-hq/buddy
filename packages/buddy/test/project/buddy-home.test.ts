import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import {
  readBuddyHomeDefaultAccessState,
  resolveBuddyHomeDefaultPath,
} from "../../src/project/buddy-home"
import { Global } from "../../src/storage"

describe("buddy home", () => {
  test("resolves the default path without probing the filesystem", () => {
    const originalExistsSync = fs.existsSync
    let accessedFilesystem = false

    fs.existsSync = ((...args: Parameters<typeof originalExistsSync>) => {
      accessedFilesystem = true
      return originalExistsSync(...args)
    }) as typeof fs.existsSync

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

    fs.existsSync = ((filepath: fs.PathLike) =>
      String(filepath) === path.join(Global.Path.home, "Documents")) as typeof fs.existsSync
    fs.accessSync = (() => undefined) as typeof fs.accessSync

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
