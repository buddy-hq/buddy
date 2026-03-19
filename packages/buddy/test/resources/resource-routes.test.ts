import { describe, expect, test } from "bun:test"
import path from "node:path"
import { readFile, stat, writeFile } from "node:fs/promises"
import { app } from "../../src/index.ts"
import { tmpdir } from "../helpers/tmpdir"

const DIRECTORY_HEADER = "x-buddy-directory" as const
const JSON_CONTENT_TYPE = "application/json" as const

describe("resource routes", () => {
  test("registers, renames, rebuilds, and removes resources", async () => {
    await using project = await tmpdir({ git: true })
    const sourceRelpath = "guide.html"
    const sourcePath = path.join(project.path, sourceRelpath)
    await writeFile(sourcePath, "<!doctype html><html><body><h1>Guide</h1><p>Start here.</p></body></html>", "utf8")

    const addResponse = await app.request("/api/resource", {
      method: "POST",
      headers: {
        [DIRECTORY_HEADER]: project.path,
        "content-type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({
        sourcePath: sourceRelpath,
        alias: "guide",
      }),
    })
    expect(addResponse.status).toBe(200)
    const added = await addResponse.json() as { id: string; alias: string; status: string; sourceRelpath: string }
    expect(added.alias).toBe("guide")
    expect(added.status).toBe("preparing")
    expect(added.sourceRelpath.startsWith("resources/")).toBe(true)
    expect(added.sourceRelpath.endsWith("/guide.html")).toBe(true)
    await expect(stat(sourcePath)).rejects.toBeTruthy()
    await expect(readFile(path.join(project.path, added.sourceRelpath), "utf8")).resolves.toContain("Guide")

    const listResponse = await app.request("/api/resource", {
      headers: {
        [DIRECTORY_HEADER]: project.path,
      },
    })
    expect(listResponse.status).toBe(200)
    const listed = await listResponse.json() as { resources: Array<{ id: string; alias: string }> }
    expect(listed.resources.some((entry) => entry.id === added.id)).toBe(true)

    const renameResponse = await app.request(`/api/resource/${added.id}`, {
      method: "PATCH",
      headers: {
        [DIRECTORY_HEADER]: project.path,
        "content-type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({
        alias: "guide-renamed",
      }),
    })
    expect(renameResponse.status).toBe(200)
    const renamed = await renameResponse.json() as { alias: string }
    expect(renamed.alias).toBe("guide-renamed")

    const rebuildResponse = await app.request("/api/resource/guide-renamed/rebuild", {
      method: "POST",
      headers: {
        [DIRECTORY_HEADER]: project.path,
      },
    })
    expect(rebuildResponse.status).toBe(200)
    const rebuilt = await rebuildResponse.json() as { status: string }
    expect(rebuilt.status).toBe("preparing")

    const removeResponse = await app.request("/api/resource/guide-renamed", {
      method: "DELETE",
      headers: {
        [DIRECTORY_HEADER]: project.path,
      },
    })
    expect(removeResponse.status).toBe(200)
    await expect(removeResponse.json()).resolves.toEqual({ ok: true })
  })

  test("copies an absolute external resource into notebook resources", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir({ git: true })
    const externalSourcePath = path.join(external.path, "outside.pdf")
    await writeFile(externalSourcePath, "%PDF-1.4\n", "utf8")

    const response = await app.request("/api/resource", {
      method: "POST",
      headers: {
        [DIRECTORY_HEADER]: project.path,
        "content-type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({
        sourcePath: externalSourcePath,
      }),
    })

    expect(response.status).toBe(200)
    const created = await response.json() as { sourceRelpath: string }
    expect(created.sourceRelpath.startsWith("resources/")).toBe(true)
    await expect(readFile(externalSourcePath, "utf8")).resolves.toContain("%PDF-1.4")
    await expect(readFile(path.join(project.path, created.sourceRelpath), "utf8")).resolves.toContain("%PDF-1.4")
  })

  test("normalizes fallback aliases to command-safe tokens", async () => {
    await using project = await tmpdir({ git: true })
    const sourceRelpath = "Shape Up (2019).pdf"
    const sourcePath = path.join(project.path, sourceRelpath)
    await writeFile(sourcePath, "%PDF-1.4\n", "utf8")

    const response = await app.request("/api/resource", {
      method: "POST",
      headers: {
        [DIRECTORY_HEADER]: project.path,
        "content-type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({
        sourcePath: sourceRelpath,
      }),
    })

    expect(response.status).toBe(200)
    const created = await response.json() as { alias: string }
    expect(created.alias).toBe("shape-up-2019")
  })
})
