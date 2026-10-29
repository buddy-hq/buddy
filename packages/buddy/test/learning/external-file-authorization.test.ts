import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { authorizeFileReadPaths } from "../../src/learning/runtime/external-file-authorization"
import type { ExternalFileAuthorizationContext } from "../../src/learning/runtime/external-file-authorization"
import { tmpdir } from "../helpers/tmpdir"

function context(
  directory: string,
  requests: Parameters<ExternalFileAuthorizationContext["ask"]>[0][],
) {
  return {
    directory,
    async ask(request: Parameters<ExternalFileAuthorizationContext["ask"]>[0]) {
      requests.push(request)
    },
  }
}

describe("external file authorization", () => {
  test("uses the repository boundary for nested notebooks and asks for external paths", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const directory = path.join(project.path, "lessons")
    await fs.mkdir(directory)
    const localPath = path.join(project.path, "materials.md")
    const externalPath = path.join(external.path, "materials.md")
    await Promise.all([fs.writeFile(localPath, "local"), fs.writeFile(externalPath, "external")])
    const requests: Parameters<ExternalFileAuthorizationContext["ask"]>[0][] = []
    const paths = await authorizeFileReadPaths(
      [localPath, externalPath],
      context(directory, requests),
    )
    expect(paths).toEqual([await fs.realpath(localPath), await fs.realpath(externalPath)])
    expect(requests.map((request) => request.permission)).toEqual(
      paths[1] === externalPath
        ? ["external_directory"]
        : ["external_directory", "external_directory"],
    )
    expect(requests[0]?.patterns).toEqual([path.join(external.path, "*")])
  })

  test("requires approval for a symlink's external target", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const externalPath = path.join(external.path, "private.txt")
    const link = path.join(project.path, "linked.txt")
    await fs.writeFile(externalPath, "private")
    await fs.symlink(externalPath, link)
    const requests: Parameters<ExternalFileAuthorizationContext["ask"]>[0][] = []
    expect(await authorizeFileReadPaths([link], context(project.path, requests))).toEqual([
      await fs.realpath(externalPath),
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.patterns).toEqual([
      path.join(path.dirname(await fs.realpath(externalPath)), "*"),
    ])
  })
})
