import { createHash } from "node:crypto"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import {
  CATALOG_ICON_MAX_BYTES,
  readCatalogIcon,
} from "../../src/learning/skill-management/service/catalog-icon-cache"
import { catalogIconReleaseFilename } from "../../src/learning/skill-management/service/catalog-icon-reference"
import type { SkillCatalogEntry } from "../../src/learning/skill-management/service/library"

function webpBytes(label: string): Buffer {
  return Buffer.from(`RIFF0000WEBP${label}`, "ascii")
}

function iconResponse(bytes: Uint8Array): Response {
  return new Response(Uint8Array.from(bytes).buffer, {
    headers: { "content-type": "image/webp" },
  })
}

function iconEntry(bytes: Uint8Array): SkillCatalogEntry {
  const id = "sample-skill"
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  return {
    id,
    displayName: "Sample Skill",
    icon: {
      filename: catalogIconReleaseFilename(id, sha256),
      sha256,
    },
    summary: "Sample catalog skill.",
    categories: ["test"],
    tags: ["test"],
    source: {
      type: "github",
      repo: "example/skills",
      path: "skills/sample",
      ref: "a".repeat(40),
    },
    integrity: {
      algorithm: "tree-sha256-v1",
      sha256: "b".repeat(64),
      sizeBytes: 1,
      fileCount: 1,
    },
    review: {
      approvedAt: "2026-07-31T00:00:00.000Z",
      policyVersion: 1,
    },
    status: "approved",
  }
}

describe("catalog skill icon cache", () => {
  test("downloads, verifies, and reuses a content-addressed icon", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-catalog-icon-"))
    const bytes = webpBytes("verified")
    const entry = iconEntry(bytes)
    let fetchCount = 0

    const dependencies = {
      cacheRoot: () => root,
      readCatalogEntry: async () => entry,
      fetch: async () => {
        fetchCount += 1
        return iconResponse(bytes)
      },
    }

    const first = await readCatalogIcon(entry.id, entry.icon?.sha256 ?? "", dependencies)
    const second = await readCatalogIcon(entry.id, entry.icon?.sha256 ?? "", dependencies)

    expect(first.bytes).toEqual(bytes)
    expect(second.bytes).toEqual(bytes)
    expect(fetchCount).toBe(1)
    await expect(fsp.readFile(path.join(root, `${first.sha256}.webp`))).resolves.toEqual(bytes)
  })

  test("replaces a corrupt cache entry from the verified release asset", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-catalog-icon-corrupt-"))
    const bytes = webpBytes("replacement")
    const entry = iconEntry(bytes)
    const digest = entry.icon?.sha256 ?? ""
    await fsp.mkdir(root, { recursive: true })
    await fsp.writeFile(path.join(root, `${digest}.webp`), webpBytes("corrupt"))

    const icon = await readCatalogIcon(entry.id, digest, {
      cacheRoot: () => root,
      readCatalogEntry: async () => entry,
      fetch: async () => iconResponse(bytes),
    })

    expect(icon.bytes).toEqual(bytes)
    await expect(fsp.readFile(path.join(root, `${digest}.webp`))).resolves.toEqual(bytes)
  })

  test("rejects mismatched catalog and downloaded digests", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-catalog-icon-mismatch-"))
    const entry = iconEntry(webpBytes("expected"))
    const digest = entry.icon?.sha256 ?? ""

    await expect(
      readCatalogIcon(entry.id, digest, {
        cacheRoot: () => root,
        readCatalogEntry: async () => entry,
        fetch: async () => iconResponse(webpBytes("unexpected")),
      }),
    ).rejects.toThrow("integrity verification")
    await expect(fsp.stat(path.join(root, `${digest}.webp`))).rejects.toThrow()

    await expect(
      readCatalogIcon(entry.id, "c".repeat(64), {
        cacheRoot: () => root,
        readCatalogEntry: async () => entry,
      }),
    ).rejects.toThrow("not found")
  })

  test("stops reading a chunked icon when it exceeds the size limit", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-catalog-icon-oversize-"))
    const entry = iconEntry(webpBytes("expected"))
    const digest = entry.icon?.sha256 ?? ""
    const firstChunk = new Uint8Array(CATALOG_ICON_MAX_BYTES)
    firstChunk.set(webpBytes("oversize"))
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(firstChunk)
          controller.enqueue(new Uint8Array([0]))
          controller.close()
        },
      }),
      { headers: { "content-type": "image/webp" } },
    )

    await expect(
      readCatalogIcon(entry.id, digest, {
        cacheRoot: () => root,
        readCatalogEntry: async () => entry,
        fetch: async () => response,
      }),
    ).rejects.toThrow("allowed size")
    await expect(fsp.stat(path.join(root, `${digest}.webp`))).rejects.toThrow()
  })
})
