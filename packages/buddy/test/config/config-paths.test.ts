import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  isFilesystemRootDirectory,
  resolveProjectConfigFile,
} from "../../src/config/store/config-paths"
import { projectConfigFile } from "../helpers/project-config"
import { temporaryDirectory } from "../helpers/temporary-directory"

describe("config paths", () => {
  test("treats Windows drive roots as filesystem roots", () => {
    expect(isFilesystemRootDirectory("C:\\", path.win32)).toBe(true)
    expect(isFilesystemRootDirectory("C:\\Users\\example\\Documents\\workspace", path.win32)).toBe(
      false,
    )
  })

  test("treats POSIX root as a filesystem root", () => {
    expect(isFilesystemRootDirectory("/", path.posix)).toBe(true)
    expect(isFilesystemRootDirectory("/home/example/code/workspace", path.posix)).toBe(false)
  })

  test("defaults notebook config to <notebook>/.buddy/buddy.jsonc", async () => {
    await using directory = await temporaryDirectory({ prefix: "buddy-config-paths-" })

    expect(resolveProjectConfigFile(directory.path)).toBe(projectConfigFile(directory.path))
  })

  test("uses only notebook config files inside <notebook>/.buddy", async () => {
    await using directory = await temporaryDirectory({ prefix: "buddy-config-paths-" })
    const jsonFile = projectConfigFile(directory.path, "buddy.json")
    mkdirSync(path.dirname(jsonFile), { recursive: true })
    writeFileSync(jsonFile, "{}\n")

    expect(resolveProjectConfigFile(directory.path)).toBe(jsonFile)
  })

  test("ignores root-level notebook config files", async () => {
    await using directory = await temporaryDirectory({ prefix: "buddy-config-paths-" })
    writeFileSync(path.join(directory.path, "buddy.jsonc"), '{"model":"anthropic/root"}\n')
    writeFileSync(path.join(directory.path, "buddy.json"), '{"model":"anthropic/root-json"}\n')

    const resolved = resolveProjectConfigFile(directory.path)

    expect(resolved).toBe(projectConfigFile(directory.path))
    expect(existsSync(resolved)).toBe(false)
  })
})
