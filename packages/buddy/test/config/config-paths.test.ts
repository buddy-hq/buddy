import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  isFilesystemRootDirectory,
  resolveProjectConfigFile,
} from "../../src/config/store/config-paths"
import { projectConfigFile } from "../helpers/project-config"

describe("config paths", () => {
  test("treats Windows drive roots as filesystem roots", () => {
    expect(isFilesystemRootDirectory("C:\\", path.win32)).toBe(true)
    expect(
      isFilesystemRootDirectory("C:\\Users\\example\\Documents\\workspace", path.win32),
    ).toBe(false)
  })

  test("treats POSIX root as a filesystem root", () => {
    expect(isFilesystemRootDirectory("/", path.posix)).toBe(true)
    expect(isFilesystemRootDirectory("/home/example/code/workspace", path.posix)).toBe(false)
  })

  test("defaults notebook config to <notebook>/.buddy/buddy.jsonc", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "buddy-config-paths-"))

    expect(resolveProjectConfigFile(directory)).toBe(projectConfigFile(directory))
  })

  test("uses only notebook config files inside <notebook>/.buddy", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "buddy-config-paths-"))
    const jsonFile = projectConfigFile(directory, "buddy.json")
    mkdirSync(path.dirname(jsonFile), { recursive: true })
    writeFileSync(jsonFile, "{}\n")

    expect(resolveProjectConfigFile(directory)).toBe(jsonFile)
  })

  test("ignores root-level notebook config files", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "buddy-config-paths-"))
    writeFileSync(path.join(directory, "buddy.jsonc"), '{"model":"anthropic/root"}\n')
    writeFileSync(path.join(directory, "buddy.json"), '{"model":"anthropic/root-json"}\n')

    const resolved = resolveProjectConfigFile(directory)

    expect(resolved).toBe(projectConfigFile(directory))
    expect(existsSync(resolved)).toBe(false)
  })
})
