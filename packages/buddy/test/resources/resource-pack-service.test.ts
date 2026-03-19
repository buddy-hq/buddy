import { describe, expect, test } from "bun:test"
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js"
import matter from "gray-matter"
import path from "node:path"
import * as fs from "node:fs/promises"
import {
  classifyResourcePath,
  createResourcePackPaths,
  ensureResourcePack,
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ROOT_DIR,
  RESOURCE_PACK_STATUS_PREPARING,
  RESOURCE_PACK_STATUS_READY,
} from "../../src/resources/resource-pack-service"
import { tmpdir } from "../helpers/tmpdir"

describe("resource pack service", () => {
  test("classifies direct text and pack-worthy resources", () => {
    expect(classifyResourcePath("/workspace/notes.md").kind).toBe("direct")
    expect(classifyResourcePath("/workspace/notes.txt", 256 * 1024).kind).toBe("pack")
    expect(classifyResourcePath("/workspace/book.pdf").kind).toBe("pack")
  })

  test("writes and refreshes an HTML resource pack", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "guide.html")

    await fs.writeFile(
      sourcePath,
      [
        "<!doctype html>",
        "<html>",
        "<body>",
        "<h1>Guide</h1>",
        "<p>First section.</p>",
        "<h2>Details</h2>",
        "<p>Second section.</p>",
        "</body>",
        "</html>",
      ].join("\n"),
    )

    const first = await ensureResourcePack({
      directory: project.path,
      sourcePath,
    })

    expect(first.status).toBe(RESOURCE_PACK_STATUS_READY)
    expect(first.packRootPath).toContain(RESOURCE_PACK_ROOT_DIR)
    expect(await exists(first.entrypointPath)).toBe(true)
    expect(await exists(first.fullPath)).toBe(true)
    expect(await exists(first.tocPath ?? "")).toBe(true)
    expect(await exists(path.join(first.packRootPath, RESOURCE_PACK_CHUNKS_DIR_NAME))).toBe(true)

    const firstMetadata = matter(await fs.readFile(first.metadataPath, "utf8"))
    expect(firstMetadata.data).toMatchObject({
      source_path: sourcePath,
      source_relpath: "guide.html",
      format: "html",
      status: RESOURCE_PACK_STATUS_READY,
      extractor: "turndown",
    })
    expect(Number(firstMetadata.data.chunk_count)).toBeGreaterThan(0)
    expect(String(firstMetadata.content)).toContain("How to use this pack")

    const firstFull = await fs.readFile(first.fullPath, "utf8")
    const firstToc = await fs.readFile(first.tocPath!, "utf8")
    expect(firstFull).toContain("Guide")
    expect(firstToc).toContain("Details")
    expect(await fs.readdir(path.join(first.packRootPath, RESOURCE_PACK_CHUNKS_DIR_NAME))).not.toHaveLength(0)

    const originalMetadata = await fs.readFile(first.metadataPath, "utf8")
    const originalFull = await fs.readFile(first.fullPath, "utf8")

    const cached = await ensureResourcePack({
      directory: project.path,
      sourcePath,
    })

    expect(cached.packKey).toBe(first.packKey)
    expect(await fs.readFile(cached.metadataPath, "utf8")).toBe(originalMetadata)
    expect(await fs.readFile(cached.fullPath, "utf8")).toBe(originalFull)

    await fs.writeFile(
      sourcePath,
      [
        "<!doctype html>",
        "<html>",
        "<body>",
        "<h1>Guide</h1>",
        "<p>First section.</p>",
        "<h2>Details</h2>",
        "<p>Second section.</p>",
        "<h2>Appendix</h2>",
        "<p>New material.</p>",
        "</body>",
        "</html>",
      ].join("\n"),
    )

    const refreshed = await ensureResourcePack({
      directory: project.path,
      sourcePath,
    })

    const refreshedMetadataBody = await fs.readFile(refreshed.metadataPath, "utf8")
    const refreshedMetadata = matter(refreshedMetadataBody)
    expect(refreshedMetadataBody).not.toBe(originalMetadata)
    expect(String(refreshedMetadata.content)).toContain("How to use this pack")
    expect(await fs.readFile(refreshed.fullPath, "utf8")).toContain("Appendix")
    expect(await fs.readFile(refreshed.tocPath!, "utf8")).toContain("Appendix")
  })

  test("extracts EPUB content and toc data", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "manual.epub")

    await writeEpubFixture(sourcePath)

    const pack = await ensureResourcePack({
      directory: project.path,
      sourcePath,
    })

    expect(pack.status).toBe(RESOURCE_PACK_STATUS_READY)
    expect(await exists(pack.entrypointPath)).toBe(true)
    expect(await exists(pack.fullPath)).toBe(true)
    expect(await exists(pack.tocPath ?? "")).toBe(true)

    const metadata = matter(await fs.readFile(pack.metadataPath, "utf8"))
    expect(metadata.data).toMatchObject({
      source_path: sourcePath,
      format: "epub",
      status: RESOURCE_PACK_STATUS_READY,
      extractor: "@zip.js/zip.js + fast-xml-parser + turndown",
    })

    const fullText = await fs.readFile(pack.fullPath, "utf8")
    const tocText = await fs.readFile(pack.tocPath!, "utf8")
    const chunkFiles = await fs.readdir(path.join(pack.packRootPath, RESOURCE_PACK_CHUNKS_DIR_NAME))
    expect(fullText).toContain("Opening chapter")
    expect(fullText).toContain("Closing chapter")
    expect(tocText).toContain("Chapter One")
    expect(tocText).toContain("Chapter Two")
    expect(chunkFiles.length).toBeGreaterThanOrEqual(2)
  })

  test("rebuilds packs when fresh metadata is stuck in preparing state", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "guide.html")
    await fs.writeFile(sourcePath, "<!doctype html><html><body><h1>Guide</h1><p>Body</p></body></html>")
    const sourceStat = await fs.stat(sourcePath)
    const packPaths = createResourcePackPaths(project.path, sourcePath)

    await fs.mkdir(packPaths.rootPath, { recursive: true })
    await fs.writeFile(
      packPaths.metadataPath,
      matter.stringify("# Resource", {
        source_path: sourcePath,
        source_relpath: "guide.html",
        format: "html",
        status: RESOURCE_PACK_STATUS_PREPARING,
        extractor: "pending",
        prepared_at: new Date().toISOString(),
        source_mtime_ms: Number(sourceStat.mtimeMs),
        source_size_bytes: Number(sourceStat.size),
        chunk_count: 0,
        warnings: ["The resource is still being prepared."],
      }),
    )

    const pack = await ensureResourcePack({
      directory: project.path,
      sourcePath,
    })

    expect(pack.status).toBe(RESOURCE_PACK_STATUS_READY)
    expect(await exists(pack.fullPath)).toBe(true)
  })

  test("rebuilds packs when fresh metadata is stuck in error state", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "guide.html")
    await fs.writeFile(sourcePath, "<!doctype html><html><body><h1>Guide</h1><p>Body</p></body></html>")
    const sourceStat = await fs.stat(sourcePath)
    const packPaths = createResourcePackPaths(project.path, sourcePath)

    await fs.mkdir(packPaths.rootPath, { recursive: true })
    await fs.writeFile(
      packPaths.metadataPath,
      matter.stringify("# Resource", {
        source_path: sourcePath,
        source_relpath: "guide.html",
        format: "html",
        status: "error",
        extractor: "error",
        prepared_at: new Date().toISOString(),
        source_mtime_ms: Number(sourceStat.mtimeMs),
        source_size_bytes: Number(sourceStat.size),
        chunk_count: 0,
        warnings: ["prior failure"],
      }),
    )

    const pack = await ensureResourcePack({
      directory: project.path,
      sourcePath,
    })

    expect(pack.status).toBe(RESOURCE_PACK_STATUS_READY)
    expect(await exists(pack.fullPath)).toBe(true)
  })

  test("uses explicit nav metadata when EPUB manifest lists chapter files first", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "ordered-manifest.epub")

    await writeEpubFixture(sourcePath, { navAfterChapters: true })

    const pack = await ensureResourcePack({
      directory: project.path,
      sourcePath,
    })

    const tocText = await fs.readFile(pack.tocPath!, "utf8")
    expect(tocText).toContain("Chapter One")
    expect(tocText).toContain("Chapter Two")
  })

  test("extracts NCX toc data when nav XHTML is missing", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "ncx-only.epub")

    await writeEpubFixture(sourcePath, { tocFormat: "ncx" })

    const pack = await ensureResourcePack({
      directory: project.path,
      sourcePath,
    })

    const tocText = await fs.readFile(pack.tocPath!, "utf8")
    expect(tocText).toContain("Chapter One")
    expect(tocText).toContain("Chapter Two")
  })

  test("isolates concurrent pack builds across workspaces with identical relpaths", async () => {
    await using projectA = await tmpdir({ git: true })
    await using projectB = await tmpdir({ git: true })
    const sourcePathA = path.join(projectA.path, "guide.html")
    const sourcePathB = path.join(projectB.path, "guide.html")

    await Promise.all([
      fs.writeFile(sourcePathA, "<!doctype html><html><body><h1>A guide</h1></body></html>"),
      fs.writeFile(sourcePathB, "<!doctype html><html><body><h1>B guide</h1></body></html>"),
    ])

    const [packA, packB] = await Promise.all([
      ensureResourcePack({
        directory: projectA.path,
        sourcePath: sourcePathA,
      }),
      ensureResourcePack({
        directory: projectB.path,
        sourcePath: sourcePathB,
      }),
    ])

    expect(packA.status).toBe(RESOURCE_PACK_STATUS_READY)
    expect(packB.status).toBe(RESOURCE_PACK_STATUS_READY)
    expect(await exists(packA.entrypointPath)).toBe(true)
    expect(await exists(packB.entrypointPath)).toBe(true)
  })
})

async function writeEpubFixture(
  filepath: string,
  input?: {
    navAfterChapters?: boolean
    tocFormat?: "nav" | "ncx"
  },
) {
  const tocFormat = input?.tocFormat ?? "nav"
  const tocManifestEntry =
    tocFormat === "ncx"
      ? '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
      : '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
  const manifestEntries = input?.navAfterChapters
    ? [
        '<item id="chapter-one" href="chapter-one.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="chapter-two" href="chapter-two.xhtml" media-type="application/xhtml+xml"/>',
        tocManifestEntry,
      ]
    : [
        tocManifestEntry,
        '<item id="chapter-one" href="chapter-one.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="chapter-two" href="chapter-two.xhtml" media-type="application/xhtml+xml"/>',
      ]
  const zipFileWriter = new BlobWriter()
  const zipWriter = new ZipWriter(zipFileWriter)

  await zipWriter.add("mimetype", new TextReader("application/epub+zip"), {
    level: 0,
  })
  await zipWriter.add(
    "META-INF/container.xml",
    new TextReader(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
        "<rootfiles>",
        '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>',
        "</rootfiles>",
        "</container>",
      ].join(""),
    ),
  )
  await zipWriter.add(
    "OEBPS/content.opf",
    new TextReader(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">',
        "<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">",
        "<dc:title>Manual</dc:title>",
        "</metadata>",
        "<manifest>",
        ...manifestEntries,
        "</manifest>",
        `<spine toc="${tocFormat === "ncx" ? "ncx" : "nav"}">`,
        '<itemref idref="chapter-one"/>',
        '<itemref idref="chapter-two"/>',
        "</spine>",
        "</package>",
      ].join(""),
    ),
  )
  if (tocFormat === "nav") {
    await zipWriter.add(
      "OEBPS/nav.xhtml",
      new TextReader(
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<html xmlns="http://www.w3.org/1999/xhtml">',
          "<head><title>Manual</title></head>",
          "<body>",
          "<nav epub:type=\"toc\">",
          "<ol>",
          '<li><a href="chapter-one.xhtml">Chapter One</a></li>',
          '<li><a href="chapter-two.xhtml">Chapter Two</a></li>',
          "</ol>",
          "</nav>",
          "</body>",
          "</html>",
        ].join(""),
      ),
    )
  } else {
    await zipWriter.add(
      "OEBPS/toc.ncx",
      new TextReader(
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">',
          "<head></head>",
          "<docTitle><text>Manual</text></docTitle>",
          "<navMap>",
          '<navPoint id="navPoint-1" playOrder="1">',
          "<navLabel><text>Chapter One</text></navLabel>",
          '<content src="chapter-one.xhtml"/>',
          "</navPoint>",
          '<navPoint id="navPoint-2" playOrder="2">',
          "<navLabel><text>Chapter Two</text></navLabel>",
          '<content src="chapter-two.xhtml"/>',
          "</navPoint>",
          "</navMap>",
          "</ncx>",
        ].join(""),
      ),
    )
  }
  await zipWriter.add(
    "OEBPS/chapter-one.xhtml",
    new TextReader(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<html xmlns="http://www.w3.org/1999/xhtml">',
        "<body>",
        "<h1>Chapter One</h1>",
        "<p>Opening chapter.</p>",
        "</body>",
        "</html>",
      ].join(""),
    ),
  )
  await zipWriter.add(
    "OEBPS/chapter-two.xhtml",
    new TextReader(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<html xmlns="http://www.w3.org/1999/xhtml">',
        "<body>",
        "<h1>Chapter Two</h1>",
        "<p>Closing chapter.</p>",
        "</body>",
        "</html>",
      ].join(""),
    ),
  )

  await Bun.write(filepath, await zipWriter.close())
}

async function exists(filepath: string) {
  return fs.stat(filepath).then(() => true).catch(() => false)
}
