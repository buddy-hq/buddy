import { describe, expect, test } from "bun:test"
import matter from "gray-matter"
import path from "node:path"
import { readFile, stat, writeFile } from "node:fs/promises"
import { app } from "../../src/index.ts"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectManifestSchema,
  BuddyObjectPath,
} from "../../src/objects"
import { RESOURCE_PACK_ENTRYPOINT_FILE_NAME } from "../../src/resource-packs"
import { tmpdir } from "../helpers/tmpdir"
import { createTestPdf } from "../helpers/pdf"
import { requireJsonObject, requireJsonArray, requireString, parseJsonObject, parsePromptString } from "../helpers/parse"

const DIRECTORY_HEADER = "x-buddy-directory" as const
const JSON_CONTENT_TYPE = "application/json" as const
const RESOURCE_READY_STATUS = "ready" as const
const RESOURCE_POLL_ATTEMPTS = 20
const RESOURCE_POLL_DELAY_MS = 100

describe("resource routes", () => {
  test("rejects HTML downloaded with a PDF extension and never advertises PDF MIME", async () => {
    await using project = await tmpdir({ git: true })
    const sourceRelpath = "download.pdf"
    await writeFile(
      path.join(project.path, sourceRelpath),
      "<!DOCTYPE html><html><body>Google Drive viewer</body></html>",
      "utf8",
    )

    const createResponse = await app.request("/api/objects/resource", {
      method: "POST",
      headers: {
        [DIRECTORY_HEADER]: project.path,
        "content-type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({ sourcePath: sourceRelpath }),
    })
    expect(createResponse.status).toBe(400)
    await expect(createResponse.json()).resolves.toEqual({
      error: "The .pdf file contains HTML instead of a PDF document.",
    })

    const rawResponse = await app.request(
      `/api/file/raw/${sourceRelpath}?path=${encodeURIComponent(sourceRelpath)}`,
      {
        method: "HEAD",
        headers: { [DIRECTORY_HEADER]: project.path },
      },
    )
    expect(rawResponse.status).toBe(200)
    expect(rawResponse.headers.get("content-type")).toBe("application/octet-stream")
  })

  test("rejects structurally invalid PDFs and never advertises PDF MIME", async () => {
    await using project = await tmpdir({ git: true })
    const sourceRelpath = "broken.pdf"
    await writeFile(
      path.join(project.path, sourceRelpath),
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n",
      "utf8",
    )

    const createResponse = await app.request("/api/objects/resource", {
      method: "POST",
      headers: {
        [DIRECTORY_HEADER]: project.path,
        "content-type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({ sourcePath: sourceRelpath }),
    })
    expect(createResponse.status).toBe(400)
    await expect(createResponse.json()).resolves.toEqual({
      error: "The PDF is missing its EOF marker.",
    })

    const rawResponse = await app.request(
      `/api/file/raw/${sourceRelpath}?path=${encodeURIComponent(sourceRelpath)}`,
      {
        method: "HEAD",
        headers: { [DIRECTORY_HEADER]: project.path },
      },
    )
    expect(rawResponse.status).toBe(200)
    expect(rawResponse.headers.get("content-type")).toBe("application/octet-stream")
  })

  test("serializes concurrent creates that request the same alias", async () => {
    await using project = await tmpdir({ git: true })
    await Promise.all([
      writeFile(path.join(project.path, "first.html"), "<p>First</p>", "utf8"),
      writeFile(path.join(project.path, "second.html"), "<p>Second</p>", "utf8"),
    ])

    const responses = await Promise.all(
      ["first.html", "second.html"].map((sourcePath) =>
        app.request("/api/objects/resource", {
          method: "POST",
          headers: {
            [DIRECTORY_HEADER]: project.path,
            "content-type": JSON_CONTENT_TYPE,
          },
          body: JSON.stringify({ sourcePath, alias: "shared" }),
        }),
      ),
    )
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    const created = await Promise.all(
      responses.map(async (response) => requireJsonObject(await response.json())),
    )

    expect(new Set(created.map((resource) => requireString(resource.objectID, "objectID"))).size).toBe(
      2,
    )
    expect(new Set(created.map((resource) => requireString(resource.alias, "alias")))).toEqual(
      new Set(["shared", "shared-2"]),
    )
  })

  test("registers, renames, rebuilds, and removes resources", async () => {
    await using project = await tmpdir({ git: true })
    const sourceRelpath = "guide.html"
    const sourcePath = path.join(project.path, sourceRelpath)
    await writeFile(
      sourcePath,
      "<!doctype html><html><body><h1>Guide</h1><p>Start here.</p></body></html>",
      "utf8",
    )

    const addResponse = await app.request("/api/objects/resource", {
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
    const added = requireJsonObject(await addResponse.json())
    expect(added.alias).toBe("guide")
    expect(added.status).toBe("preparing")
    expect(added.sourceValidity).toBe("unknown")
    expect(added.extractionStatus).toBe("preparing")
    const storedSourceRelpath = requireString(added.sourceRelpath, "sourceRelpath")
    expect(storedSourceRelpath.startsWith(".buddy/objects/v1/resource/")).toBe(true)
    expect(storedSourceRelpath.endsWith("/guide.html")).toBe(true)
    expect(added.sourceOriginRelpath).toBe(sourceRelpath)
    await expect(stat(sourcePath)).resolves.toBeDefined()
    await expect(readFile(path.join(project.path, storedSourceRelpath), "utf8")).resolves.toContain(
      "Guide",
    )

    const listResponse = await app.request("/api/objects/resource", {
      headers: {
        [DIRECTORY_HEADER]: project.path,
      },
    })
    expect(listResponse.status).toBe(200)
    const listed = requireJsonObject(await listResponse.json())
    const listedResources = requireJsonArray(listed.resources, "resources")
    expect(
      listedResources.some((entry) => parseJsonObject(entry)?.objectID === added.objectID),
    ).toBe(true)

    const renameResponse = await app.request(`/api/objects/resource/${added.objectID}`, {
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
    const renamed = requireJsonObject(await renameResponse.json())
    expect(renamed.alias).toBe("guide-renamed")

    const rebuildResponse = await app.request(
      "/api/objects/resource/by-key/guide-renamed/rebuild",
      {
        method: "POST",
        headers: {
          [DIRECTORY_HEADER]: project.path,
        },
      },
    )
    expect(rebuildResponse.status).toBe(200)
    const rebuilt = requireJsonObject(await rebuildResponse.json())
    expect(rebuilt.status).toBe("preparing")

    const removeResponse = await app.request("/api/objects/resource/by-key/guide-renamed", {
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
    await writeFile(externalSourcePath, createTestPdf(), "utf8")

    const response = await app.request("/api/objects/resource", {
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
    const created = requireJsonObject(await response.json())
    const createdSourceRelpath = requireString(created.sourceRelpath, "sourceRelpath")
    expect(createdSourceRelpath.startsWith(".buddy/objects/v1/resource/")).toBe(true)
    expect(created.sourceValidity).toBe("valid")
    expect(created.extractionStatus).toBe("preparing")
    await expect(readFile(externalSourcePath, "utf8")).resolves.toContain("%PDF-1.4")
    await expect(
      readFile(path.join(project.path, createdSourceRelpath), "utf8"),
    ).resolves.toContain("%PDF-1.4")
  })

  test("resumes a persisted preparation interrupted by a backend restart", async () => {
    await using project = await tmpdir({ git: true })
    const sourceRelpath = "interrupted.html"
    await writeFile(
      path.join(project.path, sourceRelpath),
      "<!doctype html><html><body><h1>Interrupted</h1><p>Resume me.</p></body></html>",
      "utf8",
    )

    const addResponse = await app.request("/api/objects/resource", {
      method: "POST",
      headers: {
        [DIRECTORY_HEADER]: project.path,
        "content-type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({ sourcePath: sourceRelpath, alias: "interrupted" }),
    })
    expect(addResponse.status).toBe(200)
    const added = requireJsonObject(await addResponse.json())
    const objectID = BuddyObjectIDSchema.parse(added.objectID)
    await waitForResource(project.path, "interrupted")
    await Bun.sleep(RESOURCE_POLL_DELAY_MS)

    const manifestPath = BuddyObjectPath.manifestFile(
      project.path,
      BUDDY_OBJECT_KINDS.resource,
      objectID,
    )
    const manifest = BuddyObjectManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, "utf8")),
    )
    const interrupted = BuddyObjectManifestSchema.parse({
      ...manifest,
      status: "preparing",
      updatedAt: new Date().toISOString(),
      summary: {
        ...manifest.summary,
        extractionStatus: "preparing",
        preparedAt: null,
      },
    })
    await writeFile(manifestPath, `${JSON.stringify(interrupted, null, 2)}\n`, "utf8")

    const preparing = await readResource(project.path, "interrupted")
    expect(preparing.status).toBe("preparing")
    const recovered = await waitForResource(project.path, "interrupted")
    expect(recovered.status).toBe(RESOURCE_READY_STATUS)
  })

  test("normalizes fallback aliases to command-safe tokens", async () => {
    await using project = await tmpdir({ git: true })
    const sourceRelpath = "Shape Up (2019).pdf"
    const sourcePath = path.join(project.path, sourceRelpath)
    await writeFile(sourcePath, createTestPdf(), "utf8")

    const response = await app.request("/api/objects/resource", {
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
    const created = requireJsonObject(await response.json())
    expect(created.alias).toBe("shape-up-2019")
  })

  test("keeps ready resources ready across sub-millisecond metadata drift", async () => {
    await using project = await tmpdir({ git: true })
    const sourceRelpath = "guide.html"
    const sourcePath = path.join(project.path, sourceRelpath)
    await writeFile(
      sourcePath,
      "<!doctype html><html><body><h1>Guide</h1><p>Start here.</p></body></html>",
      "utf8",
    )

    const addResponse = await app.request("/api/objects/resource", {
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

    const readyResource = await waitForResource(project.path, "guide")
    expect(readyResource.status).toBe(RESOURCE_READY_STATUS)

    const metadataPath = path.join(
      project.path,
      requireString(readyResource.packPath, "pack path"),
      RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
    )
    const metadata = matter(await readFile(metadataPath, "utf8"))
    await writeFile(
      metadataPath,
      matter.stringify(metadata.content, {
        ...metadata.data,
        source_mtime_ms: Number(metadata.data.source_mtime_ms) + 0.5,
      }),
      "utf8",
    )

    const refreshed = await readResource(project.path, "guide")
    expect(refreshed.status).toBe(RESOURCE_READY_STATUS)
  })

  test("resolves stale staging cover metadata to the promoted pack cover", async () => {
    await using project = await tmpdir({ git: true })
    const sourceRelpath = "guide.html"
    await writeFile(
      path.join(project.path, sourceRelpath),
      "<!doctype html><html><body><h1>Guide</h1><p>Start here.</p></body></html>",
      "utf8",
    )

    const addResponse = await app.request("/api/objects/resource", {
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

    const readyResource = await waitForResource(project.path, "guide")
    const packPath = requireString(readyResource.packPath, "pack path")
    await writeFile(path.join(project.path, packPath, "cover.jpg"), "fake-cover", "utf8")

    const metadataPath = path.join(project.path, packPath, RESOURCE_PACK_ENTRYPOINT_FILE_NAME)
    const metadata = matter(await readFile(metadataPath, "utf8"))
    await writeFile(
      metadataPath,
      matter.stringify(metadata.content, {
        ...metadata.data,
        cover_relpath: path.posix.join(
          path.posix.dirname(packPath),
          "pack-staging",
          "01TESTGENERATION0000000000",
          "cover.jpg",
        ),
      }),
      "utf8",
    )

    const refreshed = await readResource(project.path, "guide")
    expect(refreshed.coverRelpath).toBe(path.posix.join(packPath, "cover.jpg"))
  })

  test("marks copied workspace resources stale when the original file changes", async () => {
    await using project = await tmpdir({ git: true })
    const sourceRelpath = "guide.html"
    const sourcePath = path.join(project.path, sourceRelpath)
    await writeFile(
      sourcePath,
      "<!doctype html><html><body><h1>Guide</h1><p>Version one.</p></body></html>",
      "utf8",
    )

    const addResponse = await app.request("/api/objects/resource", {
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

    const readyResource = await waitForResource(project.path, "guide")
    expect(readyResource.status).toBe(RESOURCE_READY_STATUS)

    await Bun.sleep(5)
    await writeFile(
      sourcePath,
      "<!doctype html><html><body><h1>Guide</h1><p>Version two is longer.</p></body></html>",
      "utf8",
    )

    const staleResource = await readResource(project.path, "guide")
    expect(staleResource.status).toBe("stale")

    const rebuildResponse = await app.request("/api/objects/resource/by-key/guide/rebuild", {
      method: "POST",
      headers: {
        [DIRECTORY_HEADER]: project.path,
      },
    })
    expect(rebuildResponse.status).toBe(200)

    const rebuiltResource = await waitForResource(project.path, "guide")
    expect(rebuiltResource.status).toBe(RESOURCE_READY_STATUS)
    await expect(
      readFile(
        path.join(project.path, requireString(rebuiltResource.sourceRelpath, "sourceRelpath")),
        "utf8",
      ),
    ).resolves.toContain("Version two is longer.")
  })
})

async function readResource(directory: string, alias: string) {
  const listResponse = await app.request("/api/objects/resource", {
    headers: {
      [DIRECTORY_HEADER]: directory,
    },
  })
  expect(listResponse.status).toBe(200)
  const listed = requireJsonObject(await listResponse.json())
  const resources = requireJsonArray(listed.resources, "resource list")
  const resource = resources.find(
    (entry) => parsePromptString(parseJsonObject(entry)?.alias) === alias,
  )
  expect(resource).toBeDefined()
  return requireJsonObject(resource, `resource ${alias}`)
}

async function waitForResource(directory: string, alias: string) {
  for (let attempt = 0; attempt < RESOURCE_POLL_ATTEMPTS; attempt += 1) {
    const resource = await readResource(directory, alias)
    if (resource.status === RESOURCE_READY_STATUS) {
      return resource
    }
    await Bun.sleep(RESOURCE_POLL_DELAY_MS)
  }

  throw new Error(`Resource did not reach ${RESOURCE_READY_STATUS}: ${alias}`)
}
