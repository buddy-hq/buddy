import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  authorizeFileReadPaths,
  authorizeFileWritePath,
} from "../../src/learning/runtime/external-file-authorization"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { createBuddyToolContext } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

function permissionRecordingContext(input: {
  directory: string
  requests: Parameters<BuddyToolContext["ask"]>[0][]
}): BuddyToolContext {
  const context = createBuddyToolContext({ directory: input.directory, agent: "buddy" })
  context.ask = async (request) => {
    input.requests.push(request)
  }
  return context
}

describe("external file authorization", () => {
  test("does not request external access for workspace files", async () => {
    await using project = await tmpdir({ git: true })
    const filePath = path.join(project.path, "notes.md")
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []
    await Bun.write(filePath, "notes")

    const authorized = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        authorizeFileReadPaths(
          [filePath],
          permissionRecordingContext({ directory: project.path, requests }),
        ),
    })

    expect(authorized).toEqual([await fs.realpath(filePath)])
    expect(requests).toEqual([])
  })

  test("groups external reads by parent folder", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const firstPath = path.join(external.path, "first.png")
    const secondPath = path.join(external.path, "second.png")
    const externalDirectory = await fs.realpath(external.path)
    const lexicalDirectory = path.resolve(external.path)
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []
    await Promise.all([Bun.write(firstPath, "first"), Bun.write(secondPath, "second")])

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        authorizeFileReadPaths(
          [firstPath, secondPath],
          permissionRecordingContext({ directory: project.path, requests }),
        ),
    })

    expect(requests).toEqual([
      {
        permission: "external_directory",
        patterns: [path.join(lexicalDirectory, "*")],
        always: [path.join(lexicalDirectory, "*")],
        metadata: {},
      },
      ...(lexicalDirectory === externalDirectory
        ? []
        : [
            {
              permission: "external_directory" as const,
              patterns: [path.join(externalDirectory, "*")],
              always: [path.join(externalDirectory, "*")],
              metadata: {},
            },
          ]),
    ])
  })

  test("authorizes both lexical and canonical external directories for symlinked reads", async () => {
    await using project = await tmpdir({ git: true })
    await using lexicalDirectory = await tmpdir()
    await using canonicalDirectory = await tmpdir()
    const canonicalFilePath = path.join(canonicalDirectory.path, "image.png")
    const linkedDirectoryPath = path.join(lexicalDirectory.path, "linked")
    const lexicalFilePath = path.join(linkedDirectoryPath, "image.png")
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []
    await Bun.write(canonicalFilePath, "image")
    await fs.symlink(
      canonicalDirectory.path,
      linkedDirectoryPath,
      process.platform === "win32" ? "junction" : "dir",
    )

    const authorized = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        authorizeFileReadPaths(
          [lexicalFilePath],
          permissionRecordingContext({ directory: project.path, requests }),
        ),
    })

    const canonicalPath = await fs.realpath(canonicalFilePath)
    expect(authorized).toEqual([canonicalPath])
    expect(requests).toEqual([
      {
        permission: "external_directory",
        patterns: [path.join(linkedDirectoryPath, "*")],
        always: [path.join(linkedDirectoryPath, "*")],
        metadata: {
          filepath: lexicalFilePath,
          parentDir: linkedDirectoryPath,
        },
      },
      {
        permission: "external_directory",
        patterns: [path.join(path.dirname(canonicalPath), "*")],
        always: [path.join(path.dirname(canonicalPath), "*")],
        metadata: {
          filepath: canonicalPath,
          parentDir: path.dirname(canonicalPath),
        },
      },
    ])
  })

  test("authorizes a missing write target through its canonical parent", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const externalDirectory = await fs.realpath(external.path)
    const filePath = path.join(externalDirectory, "output.svg")
    const requests: Parameters<BuddyToolContext["ask"]>[0][] = []

    const authorized = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        authorizeFileWritePath(
          filePath,
          permissionRecordingContext({ directory: project.path, requests }),
        ),
    })

    expect(authorized).toBe(filePath)
    expect(requests).toEqual([
      {
        permission: "external_directory",
        patterns: [path.join(externalDirectory, "*")],
        always: [path.join(externalDirectory, "*")],
        metadata: {
          filepath: filePath,
          parentDir: externalDirectory,
        },
      },
    ])
  })
})
